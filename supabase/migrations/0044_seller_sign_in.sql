-- 0044: seller sign-in details.
--
-- A seller is created with only a Seller ID and a temporary password (must_change_password = true). From the
-- Account page they then add and verify their own email, and choose their own password. After that they can sign
-- in with either their Seller ID or their email.
--
-- The Supabase auth user keeps its internal address (<seller id>@sellers.epicmkt.app). The seller's real email
-- lives here on the business row, so changing it never touches auth and the Seller ID keeps working.
--
--   login_email              lower-cased; unique among live businesses; only ever set by an edge function after a code
--                            sent to that address was entered (sellers cannot write businesses directly)
--   login_email_verified_at  when the seller proved they own it
--   password_changed_at      when the seller last chose a password themselves (null = still on the one we sent)
--
-- OTP codes can now go to SMS (Africa's Talking) or email (Resend). seller_otps records which channel was used and,
-- for 'verify_email', which address the code was sent to, so a code for one address can never confirm another.

alter table public.businesses
  add column if not exists login_email text,
  add column if not exists login_email_verified_at timestamptz,
  add column if not exists password_changed_at timestamptz;

do $$
begin
  alter table public.businesses add constraint businesses_login_email_format
    check (login_email is null or (login_email = lower(login_email) and login_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'));
exception when duplicate_object then null;
end $$;

create unique index if not exists businesses_login_email_key
  on public.businesses (login_email) where login_email is not null and status <> 'deleted';

alter table public.seller_otps drop constraint if exists seller_otps_purpose_check;
alter table public.seller_otps add constraint seller_otps_purpose_check
  check (purpose in ('forgot_password', 'change_password', 'verify_email'));
alter table public.seller_otps add column if not exists channel text not null default 'sms';
alter table public.seller_otps drop constraint if exists seller_otps_channel_check;
alter table public.seller_otps add constraint seller_otps_channel_check check (channel in ('sms', 'email'));
alter table public.seller_otps add column if not exists target text;

drop function if exists public.seller_otp_issue(uuid, text, text);

create or replace function public.seller_otp_issue(p_business uuid, p_purpose text, p_code text, p_channel text default 'sms', p_target text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_last timestamptz;
  v_hour integer;
  v_id uuid := gen_random_uuid();
begin
  p_channel := coalesce(p_channel, 'sms'); -- an explicit null means the default, not "no channel"
  if p_purpose not in ('forgot_password', 'change_password', 'verify_email') or p_code !~ '^[0-9]{6}$' or p_channel not in ('sms', 'email') then
    raise exception 'invalid_otp_request';
  end if;
  if p_purpose = 'verify_email' and (p_channel <> 'email' or p_target is null) then raise exception 'invalid_otp_request'; end if;
  perform pg_advisory_xact_lock(hashtext(p_business::text || 'otp:' || p_purpose));
  select max(o.created_at), count(*) filter (where o.created_at > now() - interval '1 hour')
    into v_last, v_hour from public.seller_otps o where o.business_id = p_business and o.purpose = p_purpose;
  if v_last is not null and v_last > now() - interval '60 seconds' then
    return jsonb_build_object('ok', false, 'reason', 'resend_wait', 'retry_after', ceil(extract(epoch from (v_last + interval '60 seconds' - now())))::integer);
  end if;
  if v_hour >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'hour_limit', 'retry_after', 3600);
  end if;
  update public.seller_otps o set used = true where o.business_id = p_business and o.purpose = p_purpose and not o.used;
  insert into public.seller_otps (id, business_id, purpose, channel, target, code_hash, expires_at)
  values (v_id, p_business, p_purpose, p_channel, lower(p_target), encode(digest(v_id::text || ':' || p_code, 'sha256'), 'hex'), now() + interval '10 minutes');
  return jsonb_build_object('ok', true);
end $$;

-- On success also returns the channel and target the code was issued for.
create or replace function public.seller_otp_verify(p_business uuid, p_purpose text, p_code text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r public.seller_otps;
begin
  select * into r from public.seller_otps o
  where o.business_id = p_business and o.purpose = p_purpose and not o.used and o.expires_at > now()
  order by o.created_at desc limit 1 for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  if r.attempts >= 5 then return jsonb_build_object('ok', false, 'reason', 'attempts'); end if;
  update public.seller_otps o set attempts = o.attempts + 1 where o.id = r.id;
  if r.code_hash = encode(digest(r.id::text || ':' || coalesce(p_code, ''), 'sha256'), 'hex') then
    update public.seller_otps o set used = true where o.id = r.id;
    return jsonb_build_object('ok', true, 'channel', r.channel, 'target', r.target);
  end if;
  return jsonb_build_object('ok', false, 'reason', 'invalid');
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['seller_otp_issue(uuid, text, text, text, text)', 'seller_otp_verify(uuid, text, text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;
