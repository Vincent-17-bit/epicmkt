-- Subscription, payments, notifications and admin questions (seller portal phase S1).
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Calendar helpers (Africa/Nairobi days, mirror shared/src/billing.js)
-- ---------------------------------------------------------------------------
create or replace function public.nairobi_day(p_ts timestamptz) returns date
language sql stable as $$ select (p_ts at time zone 'Africa/Nairobi')::date $$;

create or replace function public.nairobi_midnight(p_day date) returns timestamptz
language sql stable as $$ select p_day::timestamp at time zone 'Africa/Nairobi' $$;

-- 31 Jan -> 28 Feb (29 Feb in a leap year); Postgres clamps to the end of the month.
create or replace function public.add_calendar_month(p_day date, p_n integer default 1) returns date
language sql immutable as $$ select (p_day + make_interval(months => p_n))::date $$;

-- active until the end of paid_until's day, then one day of grace, then expired.
create or replace function public.listing_state(p_paid timestamptz, p_now timestamptz default now()) returns text
language sql stable as $$
  select case
    when p_paid is null then 'none'
    when public.nairobi_day(p_now) <= public.nairobi_day(p_paid) then 'active'
    when public.nairobi_day(p_now) <= public.nairobi_day(p_paid) + 1 then 'grace'
    else 'expired'
  end $$;

create or replace function public.days_left(p_paid timestamptz, p_now timestamptz default now()) returns integer
language sql stable as $$ select case when p_paid is null then null else public.nairobi_day(p_paid) - public.nairobi_day(p_now) end $$;

-- A dearer category: the prorated difference for the days left in the current month is due now.
-- A cheaper (or equal) one costs nothing now. The new monthly price applies from the next renewal.
create or replace function public.category_change_quote(p_old integer, p_new integer, p_paid timestamptz, p_now timestamptz default now()) returns jsonb
language plpgsql stable as $$
declare
  v_end date;
  v_days integer;
  v_left integer;
begin
  if p_new <= p_old or p_paid is null then
    return jsonb_build_object('extraDueNow', 0, 'appliesFromNextRenewal', true, 'newMonthlyPrice', p_new);
  end if;
  v_end := public.nairobi_day(p_paid);
  v_days := v_end - public.add_calendar_month(v_end, -1);
  v_left := least(v_days, greatest(0, v_end - public.nairobi_day(p_now)));
  return jsonb_build_object(
    'extraDueNow', ceil(((p_new - p_old)::numeric * v_left) / v_days)::integer,
    'appliesFromNextRenewal', true,
    'newMonthlyPrice', p_new);
end $$;

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
create sequence if not exists public.receipt_seq;

create or replace function public.next_receipt_no(p_ts timestamptz default now()) returns text
language sql volatile as $$
  select 'EPM-R-' || to_char(p_ts at time zone 'Africa/Nairobi', 'YYYY') || '-' || lpad(nextval('public.receipt_seq')::text, 6, '0') $$;

alter table public.payments
  add column if not exists status text not null default 'confirmed' check (status in ('submitted','confirmed','rejected')),
  add column if not exists kind text not null default 'renewal' check (kind in ('first','renewal','upgrade','category_change')),
  add column if not exists mpesa_code text check (mpesa_code ~ '^[A-Z0-9]{10}$'),
  add column if not exists plan_key text check (plan_key in ('standard','premium')),
  add column if not exists category_id text references public.categories(id),
  add column if not exists change_request_id uuid,
  add column if not exists account_ref text,
  add column if not exists source text not null default 'admin' check (source in ('seller','auto','admin')),
  add column if not exists confirmed_via text check (confirmed_via in ('admin','auto')),
  add column if not exists decline_reason text check (char_length(decline_reason) <= 300),
  add column if not exists receipt_no text,
  add column if not exists submitted_at timestamptz,
  add column if not exists confirmed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- Rows recorded by the admin before this migration were already received.
update public.payments set confirmed_at = created_at where status = 'confirmed' and confirmed_at is null;
update public.payments set mpesa_code = upper(reference) where mpesa_code is null and reference ~ '^[A-Za-z0-9]{10}$';
update public.payments set receipt_no = public.next_receipt_no(created_at) where status = 'confirmed' and receipt_no is null;

create unique index if not exists payments_receipt_no_key on public.payments (receipt_no) where receipt_no is not null;
-- One business cannot reuse another's code (and a code cannot be paid twice); a rejected code is free again.
create unique index if not exists payments_mpesa_code_key on public.payments (mpesa_code) where mpesa_code is not null and status <> 'rejected';
create index if not exists payments_status_idx on public.payments (business_id, status);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_change_request_fk') then
    alter table public.payments add constraint payments_change_request_fk
      foreign key (change_request_id) references public.change_requests(id) on delete set null;
  end if;
end $$;

create or replace function public.payments_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if new.status = 'confirmed' then
    if new.receipt_no is null then new.receipt_no := public.next_receipt_no(now()); end if;
    if new.confirmed_at is null then new.confirmed_at := now(); end if;
  end if;
  if tg_op = 'UPDATE' and old.status = 'confirmed' and new.status <> 'confirmed' then
    raise exception 'payment_already_confirmed' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists t_payments_stamp on public.payments;
create trigger t_payments_stamp before insert or update on public.payments for each row execute function public.payments_stamp();

-- ---------------------------------------------------------------------------
-- Messages: type, data, de-duplication
-- ---------------------------------------------------------------------------
alter table public.messages
  add column if not exists kind text not null default 'general'
    check (kind in ('approval','reminder','grace','expiry','change','removal','strike','report','payment','question','general')),
  add column if not exists data jsonb not null default '{}',
  add column if not exists dedupe_key text;
create unique index if not exists messages_dedupe_key on public.messages (business_id, dedupe_key) where dedupe_key is not null;
create index if not exists messages_unread_idx on public.messages (business_id) where read_at is null;

create or replace function public.post_seller_message(p_business uuid, p_kind text, p_subject text, p_body text, p_data jsonb default '{}', p_dedupe text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into public.messages (business_id, kind, subject, body, data, dedupe_key)
  values (p_business, p_kind, left(p_subject, 150), left(p_body, 4000), coalesce(p_data, '{}'), p_dedupe)
  on conflict (business_id, dedupe_key) where dedupe_key is not null do nothing;
  return found;
end $$;
revoke all on function public.post_seller_message(uuid, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.post_seller_message(uuid, text, text, text, jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- Change requests: category quotes
-- ---------------------------------------------------------------------------
alter table public.change_requests
  add column if not exists extra_due_kes integer not null default 0 check (extra_due_kes >= 0),
  add column if not exists new_monthly_price integer,
  add column if not exists applies_from_next_renewal boolean not null default true;

-- ---------------------------------------------------------------------------
-- Flags: questions to the seller
-- ---------------------------------------------------------------------------
alter table public.flags
  add column if not exists seller_message text check (seller_message is null or char_length(seller_message) between 3 and 500),
  add column if not exists due_at timestamptz,
  add column if not exists faq_id uuid references public.faqs(id) on delete cascade;
create index if not exists flags_seller_questions_idx on public.flags (business_id, created_at desc) where seller_message is not null;

create or replace function public.flags_stamp() returns trigger
language plpgsql as $$
begin
  if new.status = 'resolved' and new.resolved_at is null then new.resolved_at := now(); end if;
  if new.status <> 'resolved' then new.resolved_at := null; end if;
  return new;
end $$;
drop trigger if exists t_flags_stamp on public.flags;
create trigger t_flags_stamp before insert or update on public.flags for each row execute function public.flags_stamp();

create table if not exists public.flag_attachments (
  id uuid primary key default gen_random_uuid(),
  flag_id uuid not null references public.flags(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  path text not null unique,
  original_name text not null check (char_length(original_name) between 1 and 120),
  mime text not null check (mime in ('application/pdf','image/jpeg','image/png','image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 8388608),
  status text not null default 'pending' check (status in ('pending','ready')),
  created_at timestamptz not null default now()
);
create index if not exists flag_attachments_flag_idx on public.flag_attachments (flag_id);
create index if not exists flag_attachments_business_idx on public.flag_attachments (business_id);

create or replace function public.flag_attachments_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.flag_id::text || 'flag_attachments'));
  if (select count(*) from public.flag_attachments a where a.flag_id = new.flag_id) >= 3 then
    raise exception 'attachments_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists t_flag_attachments_limit on public.flag_attachments;
create trigger t_flag_attachments_limit before insert on public.flag_attachments for each row execute function public.flag_attachments_limit();

alter table public.flag_attachments enable row level security;
drop policy if exists "seller reads own flag attachments" on public.flag_attachments;
create policy "seller reads own flag attachments" on public.flag_attachments for select to authenticated using (business_id = public.my_business_id());
drop policy if exists "admin all flag attachments" on public.flag_attachments;
create policy "admin all flag attachments" on public.flag_attachments for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Sellers see names, types and sizes only: never the storage path. Writes happen in edge functions (service role).
revoke all on public.flag_attachments from public, anon, authenticated;
grant select (id, flag_id, business_id, original_name, mime, size_bytes, status, created_at) on public.flag_attachments to authenticated;
grant all on public.flag_attachments to service_role;

-- Private bucket, no policy for any user: objects are written through one-time signed upload URLs
-- and read only through short-lived signed URLs minted by an edge function.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('seller-proofs', 'seller-proofs', false, 8388608, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Proofs are deleted 90 days after the flag is resolved; unfinished uploads after one hour.
create or replace function public.proofs_due_for_purge(p_now timestamptz default now()) returns table (id uuid, path text)
language sql stable security definer set search_path = public as $$
  select a.id, a.path
  from public.flag_attachments a join public.flags f on f.id = a.flag_id
  where (f.status = 'resolved' and f.resolved_at < p_now - interval '90 days')
     or (a.status = 'pending' and a.created_at < p_now - interval '1 hour') $$;
revoke all on function public.proofs_due_for_purge(timestamptz) from public, anon, authenticated;
grant execute on function public.proofs_due_for_purge(timestamptz) to service_role;

-- Reply: 2 to 500 characters of plain text; attached proofs must be finalized (checked) first.
create or replace function public.seller_reply_flag(p_flag uuid, p_reply text) returns public.flags
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_reply text := btrim(coalesce(p_reply, ''));
  r public.flags;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if char_length(v_reply) not between 2 and 500 or v_reply ~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]' then raise exception 'invalid_reply'; end if;
  select * into r from public.flags f where f.id = p_flag and f.business_id = v_id and f.status = 'open' for update;
  if not found then raise exception 'not_found_or_not_open'; end if;
  if exists (select 1 from public.flag_attachments a where a.flag_id = p_flag and a.status = 'pending') then
    raise exception 'attachments_pending';
  end if;
  update public.flags f set seller_reply = v_reply, replied_at = now(), status = 'replied' where f.id = p_flag returning * into r;
  perform public.write_audit(v_id, 'flag_replied', 'flag', r.id::text,
    jsonb_build_object('attachments', (select count(*) from public.flag_attachments a where a.flag_id = p_flag)));
  perform public.notify_admin('flag_reply', v_id, jsonb_build_object('flag_id', r.id));
  return r;
end $$;
revoke all on function public.seller_reply_flag(uuid, text) from public, anon;
grant execute on function public.seller_reply_flag(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- What to pay: the account number and exact amount, always computed on the server
-- ---------------------------------------------------------------------------
create or replace function public.payment_quote(p_b public.businesses, p_purpose text, p_target text, p_category text, p_now timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_purpose text := p_purpose;
  v_old integer;
  v_new integer;
  v_app public.applications;
  v_state text := public.listing_state(p_b.paid_until, p_now);
  v_amount integer;
  v_account text := p_b.seller_id;
  v_plan text := p_b.plan_key;
  v_cat text := p_b.category_id;
  v_quote jsonb;
begin
  select p.price_kes into v_old from public.plans p where p.category_id = p_b.category_id and p.plan_key = p_b.plan_key;
  if v_purpose is null then
    v_purpose := case when p_b.paid_until is null and not exists (select 1 from public.payments x where x.business_id = p_b.id and x.status = 'confirmed') then 'first' else 'renewal' end;
  end if;
  if v_purpose = 'first' then
    select * into v_app from public.applications a where a.id = p_b.application_id;
    v_amount := coalesce(v_app.price_at_submission, v_old);
    v_account := coalesce(v_app.reference_no, p_b.seller_id);
  elsif v_purpose = 'renewal' then
    v_amount := v_old;
  elsif v_purpose = 'upgrade' then
    if p_b.plan_key <> 'standard' or p_target is distinct from 'premium' then raise exception 'invalid_upgrade'; end if;
    if v_state <> 'active' then raise exception 'renew_first'; end if;
    select p.price_kes into v_new from public.plans p where p.category_id = p_b.category_id and p.plan_key = 'premium';
    if v_new is null then raise exception 'invalid_upgrade'; end if;
    v_quote := public.category_change_quote(v_old, v_new, p_b.paid_until, p_now);
    v_amount := (v_quote ->> 'extraDueNow')::integer;
    v_plan := 'premium';
  elsif v_purpose = 'category_change' then
    select p.price_kes into v_new from public.plans p where p.category_id = p_category and p.plan_key = p_b.plan_key;
    if v_new is null then raise exception 'invalid_category'; end if;
    if v_new > coalesce(v_old, 0) and v_state <> 'active' then raise exception 'renew_first'; end if;
    v_quote := public.category_change_quote(coalesce(v_old, 0), v_new, p_b.paid_until, p_now);
    v_amount := (v_quote ->> 'extraDueNow')::integer;
    v_cat := p_category;
  else
    raise exception 'invalid_purpose';
  end if;
  return jsonb_build_object('purpose', v_purpose, 'amount_kes', v_amount, 'account', v_account, 'plan_key', v_plan, 'category_id', v_cat,
    'listing_state', v_state, 'quote', v_quote);
end $$;
revoke all on function public.payment_quote(public.businesses, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.payment_quote(public.businesses, text, text, text, timestamptz) to service_role;

create or replace function public.seller_payment_instructions(p_purpose text default null, p_target_plan text default null, p_category text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_b public.businesses;
  v_q jsonb;
  v_m jsonb;
  v_ok boolean;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select * into v_b from public.businesses where id = v_id;
  v_q := public.payment_quote(v_b, p_purpose, p_target_plan, p_category);
  select s.value into v_m from public.site_settings s where s.key = 'mpesa';
  v_ok := v_m is not null and coalesce(btrim(v_m ->> 'number'), '') <> '';
  return v_q || jsonb_build_object(
    'configured', v_ok,
    'method', case when v_ok then coalesce(v_m ->> 'type', 'paybill') end,
    'number', case when v_ok then v_m ->> 'number' end,
    'name', case when v_ok then v_m ->> 'name' end,
    'has_open_submission', exists (select 1 from public.payments x where x.business_id = v_id and x.status = 'submitted'));
end $$;

create or replace function public.seller_quote_category_change(p_category text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_b public.businesses;
  v_old integer;
  v_new integer;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select * into v_b from public.businesses where id = v_id;
  if not exists (select 1 from public.categories c where c.id = p_category and c.active) then raise exception 'invalid_category'; end if;
  select p.price_kes into v_old from public.plans p where p.category_id = v_b.category_id and p.plan_key = v_b.plan_key;
  select p.price_kes into v_new from public.plans p where p.category_id = p_category and p.plan_key = v_b.plan_key;
  if v_new is null then raise exception 'invalid_category'; end if;
  return public.category_change_quote(coalesce(v_old, 0), v_new, v_b.paid_until)
    || jsonb_build_object('oldMonthlyPrice', v_old, 'dearer', v_new > coalesce(v_old, 0), 'listingState', public.listing_state(v_b.paid_until));
end $$;

-- "I have paid": records the M-Pesa code (status submitted) for the admin or the automatic matcher.
create or replace function public.seller_submit_payment(p_code text, p_purpose text default null, p_target_plan text default null, p_category text default null, p_change_id uuid default null) returns public.payments
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_b public.businesses;
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_q jsonb;
  r public.payments;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if v_code !~ '^[A-Z0-9]{10}$' then raise exception 'invalid_code_format'; end if;
  perform pg_advisory_xact_lock(hashtext(v_id::text || 'payments'));
  select * into v_b from public.businesses where id = v_id;

  select * into r from public.payments x where x.mpesa_code = v_code and x.status <> 'rejected';
  if found then
    if r.business_id = v_id then return r; end if;
    raise exception 'code_already_used';
  end if;
  if exists (select 1 from public.payments x where x.business_id = v_id and x.status = 'submitted') then
    raise exception 'payment_already_submitted';
  end if;

  v_q := public.payment_quote(v_b, p_purpose, p_target_plan, p_category);
  if (v_q ->> 'amount_kes')::integer <= 0 then raise exception 'nothing_to_pay'; end if;
  if (v_q ->> 'purpose') = 'category_change' then
    if p_change_id is null or not exists (select 1 from public.change_requests c where c.id = p_change_id and c.business_id = v_id and c.status = 'pending' and c.field = 'category_id' and c.new_value = p_category) then
      raise exception 'change_not_found';
    end if;
  end if;

  begin
    insert into public.payments (business_id, amount_kes, method, reference, mpesa_code, status, kind, plan_key, category_id, change_request_id, account_ref, source, submitted_at)
    values (v_id, (v_q ->> 'amount_kes')::integer, 'mpesa', v_code, v_code, 'submitted', v_q ->> 'purpose', v_q ->> 'plan_key', v_q ->> 'category_id',
            case when (v_q ->> 'purpose') = 'category_change' then p_change_id end, v_q ->> 'account', 'seller', now())
    returning * into r;
  exception when unique_violation then
    raise exception 'code_already_used';
  end;
  perform public.write_audit(v_id, 'payment_submitted', 'payment', r.id::text, jsonb_build_object('kind', r.kind, 'amount', r.amount_kes));
  perform public.notify_admin('payment_submitted', v_id, jsonb_build_object('payment_id', r.id, 'kind', r.kind));
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- Confirmation: the single place that moves money into paid_until.
-- The admin button and the automatic matcher both end here, so the UI never changes.
-- ---------------------------------------------------------------------------
create or replace function public.payment_apply_confirmation(p_id uuid, p_via text default 'admin', p_now timestamptz default now()) returns public.payments
language plpgsql security definer set search_path = public as $$
declare
  p public.payments;
  b public.businesses;
  v_today date := public.nairobi_day(p_now);
  v_paid date;
  v_start date;
  v_end date;
  v_body text;
begin
  if p_via not in ('admin','auto') then raise exception 'invalid_via'; end if;
  select * into p from public.payments x where x.id = p_id for update;
  if not found then raise exception 'payment_not_found'; end if;
  if p.status = 'confirmed' then return p; end if;
  if p.status = 'rejected' then raise exception 'payment_rejected'; end if;
  select * into b from public.businesses x where x.id = p.business_id for update;

  if p.kind in ('first','renewal') then
    v_paid := case when b.paid_until is null then null else public.nairobi_day(b.paid_until) end;
    v_start := case when v_paid is not null and v_today <= v_paid + 1 then v_paid else v_today end;
    v_end := public.add_calendar_month(v_start);
    update public.businesses x set paid_until = public.nairobi_midnight(v_end),
      status = case when x.status in ('pending','expired') then 'live' else x.status end
    where x.id = b.id;
    v_body := format('We received KES %s. Your listing is paid until %s.', p.amount_kes, to_char(v_end, 'DD Mon YYYY'));
  elsif p.kind = 'upgrade' then
    v_start := v_today;
    v_end := public.nairobi_day(b.paid_until);
    update public.businesses x set plan_key = coalesce(p.plan_key, x.plan_key) where x.id = b.id;
    v_body := format('We received KES %s. You are now on %s until %s.', p.amount_kes, initcap(coalesce(p.plan_key, b.plan_key)), to_char(v_end, 'DD Mon YYYY'));
  else
    v_start := v_today;
    v_end := case when b.paid_until is null then null else public.nairobi_day(b.paid_until) end;
    v_body := format('We received KES %s for your category change. It now waits for admin approval.', p.amount_kes);
  end if;

  update public.payments x set status = 'confirmed', period_start = v_start, period_end = v_end, confirmed_via = p_via, decline_reason = null
  where x.id = p.id returning * into p;
  perform public.post_seller_message(p.business_id, 'payment', 'Payment received', v_body || ' Receipt ' || p.receipt_no || '.',
    jsonb_build_object('payment_id', p.id, 'receipt_no', p.receipt_no), 'payment:' || p.id);
  perform public.write_audit(p.business_id, 'payment_confirmed', 'payment', p.id::text, jsonb_build_object('via', p_via, 'receipt', p.receipt_no));
  return p;
end $$;

create or replace function public.payment_apply_rejection(p_id uuid, p_reason text default null) returns public.payments
language plpgsql security definer set search_path = public as $$
declare p public.payments;
begin
  update public.payments x set status = 'rejected', decline_reason = nullif(left(btrim(coalesce(p_reason, '')), 300), '')
  where x.id = p_id and x.status = 'submitted' returning * into p;
  if not found then raise exception 'payment_not_submitted'; end if;
  perform public.post_seller_message(p.business_id, 'payment', 'We could not match your payment',
    'We could not find M-Pesa code ' || coalesce(p.mpesa_code, '') || '.' || coalesce(' ' || p.decline_reason, '') || ' Check the code and the amount, then submit it again.',
    jsonb_build_object('payment_id', p.id), 'payment-rejected:' || p.id);
  perform public.write_audit(p.business_id, 'payment_rejected', 'payment', p.id::text, '{}');
  return p;
end $$;

create or replace function public.admin_confirm_payment(p_id uuid) returns public.payments
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_an_admin' using errcode = '42501'; end if;
  return public.payment_apply_confirmation(p_id, 'admin');
end $$;

create or replace function public.admin_reject_payment(p_id uuid, p_reason text default null) returns public.payments
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_an_admin' using errcode = '42501'; end if;
  return public.payment_apply_rejection(p_id, p_reason);
end $$;

-- Hook for the automatic matcher (a Daraja C2B callback or a statement import). It only has to call this
-- with what M-Pesa reports; the seller's page reacts to the payments and businesses rows through realtime.
create or replace function public.payment_match_incoming(p_code text, p_amount_kes integer, p_account text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  p public.payments;
begin
  select * into p from public.payments x where x.mpesa_code = v_code and x.status = 'submitted' for update;
  if not found then return jsonb_build_object('matched', false, 'reason', 'no_submission'); end if;
  if p_account is not null and p.account_ref is not null and upper(btrim(p_account)) <> upper(p.account_ref) then
    return jsonb_build_object('matched', false, 'reason', 'account_mismatch', 'payment_id', p.id);
  end if;
  if p_amount_kes is null or p_amount_kes < p.amount_kes then
    return jsonb_build_object('matched', false, 'reason', 'amount_mismatch', 'payment_id', p.id);
  end if;
  p := public.payment_apply_confirmation(p.id, 'auto');
  return jsonb_build_object('matched', true, 'payment_id', p.id, 'receipt_no', p.receipt_no);
end $$;

-- ---------------------------------------------------------------------------
-- Category change quotes on change requests
-- ---------------------------------------------------------------------------
create or replace function public.seller_request_change(p_field text, p_value text) returns public.change_requests
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_b public.businesses;
  v_new text := btrim(coalesce(p_value, ''));
  v_old text;
  v_oldp integer;
  v_newp integer;
  v_quote jsonb;
  r public.change_requests;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if p_field is null or p_field not in ('name','category_id','phone','town','pin','licence') then
    raise exception 'field_not_allowed:%', coalesce(p_field, '') using errcode = '42501';
  end if;
  select * into v_b from public.businesses where id = v_id;
  if p_field = 'name' and char_length(v_new) not between 2 and 100 then raise exception 'invalid_name'; end if;
  if p_field = 'category_id' and not exists (select 1 from public.categories c where c.id = v_new and c.active) then raise exception 'invalid_category'; end if;
  if p_field = 'phone' then
    v_new := public.normalize_phone_ke(v_new);
    if v_new is null then raise exception 'invalid_phone'; end if;
  end if;
  if p_field = 'town' and char_length(v_new) not between 2 and 60 then raise exception 'invalid_town'; end if;
  if p_field = 'pin' then
    v_new := upper(v_new);
    if v_new !~ '^[AP][0-9]{9}[A-Z]$' then raise exception 'invalid_pin'; end if;
  end if;
  if p_field = 'licence' and char_length(v_new) not between 3 and 60 then raise exception 'invalid_licence'; end if;
  v_old := to_jsonb(v_b) ->> p_field;
  if v_old is not distinct from v_new then raise exception 'no_change'; end if;

  if p_field = 'category_id' then
    select p.price_kes into v_oldp from public.plans p where p.category_id = v_b.category_id and p.plan_key = v_b.plan_key;
    select p.price_kes into v_newp from public.plans p where p.category_id = v_new and p.plan_key = v_b.plan_key;
    if v_newp is null then raise exception 'invalid_category'; end if;
    if v_newp > coalesce(v_oldp, 0) and public.listing_state(v_b.paid_until) <> 'active' then raise exception 'renew_first'; end if;
    v_quote := public.category_change_quote(coalesce(v_oldp, 0), v_newp, v_b.paid_until);
  end if;

  begin
    insert into public.change_requests (business_id, field, old_value, new_value, extra_due_kes, new_monthly_price, applies_from_next_renewal)
    values (v_id, p_field, v_old, v_new, coalesce((v_quote ->> 'extraDueNow')::integer, 0), (v_quote ->> 'newMonthlyPrice')::integer, true)
    returning * into r;
  exception when unique_violation then
    raise exception 'change_already_pending';
  end;
  perform public.write_audit(v_id, 'change_requested', 'change_request', r.id::text, jsonb_build_object('field', p_field));
  perform public.notify_admin('change_request', v_id, jsonb_build_object('change_id', r.id, 'field', p_field));
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- Notifications written by the system
-- ---------------------------------------------------------------------------
create or replace function public.generate_billing_notices(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = public as $$
declare
  b record;
  v_left integer;
  v_day text;
  v_n integer := 0;
  v_ok boolean;
begin
  for b in select x.id, x.paid_until from public.businesses x where x.paid_until is not null and x.status in ('live','paused','suspended','expired') loop
    v_left := public.nairobi_day(b.paid_until) - public.nairobi_day(p_now);
    v_day := to_char(public.nairobi_day(b.paid_until), 'YYYY-MM-DD');
    v_ok := false;
    if v_left in (7, 3, 1) then
      v_ok := public.post_seller_message(b.id, 'reminder', format('Your listing expires in %s day%s', v_left, case when v_left = 1 then '' else 's' end),
        format('Your subscription runs to %s. Renew before then to stay visible.', to_char(public.nairobi_day(b.paid_until), 'DD Mon YYYY')),
        jsonb_build_object('days_left', v_left), format('reminder:%s:%s', v_left, v_day));
    elsif v_left = -1 then
      v_ok := public.post_seller_message(b.id, 'grace', 'Your subscription has ended: 1 day of grace',
        'Your listing stays visible for one more day. Renew today to avoid being hidden.', '{}', 'grace:' || v_day);
    elsif v_left < -1 then
      v_ok := public.post_seller_message(b.id, 'expiry', 'Your subscription has expired',
        'Your listing is hidden from customers. Renew to bring it back.', '{}', 'expiry:' || v_day);
    end if;
    if v_ok then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $$;

create or replace function public.notify_on_report() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_label text := case lower(coalesce(new.reason, ''))
    when 'wrong-price' then 'wrong price'
    when 'wrong-info' then 'wrong or outdated information'
    when 'closed' then 'business closed or moved'
    when 'wrong-contact' then 'phone or WhatsApp not working'
    when 'scam' then 'misleading information'
    when 'inappropriate' then 'inappropriate content'
    else 'a problem' end;
  v_item text;
begin
  if new.item_id is not null then select i.name into v_item from public.items i where i.id = new.item_id; end if;
  -- Never include reporter_hash or the free-text details: the seller must not be able to identify the reporter.
  perform public.post_seller_message(new.business_id, 'report',
    initcap(v_label) || ' reported',
    'A customer reported ' || v_label || case when v_item is not null then ' on "' || v_item || '"' else '' end || '. Please check your listing and correct it if needed.',
    jsonb_build_object('item_id', new.item_id),
    'report:' || new.reason || ':' || coalesce(new.item_id::text, '-') || ':' || to_char(public.nairobi_day(new.created_at), 'YYYY-MM-DD'));
  return null;
end $$;
drop trigger if exists t_reports_notify on public.reports;
create trigger t_reports_notify after insert on public.reports for each row execute function public.notify_on_report();

create or replace function public.notify_on_change_decision() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'pending' and new.status in ('approved','rejected') then
    perform public.post_seller_message(new.business_id, 'change',
      case when new.status = 'approved' then 'Change request approved' else 'Change request declined' end,
      format('Your request to change %s was %s.%s', replace(new.field, '_id', ''), case when new.status = 'approved' then 'approved' else 'declined' end,
             coalesce(' Note: ' || new.admin_note, '')),
      jsonb_build_object('change_id', new.id, 'field', new.field), 'change:' || new.id);
  end if;
  return null;
end $$;
drop trigger if exists t_change_requests_notify on public.change_requests;
create trigger t_change_requests_notify after update of status on public.change_requests for each row execute function public.notify_on_change_decision();

create or replace function public.notify_on_business_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'pending' and new.status = 'live' then
    perform public.post_seller_message(new.id, 'approval', 'Your listing is live', 'Your business has been approved and customers can now find it.', '{}', 'approval:' || new.id);
  end if;
  return null;
end $$;
drop trigger if exists t_businesses_notify on public.businesses;
create trigger t_businesses_notify after update of status on public.businesses for each row execute function public.notify_on_business_status();

create or replace function public.notify_on_removal() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_label text := case tg_table_name when 'items' then 'item' when 'faqs' then 'FAQ' else 'offer' end;
  v_name text := to_jsonb(new) ->> (case tg_table_name when 'items' then 'name' when 'faqs' then 'question' else 'title' end);
  v_reason text := coalesce(new.admin_reason, new.admin_hide_reason);
begin
  if (new.removed_by_admin and not old.removed_by_admin) or (new.hidden_by_admin and not old.hidden_by_admin) then
    perform public.post_seller_message(new.business_id, 'removal',
      case when new.removed_by_admin then 'An ' || v_label || ' was removed' else 'An ' || v_label || ' was hidden' end,
      format('"%s" was %s by EpicMKT.%s', coalesce(v_name, v_label), case when new.removed_by_admin then 'removed' else 'hidden' end, coalesce(' Reason: ' || v_reason, '')),
      jsonb_build_object('table', tg_table_name, 'id', new.id), 'removal:' || tg_table_name || ':' || new.id || ':' || case when new.removed_by_admin then 'r' else 'h' end);
  end if;
  return null;
end $$;
drop trigger if exists t_items_removal_notify on public.items;
create trigger t_items_removal_notify after update on public.items for each row execute function public.notify_on_removal();
drop trigger if exists t_faqs_removal_notify on public.faqs;
create trigger t_faqs_removal_notify after update on public.faqs for each row execute function public.notify_on_removal();
drop trigger if exists t_offers_removal_notify on public.offers;
create trigger t_offers_removal_notify after update on public.offers for each row execute function public.notify_on_removal();

create or replace function public.notify_on_flag_question() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.seller_message is not null then
    perform public.post_seller_message(new.business_id, 'question', 'A question from EpicMKT', new.seller_message,
      jsonb_build_object('flag_id', new.id, 'due_at', new.due_at), 'question:' || new.id);
  end if;
  return null;
end $$;
drop trigger if exists t_flags_notify on public.flags;
create trigger t_flags_notify after insert on public.flags for each row execute function public.notify_on_flag_question();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
do $$
declare fn text;
begin
  foreach fn in array array['seller_payment_instructions(text, text, text)', 'seller_quote_category_change(text)', 'seller_submit_payment(text, text, text, text, uuid)',
    'admin_confirm_payment(uuid)', 'admin_reject_payment(uuid, text)'] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
  foreach fn in array array['payment_apply_confirmation(uuid, text, timestamptz)', 'payment_apply_rejection(uuid, text)', 'payment_match_incoming(text, integer, text)',
    'generate_billing_notices(timestamptz)', 'next_receipt_no(timestamptz)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
  foreach fn in array array['nairobi_day(timestamptz)', 'nairobi_midnight(date)', 'add_calendar_month(date, integer)', 'listing_state(timestamptz, timestamptz)',
    'days_left(timestamptz, timestamptz)', 'category_change_quote(integer, integer, timestamptz, timestamptz)'] loop
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end $$;
grant usage, select on sequence public.receipt_seq to service_role;
grant all on all tables in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Realtime: the seller page listens to its own rows (row-level security applies)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['payments','messages','businesses','flags','flag_attachments'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
