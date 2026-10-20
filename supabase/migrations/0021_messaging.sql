-- 0021_messaging.sql
-- The SQL behind dispatch-messages, daily-lifecycle and admin-message, on top of main's canonical schema.
--
-- 0008_admin.sql already owns the delivery columns on `messages` (channel, status, attempts, provider_id,
-- transactional, scheduled_at, ...), `message_templates`, the `quiet_hours` setting and admins.role.
-- This migration adds only what they lack: the tighter seller inbox policy, a dedupe index for applicant-only
-- messages, message_templates.transactional, and the functions the jobs run. It is additive and safe to run again.
--
-- Time is always passed in (p_now) so tests can travel through quiet hours and billing days.

-- ---------------------------------------------------------------------------
-- Seller inbox: only in-app messages that have actually been delivered
-- ---------------------------------------------------------------------------
-- 0008 lets a seller read every in-app row they own, so an in-app message scheduled for next week (status
-- 'queued') would show up early. SMS/email rows are delivery records and stay hidden, as in 0008.
drop policy if exists "seller reads own messages" on public.messages;
create policy "seller reads own messages" on public.messages for select to authenticated
  using (channel = 'in_app' and business_id = public.my_business_id() and status in ('sent', 'delivered'));

-- (business_id, dedupe_key) is already unique from 0006; applicant-only messages have no business.
create unique index if not exists messages_application_dedupe_key
  on public.messages (application_id, dedupe_key) where business_id is null and dedupe_key is not null;

-- ---------------------------------------------------------------------------
-- Templates: admin-message needs to know whether a template is a transactional notice
-- ---------------------------------------------------------------------------
-- Transactional templates (billing and account notices) ignore quiet hours; everything else is promotional.
alter table public.message_templates add column if not exists transactional boolean not null default false;

-- ---------------------------------------------------------------------------
-- Quiet hours (site_settings.quiet_hours, Nairobi local time, may wrap past midnight)
-- ---------------------------------------------------------------------------
-- The setting itself is seeded by 0008_admin.sql; with no row, in_quiet_hours() is false (nothing is delayed).

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
