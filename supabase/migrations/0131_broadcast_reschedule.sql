-- 0131_broadcast_reschedule.sql
-- Change when a waiting broadcast goes out ("send now" is just a time of now). Only rows still queued and not yet taken by
-- the dispatcher move; anything already sent, cancelled or in flight is left alone. Quiet hours still apply to promotional
-- SMS and email when they come due (claim_due_messages, 0072). Additive and safe to re-run.
--
-- ROLLBACK: drop function if exists public.admin_reschedule_broadcast(uuid, timestamptz);

create or replace function public.admin_reschedule_broadcast(p_batch uuid, p_when timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_moved integer;
  v_when timestamptz;
begin
  if not public.has_role(array['reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_batch is null or p_when is null then raise exception 'invalid_input'; end if;
  if not exists (select 1 from public.messages where batch_id = p_batch) then raise exception 'broadcast_not_found'; end if;
  if p_when > now() + interval '180 days' then raise exception 'too_far_ahead'; end if;
  -- A time already past means "now".
  v_when := greatest(p_when, now());

  with picked as (
    select id from public.messages
     where batch_id = p_batch and status = 'queued' and claimed_at is null
     order by id for update skip locked
  ), upd as (
    update public.messages m set scheduled_at = v_when
      from picked where m.id = picked.id returning m.id
  )
  select count(*) into v_moved from upd;

  if v_moved > 0 then
    perform public.admin_audit_action('broadcast.reschedule', 'message_batch', p_batch::text,
      jsonb_build_object('moved', v_moved), jsonb_build_object('scheduled_at', v_when), 'Broadcast rescheduled', null);
  end if;
  return jsonb_build_object('moved', v_moved, 'scheduledAt', v_when);
end $$;
revoke all on function public.admin_reschedule_broadcast(uuid, timestamptz) from public, anon;
grant execute on function public.admin_reschedule_broadcast(uuid, timestamptz) to authenticated, service_role;
