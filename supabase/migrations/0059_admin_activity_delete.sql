-- 0059_admin_activity_delete.sql
-- Delete buttons for the Command Center "Live activity" feed (feeds admin_activity(), migration 0014).
--
--   * Notification rows (id "n:<uuid>") are really deleted from admin_notifications.
--   * Audit rows (id "a:<number>") are NEVER deleted. audit_log stays immutable (0008 revokes UPDATE and DELETE).
--     "Delete" only hides the row from the calling admin's own feed, through admin_activity_dismissals.
--     Other admins still see it, and the Audit page still shows it.
--
-- Additive and safe to re-run.
--
-- ROLLBACK (run by hand, in this order; nothing here touches audit_log):
--   drop function if exists public.admin_delete_activity(text[], text);
--   -- restore the previous feed: re-run the "create or replace function public.admin_activity" statement from 0014_admin_live.sql
--   drop table if exists public.admin_activity_dismissals;
--   -- Notification rows that were deleted through admin_delete_activity() cannot be brought back by a rollback.
--   -- Their removal is recorded in the audit log as action 'activity.delete' (with the reason and the kinds removed).

-- ---------------------------------------------------------------------------
-- Per-admin "hidden from my feed" list. Audit rows only.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_activity_dismissals (
  admin_id     uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  activity_id  text        not null check (activity_id ~ '^a:[0-9]{1,19}$'),
  dismissed_at timestamptz not null default now(),
  primary key (admin_id, activity_id)
);

alter table public.admin_activity_dismissals enable row level security;

drop policy if exists "own dismissals read" on public.admin_activity_dismissals;
drop policy if exists "own dismissals insert" on public.admin_activity_dismissals;
drop policy if exists "own dismissals delete" on public.admin_activity_dismissals;
create policy "own dismissals read" on public.admin_activity_dismissals
  for select to authenticated using (admin_id = auth.uid() and public.is_admin());
create policy "own dismissals insert" on public.admin_activity_dismissals
  for insert to authenticated with check (admin_id = auth.uid() and public.is_admin());
create policy "own dismissals delete" on public.admin_activity_dismissals
  for delete to authenticated using (admin_id = auth.uid() and public.is_admin());

revoke all on public.admin_activity_dismissals from public, anon, authenticated;
grant select, insert, delete on public.admin_activity_dismissals to authenticated;
grant all on public.admin_activity_dismissals to service_role;

-- ---------------------------------------------------------------------------
-- The feed: same as 0014, minus the rows the caller dismissed.
-- The audit row written by admin_delete_activity() ('activity.delete') is kept out of the feed so that clearing the
-- feed does not put a new line in it. It is still in the audit log.
-- ---------------------------------------------------------------------------
create or replace function public.admin_activity(p_limit integer default 15) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_limit integer := least(greatest(coalesce(p_limit, 15), 1), 50);
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.at desc, x.id desc) from (
      select * from (
        select 'n:' || n.id::text as id, n.created_at as at, n.kind, n.business_id,
               coalesce(b.name, n.data->>'business_name') as business_name,
               null::text as actor, n.data
          from public.admin_notifications n
          left join public.businesses b on b.id = n.business_id
         where n.kind <> 'application_submitted' or public.has_role(array['owner', 'reviewer'])
        union all
        select 'a:' || a.id::text, a.created_at, a.action, a.business_id, b.name,
               coalesce(a.actor_email, a.actor_role),
               coalesce(a.data, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('reason', a.reason))
          from public.audit_log a
          left join public.businesses b on b.id = a.business_id
         where a.action not in ('payment_submitted', 'change_requested', 'flag_replied', 'deletion_requested', 'activity.delete')
           and not exists (
             select 1 from public.admin_activity_dismissals d
              where d.admin_id = auth.uid() and d.activity_id = 'a:' || a.id::text)
      ) u
      order by u.at desc, u.id desc
      limit v_limit
    ) x
  ), '[]'::jsonb);
end $$;

revoke all on function public.admin_activity(integer) from public, anon;
grant execute on function public.admin_activity(integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- admin_delete_activity(p_ids, p_reason): the one way the feed is cleared.
--   "n:<uuid>"   -> the notification is deleted for everyone
--   "a:<number>" -> the audit row is hidden for the caller only (audit_log is not touched)
-- Owner and reviewer only, the same roles as 'activity.manage' in admin/src/auth/permissions.js.
-- Returns { deleted, dismissed, skipped }: skipped is what was already gone or already hidden.
-- Any id that is not one of the two shapes rejects the whole call (invalid_input), so nothing is half done.
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_activity(p_ids text[], p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid       uuid := auth.uid();
  v_ids       text[];
  v_notif     uuid[];
  v_audit     bigint[];
  v_deleted   integer := 0;
  v_dismissed integer := 0;
  v_kinds     jsonb := '[]'::jsonb;
begin
  if v_uid is null or not public.has_role(array['reviewer']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(p_ids) as t(x) where x is not null;
  if cardinality(v_ids) = 0 then
    raise exception 'invalid_input' using detail = 'no ids';
  end if;
  if cardinality(v_ids) > 200 then
    raise exception 'too_many' using detail = 'at most 200 ids per call';
  end if;
  if exists (
    select 1 from unnest(v_ids) as t(x)
     where x !~ '^n:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       and x !~ '^a:[0-9]{1,18}$'
  ) then
    raise exception 'invalid_input' using detail = 'unknown id';
  end if;

  select coalesce(array_agg(substr(x, 3)::uuid), '{}') into v_notif from unnest(v_ids) as t(x) where x like 'n:%';
  select coalesce(array_agg(substr(x, 3)::bigint), '{}') into v_audit from unnest(v_ids) as t(x) where x like 'a:%';

  -- Notifications: really deleted. The kinds go into the audit entry because the rows cannot be restored.
  with gone as (
    delete from public.admin_notifications n where n.id = any(v_notif) returning n.kind
  )
  select count(*)::integer, coalesce(jsonb_agg(g.kind order by g.kind), '[]'::jsonb) into v_deleted, v_kinds from gone g;

  -- Audit rows: only an entry in the caller's own dismissal list. Ids that are not in audit_log are ignored.
  with hidden as (
    insert into public.admin_activity_dismissals (admin_id, activity_id)
    select v_uid, 'a:' || a.id::text from public.audit_log a where a.id = any(v_audit)
    on conflict (admin_id, activity_id) do nothing
    returning 1
  )
  select count(*)::integer into v_dismissed from hidden;

  if v_deleted > 0 then
    perform public.admin_audit_action('activity.delete', 'admin_notification', null, null,
      jsonb_build_object('deleted', v_deleted, 'kinds', v_kinds), nullif(btrim(coalesce(p_reason, '')), ''));
  end if;

  return jsonb_build_object('deleted', v_deleted, 'dismissed', v_dismissed,
                            'skipped', cardinality(v_ids) - v_deleted - v_dismissed);
end $$;

revoke all on function public.admin_delete_activity(text[], text) from public, anon;
grant execute on function public.admin_delete_activity(text[], text) to authenticated, service_role;
