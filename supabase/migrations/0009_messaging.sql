-- 0009_messaging.sql
-- Outbound delivery (SMS / email / in-app) on top of the seller inbox table from 0004-0006.
--
-- 0008_admin.sql describes a different `messages` table, but `create table if not exists` is a no-op
-- here because 0004 already created it, so the delivery columns never existed. This migration adds them
-- without changing how the seller inbox behaves, plus the SQL the dispatcher and the daily lifecycle run.
--
-- Time is always passed in (p_now) so tests can travel through quiet hours and billing days.

-- ---------------------------------------------------------------------------
-- admins: roles (same definition 0008 intends; `if not exists` keeps both safe to run)
-- ---------------------------------------------------------------------------
alter table public.admins add column if not exists role text not null default 'owner'
  check (role in ('owner', 'reviewer', 'finance', 'support'));
alter table public.admins add column if not exists email text;
alter table public.admins add column if not exists display_name text;

-- ---------------------------------------------------------------------------
-- messages: delivery columns
-- ---------------------------------------------------------------------------
alter table public.messages alter column business_id drop not null;

alter table public.messages
  add column if not exists application_id uuid references public.applications(id) on delete set null,
  add column if not exists channel text not null default 'in_app',
  add column if not exists template_key text,
  add column if not exists to_address text,
  add column if not exists status text not null default 'delivered',
  add column if not exists provider_id text,
  add column if not exists cost_kes numeric(8,2),
  add column if not exists error text,
  add column if not exists attempts integer not null default 0,
  add column if not exists transactional boolean not null default true,
  add column if not exists scheduled_at timestamptz not null default now(),
  add column if not exists sent_at timestamptz;

-- Existing rows are seller-inbox messages that were visible the moment they were written, so the defaults
-- above ('in_app', 'delivered') describe them correctly. Only the admin-message function queues rows.
alter table public.messages drop constraint if exists messages_channel_check;
alter table public.messages add constraint messages_channel_check
  check (channel in ('sms', 'email', 'in_app', 'whatsapp_link'));
alter table public.messages drop constraint if exists messages_status_check;
alter table public.messages add constraint messages_status_check
  check (status in ('queued', 'sent', 'delivered', 'failed'));
alter table public.messages drop constraint if exists messages_target_check;
alter table public.messages add constraint messages_target_check
  check (business_id is not null or application_id is not null);

-- (business_id, dedupe_key) is already unique from 0006; applicant-only messages have no business.
create unique index if not exists messages_application_dedupe_key
  on public.messages (application_id, dedupe_key) where business_id is null and dedupe_key is not null;
create index if not exists messages_dispatch_idx on public.messages (scheduled_at) where status = 'queued';

-- Sellers see only in-app messages that have actually been delivered. SMS/email rows are delivery records,
-- and a queued in-app message (for example one scheduled for next week) must not appear early.
drop policy if exists "seller reads own messages" on public.messages;
create policy "seller reads own messages" on public.messages for select to authenticated
  using (business_id = public.my_business_id() and channel = 'in_app' and status in ('sent', 'delivered'));

-- ---------------------------------------------------------------------------
-- Templates for admin-message
-- ---------------------------------------------------------------------------
create table if not exists public.message_templates (
  key text primary key check (key ~ '^[a-z0-9_]{2,60}$'),
  channel text check (channel in ('sms', 'email', 'in_app')),   -- null = usable on any channel
  subject text,
  body_en text not null,
  body_sw text,
  transactional boolean not null default false,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.message_templates enable row level security;
drop policy if exists "admin all message_templates" on public.message_templates;
create policy "admin all message_templates" on public.message_templates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.message_templates from public, anon;
grant all on public.message_templates to authenticated, service_role;

insert into public.message_templates (key, channel, subject, body_en, transactional) values
  ('general_notice', null, 'A notice from EpicMKT', 'Hi {{business_name}}, {{message}} - EpicMKT', false),
  ('renewal_help', null, 'Renewing your listing', 'Hi {{business_name}}, your listing runs to {{paid_until}}. You can renew from your seller dashboard. - EpicMKT', true)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Quiet hours (site_settings.quiet_hours, Nairobi local time, may wrap past midnight)
-- ---------------------------------------------------------------------------
insert into public.site_settings (key, value) values ('quiet_hours', '{"start":"21:00","end":"07:00"}')
on conflict (key) do nothing;

create or replace function public.in_quiet_hours(p_now timestamptz default now()) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  q jsonb;
  s time;
  e time;
  t time := (p_now at time zone 'Africa/Nairobi')::time;
begin
  select value into q from public.site_settings where key = 'quiet_hours';
  if q is null then return false; end if;
  s := (q ->> 'start')::time;
  e := (q ->> 'end')::time;
  if s is null or e is null or s = e then return false; end if;
  if s < e then return t >= s and t < e; end if;
  return t >= s or t < e;
exception when others then
  return false;   -- a malformed setting must never stop transactional mail
end $$;

-- The next moment quiet hours end, strictly after p_now.
create or replace function public.quiet_hours_end(p_now timestamptz default now()) returns timestamptz
language plpgsql stable security definer set search_path = public as $$
declare
  e time;
  d date := (p_now at time zone 'Africa/Nairobi')::date;
  r timestamptz;
begin
  select (value ->> 'end')::time into e from public.site_settings where key = 'quiet_hours';
  if e is null then return p_now; end if;
  r := (d + e) at time zone 'Africa/Nairobi';
  if r <= p_now then r := ((d + 1) + e) at time zone 'Africa/Nairobi'; end if;
  return r;
exception when others then
  return p_now;
end $$;

-- ---------------------------------------------------------------------------
-- Dispatcher: claim due messages, then record each outcome
-- ---------------------------------------------------------------------------
-- Claiming leases rows by pushing scheduled_at forward, so overlapping runs never pick up the same row.
-- If a worker dies mid-run the lease simply expires and the row is picked up again.
create or replace function public.claim_due_messages(p_now timestamptz default now(), p_limit integer default 50, p_lease_seconds integer default 300)
returns setof public.messages
language plpgsql security definer set search_path = public as $$
begin
  -- Promotional SMS/email never go out during quiet hours; they wait for the morning.
  -- Transactional messages and in-app messages (silent) are not delayed.
  if public.in_quiet_hours(p_now) then
    update public.messages
       set scheduled_at = public.quiet_hours_end(p_now)
     where status = 'queued' and scheduled_at <= p_now
       and transactional = false and channel in ('sms', 'email');
  end if;

  return query
    with due as (
      select id from public.messages
       where status = 'queued' and scheduled_at <= p_now and channel in ('sms', 'email', 'in_app')
       order by transactional desc, scheduled_at, created_at
       limit greatest(1, least(coalesce(p_limit, 50), 200))
       for update skip locked
    )
    update public.messages m
       set scheduled_at = p_now + make_interval(secs => p_lease_seconds)
      from due
     where m.id = due.id
    returning m.*;
end $$;

-- Returns 'sent' | 'retry' | 'failed' | 'noop'. A message gets p_max_attempts attempts in total:
-- failures re-queue it with a backoff (5 minutes, then 15) until the last one, which marks it 'failed'
-- and raises an admin notification exactly once.
create or replace function public.record_message_result(
  p_id uuid, p_ok boolean, p_provider_id text default null, p_error text default null, p_cost numeric default null,
  p_now timestamptz default now(), p_max_attempts integer default 3, p_final_status text default 'sent')
returns text
language plpgsql security definer set search_path = public as $$
declare
  m public.messages;
  v_attempts integer;
  v_error text := left(coalesce(nullif(p_error, ''), 'send_failed'), 500);
begin
  if p_final_status not in ('sent', 'delivered') then raise exception 'bad_final_status' using errcode = '22023'; end if;
  select * into m from public.messages where id = p_id for update;
  if not found or m.status <> 'queued' then return 'noop'; end if;
  v_attempts := m.attempts + 1;

  if p_ok then
    update public.messages
       set status = p_final_status, attempts = v_attempts, provider_id = p_provider_id,
           cost_kes = p_cost, error = null, sent_at = p_now
     where id = p_id;
    return 'sent';
  end if;

  if v_attempts >= greatest(p_max_attempts, 1) then
    update public.messages set status = 'failed', attempts = v_attempts, error = v_error where id = p_id;
    insert into public.admin_notifications (kind, business_id, data)
    values ('message_failed', m.business_id, jsonb_build_object(
      'message_id', m.id, 'channel', m.channel, 'attempts', v_attempts, 'error', v_error,
      'subject', m.subject, 'template_key', m.template_key, 'application_id', m.application_id));
    return 'failed';
  end if;

  update public.messages
     set attempts = v_attempts, error = v_error,
         scheduled_at = p_now + make_interval(mins => case v_attempts when 1 then 5 else 15 end)
   where id = p_id;
  return 'retry';
end $$;

-- ---------------------------------------------------------------------------
-- Billing notices: in-app (existing generate_billing_notices) plus SMS/email copies
-- ---------------------------------------------------------------------------
-- Reminders go out at exactly 7, 3 and 1 days before paid_until. Every row carries a dedupe_key that includes
-- the paid_until day, so running this any number of times a day is safe, and a renewal (new paid_until)
-- starts a fresh set of keys. Copies are transactional: they ignore quiet hours.
create or replace function public.queue_billing_notices(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b record;
  v_left integer;
  v_day text;
  v_kind text;
  v_key text;
  v_subject text;
  v_body text;
  v_name text;
  v_inapp integer;
  v_queued integer := 0;
  v_n integer;
begin
  v_inapp := public.generate_billing_notices(p_now);

  for b in
    select x.id, x.name, x.paid_until, x.phone, x.email
      from public.businesses x
     where x.paid_until is not null and x.status in ('live', 'paused', 'suspended', 'expired')
  loop
    v_left := public.nairobi_day(b.paid_until) - public.nairobi_day(p_now);
    v_day := to_char(public.nairobi_day(b.paid_until), 'YYYY-MM-DD');
    v_name := left(b.name, 40);
    v_kind := null;

    if v_left in (7, 3, 1) then
      v_kind := 'reminder';
      v_key := format('reminder:%s:%s', v_left, v_day);
      v_subject := format('Your listing expires in %s day%s', v_left, case when v_left = 1 then '' else 's' end);
      v_body := format('EpicMKT: "%s" expires in %s day%s (%s). Renew to stay visible.',
        v_name, v_left, case when v_left = 1 then '' else 's' end, to_char(public.nairobi_day(b.paid_until), 'DD Mon YYYY'));
    elsif v_left = -1 then
      v_kind := 'grace';
      v_key := 'grace:' || v_day;
      v_subject := 'Your subscription has ended: 1 day of grace';
      v_body := format('EpicMKT: your subscription for "%s" has ended. You have 1 day of grace. Renew today to stay visible.', v_name);
    elsif v_left between -4 and -2 then
      -- Only the first days after grace; sellers who lapsed long ago are not texted when this first runs.
      v_kind := 'expiry';
      v_key := 'expiry:' || v_day;
      v_subject := 'Your subscription has expired';
      v_body := format('EpicMKT: "%s" is now hidden from customers. Renew to bring it back.', v_name);
    end if;

    if v_kind is null then continue; end if;

    insert into public.messages (business_id, channel, kind, template_key, to_address, subject, body, status, transactional, scheduled_at, read_at, dedupe_key, data)
    values (b.id, 'sms', v_kind, 'billing_' || v_kind, b.phone, v_subject, v_body, 'queued', true, p_now, p_now, v_key || ':sms',
            jsonb_build_object('days_left', v_left))
    on conflict (business_id, dedupe_key) where dedupe_key is not null do nothing;
    get diagnostics v_n = row_count;
    v_queued := v_queued + v_n;

    if b.email is not null and b.email <> '' then
      insert into public.messages (business_id, channel, kind, template_key, to_address, subject, body, status, transactional, scheduled_at, read_at, dedupe_key, data)
      values (b.id, 'email', v_kind, 'billing_' || v_kind, b.email, v_subject, v_body, 'queued', true, p_now, p_now, v_key || ':email',
              jsonb_build_object('days_left', v_left))
      on conflict (business_id, dedupe_key) where dedupe_key is not null do nothing;
      get diagnostics v_n = row_count;
      v_queued := v_queued + v_n;
    end if;
  end loop;

  return jsonb_build_object('inApp', v_inapp, 'queued', v_queued);
end $$;

-- ---------------------------------------------------------------------------
-- Audience segments for admin-message
-- ---------------------------------------------------------------------------
create or replace function public.message_segment(p_segment text, p_now timestamptz default now()) returns setof uuid
language plpgsql stable security definer set search_path = public as $$
begin
  -- `return query` does not end a set-returning function, so each branch returns explicitly.
  if p_segment = 'all_live' then
    return query select id from public.businesses where status = 'live';
    return;
  elsif p_segment = 'expiring_7d' then
    return query select id from public.businesses
      where status = 'live' and paid_until is not null
        and public.nairobi_day(paid_until) between public.nairobi_day(p_now) and public.nairobi_day(p_now) + 7;
    return;
  elsif p_segment = 'in_grace' then
    return query select id from public.businesses
      where status <> 'deleted' and paid_until is not null and public.listing_state(paid_until, p_now) = 'grace';
    return;
  elsif p_segment = 'expired' then
    return query select id from public.businesses
      where status <> 'deleted' and paid_until is not null and public.listing_state(paid_until, p_now) = 'expired';
    return;
  elsif p_segment like 'category:%' then
    return query select id from public.businesses where status = 'live' and category_id = substr(p_segment, 10);
    return;
  elsif p_segment like 'town:%' then
    return query select id from public.businesses where status = 'live' and lower(town) = lower(substr(p_segment, 6));
    return;
  end if;
  raise exception 'unknown_segment' using errcode = '22023';
end $$;

-- ---------------------------------------------------------------------------
-- Grants: these run from edge functions with the service role only
-- ---------------------------------------------------------------------------
revoke all on function public.in_quiet_hours(timestamptz), public.quiet_hours_end(timestamptz),
  public.claim_due_messages(timestamptz, integer, integer),
  public.record_message_result(uuid, boolean, text, text, numeric, timestamptz, integer, text),
  public.queue_billing_notices(timestamptz), public.message_segment(text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.in_quiet_hours(timestamptz), public.quiet_hours_end(timestamptz),
  public.claim_due_messages(timestamptz, integer, integer),
  public.record_message_result(uuid, boolean, text, text, numeric, timestamptz, integer, text),
  public.queue_billing_notices(timestamptz), public.message_segment(text, timestamptz)
  to service_role;
