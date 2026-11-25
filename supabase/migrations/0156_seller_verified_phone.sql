-- 0156: a seller can change the phone number on their listing by proving they hold the new number.
--
-- Until now a phone change was only a request an admin had to confirm (seller_request_change). That stays as the way out for a
-- seller who cannot sign in or cannot receive an SMS. This adds the direct way:
--
--   1. the seller asks for a code for the NEW number (purpose 'verify_phone'); an SMS goes to that number, not to the old one,
--   2. they enter the code and their current password; the edge function seller-set-phone saves the number.
--
-- seller_otps already remembers the address a verify_email code was sent to (target). The same column now holds the phone number a
-- verify_phone code was sent to, so a code for one number can never confirm another.
--
-- seller_set_verified_phone does the write in one transaction and is callable by the service role only (sellers cannot write
-- businesses directly): it normalises the number, refuses the number they already have, saves it, and cancels any admin request for
-- a phone change that was still waiting, so that request can never be approved later and overwrite the number just verified.

alter table public.seller_otps drop constraint if exists seller_otps_purpose_check;
alter table public.seller_otps add constraint seller_otps_purpose_check
  check (purpose in ('forgot_password', 'change_password', 'verify_email', 'verify_phone'));

create or replace function public.seller_otp_issue(p_business uuid, p_purpose text, p_code text, p_channel text default 'sms', p_target text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_last timestamptz;
  v_hour integer;
  v_id uuid := gen_random_uuid();
begin
  p_channel := coalesce(p_channel, 'sms'); -- an explicit null means the default, not "no channel"
  if p_purpose not in ('forgot_password', 'change_password', 'verify_email', 'verify_phone') or p_code !~ '^[0-9]{6}$' or p_channel not in ('sms', 'email') then
    raise exception 'invalid_otp_request';
  end if;
  if p_purpose = 'verify_email' and (p_channel <> 'email' or p_target is null) then raise exception 'invalid_otp_request'; end if;
  if p_purpose = 'verify_phone' and (p_channel <> 'sms' or p_target is null or public.normalize_phone_ke(p_target) is null) then raise exception 'invalid_otp_request'; end if;
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

-- Saves a phone number the seller has just proved they hold. Returns { ok, phone, previous } or { ok: false, reason }.
create or replace function public.seller_set_verified_phone(p_business uuid, p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_new text := public.normalize_phone_ke(p_phone);
  v_old text;
  v_cancelled integer;
begin
  if v_new is null then return jsonb_build_object('ok', false, 'reason', 'invalid_phone'); end if;
  select b.phone into v_old from public.businesses b where b.id = p_business and b.status <> 'deleted' for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_old is not distinct from v_new then return jsonb_build_object('ok', false, 'reason', 'no_change'); end if;

  update public.businesses set phone = v_new where id = p_business;
  update public.change_requests c set status = 'cancelled', decided_at = now()
   where c.business_id = p_business and c.field = 'phone' and c.status = 'pending';
  get diagnostics v_cancelled = row_count;
  return jsonb_build_object('ok', true, 'phone', v_new, 'previous', v_old, 'cancelledRequests', v_cancelled);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['seller_otp_issue(uuid, text, text, text, text)', 'seller_set_verified_phone(uuid, text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;
