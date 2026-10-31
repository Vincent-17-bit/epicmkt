-- 0079_message_simulated_status.sql
-- A message that was never sent (messaging mode "mock": the default outside production) used to be recorded as
-- 'sent', so the log and the cost summary looked like real traffic. It is now recorded as 'simulated'.
--
--   * messages.status accepts 'simulated' (it is only ever written when the dispatcher is in mock mode). 'cancelled'
--     (0072) stays allowed: this rebuilds the CHECK from the full list.
--   * record_message_result() accepts p_final_status = 'simulated'. Its retry policy and the live path are unchanged.
--   * admin_message_log_query() can filter on 'simulated'. It is the version from 0074 (applicant names, 'cancelled')
--     with 'simulated' added, so nothing 0074 added is lost.
--   * admin_message_summary(): by_status lists 'simulated' on its own, and cost_kes no longer counts simulated rows.
--   * admin_automation_status().last_sent_at keeps counting only 'sent' and 'delivered', so a simulated row is not
--     reported as the last real send. It needs no change here.
--   * A simulated row is not counted as sent in the pending-broadcast and cancel summaries (0072): it was never sent.
--
-- Existing rows keep their status: rows already recorded as 'sent' with provider_id 'dev' stay as they are.
-- Must run AFTER 0072 and 0074 (it is numbered after them; 0078 is unrelated), and BEFORE deploying dispatch-messages: a mock-mode
-- dispatcher would otherwise violate the CHECK constraint. Safe to run more than once.

do $$
declare v_name text;
begin
  for v_name in
    select c.conname from pg_constraint c
     where c.conrelid = 'public.messages'::regclass and c.contype = 'c'
       and pg_get_constraintdef(c.oid) like '%status%' and pg_get_constraintdef(c.oid) like '%queued%'
  loop
    execute format('alter table public.messages drop constraint %I', v_name);
  end loop;
  alter table public.messages add constraint messages_status_check
    check (status in ('queued', 'sent', 'delivered', 'simulated', 'failed', 'cancelled'));
end $$;

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
  if p_final_status not in ('sent', 'delivered', 'simulated') then raise exception 'bad_final_status' using errcode = '22023'; end if;
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

create or replace function public.admin_message_log_query(
  p_channel text default 'all', p_status text default 'all', p_search text default null,
  p_limit integer default 50, p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_total bigint;
  v_rows jsonb;
begin
  if not public.has_role(array['owner', 'reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(p_channel, 'all') not in ('all', 'sms', 'email', 'in_app') then raise exception 'invalid_channel'; end if;
  if coalesce(p_status, 'all') not in ('all', 'queued', 'sent', 'delivered', 'simulated', 'failed', 'cancelled') then raise exception 'invalid_status'; end if;

  select count(*) into v_total
    from public.messages m left join public.businesses b on b.id = m.business_id
   where m.sender <> 'seller'
     and (coalesce(p_channel, 'all') = 'all' or m.channel = p_channel)
     and (coalesce(p_status, 'all') = 'all' or m.status = p_status)
     and (v_search is null or m.subject ilike '%' || v_search || '%' or m.to_address ilike '%' || v_search || '%'
          or m.template_key ilike '%' || v_search || '%' or b.name ilike '%' || v_search || '%');

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) into v_rows from (
    select m.id, m.created_at, m.channel, m.status, m.kind, m.subject, m.template_key, m.to_address, m.transactional,
           m.business_id, b.name as business_name, m.application_id, a.business_name as application_name,
           m.attempts, m.error, m.cost_kes, m.scheduled_at, m.sent_at
      from public.messages m
      left join public.businesses b on b.id = m.business_id
      left join public.applications a on a.id = m.application_id
     where m.sender <> 'seller'
       and (coalesce(p_channel, 'all') = 'all' or m.channel = p_channel)
       and (coalesce(p_status, 'all') = 'all' or m.status = p_status)
       and (v_search is null or m.subject ilike '%' || v_search || '%' or m.to_address ilike '%' || v_search || '%'
            or m.template_key ilike '%' || v_search || '%' or b.name ilike '%' || v_search || '%')
     order by m.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
  ) x;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end $$;

create or replace function public.admin_message_summary(p_days integer default 7) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_days integer := least(greatest(coalesce(p_days, 7), 1), 90);
begin
  if not public.has_role(array['owner', 'reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'days', v_days,
    'by_status', coalesce((
      select jsonb_object_agg(s.status, s.n) from (
        select m.status, count(*) as n from public.messages m
         where m.sender <> 'seller' and m.channel in ('sms', 'email') and m.created_at >= now() - make_interval(days => v_days)
         group by m.status) s), '{}'::jsonb),
    'cost_kes', coalesce((select sum(m.cost_kes) from public.messages m
       where m.channel = 'sms' and m.status <> 'simulated' and m.created_at >= now() - make_interval(days => v_days)), 0),
    'queued_now', (select count(*) from public.messages m where m.status = 'queued' and m.channel in ('sms', 'email')),
    'due_now', (select count(*) from public.messages m where m.status = 'queued' and m.channel in ('sms', 'email') and m.scheduled_at <= now()),
    'oldest_due_at', (select min(m.scheduled_at) from public.messages m where m.status = 'queued' and m.channel in ('sms', 'email') and m.scheduled_at <= now()),
    'failed_now', (select count(*) from public.messages m where m.status = 'failed' and m.created_at >= now() - make_interval(days => v_days))
  );
end $$;
