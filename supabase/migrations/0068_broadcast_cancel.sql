-- 0068_broadcast_cancel.sql
-- Cancel a broadcast that has not gone out yet.
--
--   * messages.batch_id groups the rows one admin-message call created (one row per recipient and channel).
--     Older broadcasts are grouped from the idempotency key already stored in their dedupe_key.
--   * messages.claimed_at is set by claim_due_messages() when the dispatcher takes a row, so "not yet claimed" can be told
--     apart from "scheduled for later" (claiming only pushes scheduled_at forward and leaves the status queued).
--   * status 'cancelled' is new. Nothing else reads it as sent: the seller inbox policy and the dispatcher ignore it.
--   * admin_cancel_broadcast() cancels only queued, unclaimed rows and reports what was cancelled and what had already gone.
--
-- Additive and safe to re-run.
--
-- ROLLBACK (run by hand):
--   drop function if exists public.admin_cancel_broadcast(uuid, text);
--   drop function if exists public.admin_pending_broadcasts();
--   update public.messages set status = 'failed', error = 'cancelled' where status = 'cancelled';
--   alter table public.messages drop constraint if exists messages_status_check;
--   alter table public.messages add constraint messages_status_check check (status in ('queued','sent','delivered','failed'));
--   re-run "create or replace function public.claim_due_messages" from 0021_messaging.sql
--   alter table public.messages drop column if exists claimed_at, drop column if exists batch_id;

alter table public.messages add column if not exists batch_id uuid;
alter table public.messages add column if not exists claimed_at timestamptz;

do $$
declare c record;
begin
  for c in
    select con.conname from pg_constraint con
     where con.conrelid = 'public.messages'::regclass and con.contype = 'c'
       and pg_get_constraintdef(con.oid) like '%status%' and pg_get_constraintdef(con.oid) like '%queued%'
  loop
    execute format('alter table public.messages drop constraint %I', c.conname);
  end loop;
  alter table public.messages add constraint messages_status_check
    check (status in ('queued', 'sent', 'delivered', 'failed', 'cancelled'));
end $$;

update public.messages
   set batch_id = split_part(dedupe_key, ':', 2)::uuid
 where batch_id is null
   and dedupe_key like 'admin:%'
   and split_part(dedupe_key, ':', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

create index if not exists messages_batch_idx on public.messages (batch_id) where batch_id is not null;

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
       set scheduled_at = p_now + make_interval(secs => p_lease_seconds), claimed_at = p_now
      from due
     where m.id = due.id
    returning m.*;
end $$;
revoke all on function public.claim_due_messages(timestamptz, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_due_messages(timestamptz, integer, integer) to service_role;

-- Broadcasts that still have rows waiting and not yet taken by the dispatcher.
create or replace function public.admin_pending_broadcasts() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(array['reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.scheduled_at, x.created_at)
    from (
      select m.batch_id,
             min(m.created_at) as created_at,
             min(m.scheduled_at) filter (where m.status = 'queued' and m.claimed_at is null) as scheduled_at,
             min(m.subject) as subject,
             min(m.template_key) as template_key,
             count(*) filter (where m.status = 'queued' and m.claimed_at is null)::integer as pending,
             count(*) filter (where m.status in ('sent', 'delivered'))::integer as sent,
             count(*)::integer as total,
             count(distinct coalesce(m.business_id, m.application_id))::integer as recipients,
             array_agg(distinct m.channel order by m.channel) as channels
        from public.messages m
       where m.batch_id is not null
       group by m.batch_id
      having count(*) filter (where m.status = 'queued' and m.claimed_at is null) > 0
       order by min(m.scheduled_at) filter (where m.status = 'queued' and m.claimed_at is null), min(m.created_at)
       limit 50
    ) x
  ), '[]'::jsonb);
end $$;
revoke all on function public.admin_pending_broadcasts() from public, anon;
grant execute on function public.admin_pending_broadcasts() to authenticated, service_role;

create or replace function public.admin_cancel_broadcast(p_batch uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cancelled integer;
  v_sent integer;
  v_failed integer;
  v_in_flight integer;
  v_total integer;
begin
  if not public.has_role(array['reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_batch is null then raise exception 'invalid_input'; end if;
  if not exists (select 1 from public.messages where batch_id = p_batch) then raise exception 'broadcast_not_found'; end if;

  with picked as (
    select id from public.messages
     where batch_id = p_batch and status = 'queued' and claimed_at is null
     order by id for update skip locked
  ), upd as (
    update public.messages m set status = 'cancelled'
      from picked where m.id = picked.id returning m.id
  )
  select count(*) into v_cancelled from upd;

  select count(*) filter (where status in ('sent', 'delivered')),
         count(*) filter (where status = 'failed'),
         count(*) filter (where status = 'queued'),
         count(*)
    into v_sent, v_failed, v_in_flight, v_total
    from public.messages where batch_id = p_batch;

  if v_cancelled > 0 then
    perform public.admin_audit_action('broadcast.cancel', 'message_batch', p_batch::text,
      jsonb_build_object('pending', v_cancelled + v_in_flight),
      jsonb_build_object('cancelled', v_cancelled, 'sent', v_sent, 'failed', v_failed, 'in_flight', v_in_flight, 'total', v_total),
      coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Broadcast cancelled'), null);
  end if;
  return jsonb_build_object('cancelled', v_cancelled, 'sent', v_sent, 'failed', v_failed, 'inFlight', v_in_flight, 'total', v_total);
end $$;
revoke all on function public.admin_cancel_broadcast(uuid, text) from public, anon;
grant execute on function public.admin_cancel_broadcast(uuid, text) to authenticated, service_role;
