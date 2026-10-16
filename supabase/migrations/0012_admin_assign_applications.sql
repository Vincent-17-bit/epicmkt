-- B2a: the applications queue.
--
-- Adds what the queue screen needs and nothing else:
--   admin_list_reviewers()                      who an application can be assigned to (names for the Assignee column)
--   admin_assign_applications(ids, reviewer)    bulk assign / unassign, role-checked, audited, one event per application
--   indexes for the queue's search box and the "assigned to" filter
--
-- Numbering: 0011 is reserved for the messaging migration (feat/b0d-messaging-jobs).
--
-- Rules for assigning (the screen mirrors them, but this is the real gate):
--   owner     may assign any open application to any owner or reviewer, or clear the assignee.
--   reviewer  may take an application for themselves (when it has no assignee, or is already theirs)
--             and may clear an assignee only on applications that are theirs.
--   others    forbidden.
-- Assigning never changes the application's status. "Start review" (admin_open_application) still does that.
-- Only applications still in the queue can be assigned: submitted, under_review, changes_requested.

-- ---------------------------------------------------------------------------
-- Who can be assigned
-- ---------------------------------------------------------------------------
-- public.admins is readable only by its owner row (and the owner role), so a reviewer could not otherwise learn a
-- colleague's name. This returns just what a queue needs, to owners and reviewers only.
create or replace function public.admin_list_reviewers()
returns table (user_id uuid, display_name text, email text, role text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(array['owner','reviewer']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select a.user_id, a.display_name, a.email, a.role
      from public.admins a
     where a.role in ('owner','reviewer')
     order by coalesce(nullif(a.display_name, ''), a.email, a.user_id::text), a.user_id;
end $$;
revoke all on function public.admin_list_reviewers() from public, anon;
grant execute on function public.admin_list_reviewers() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Bulk assign
-- ---------------------------------------------------------------------------
-- p_reviewer null clears the assignee. Returns { updated, skipped }: skipped counts everything that was not changed
-- (not found, already finished, already assigned to that person, or not yours to change).
create or replace function public.admin_assign_applications(p_ids uuid[], p_reviewer uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  is_owner boolean;
  target_role text;
  ids uuid[];
  r record;
  changed int := 0;
  wanted int;
begin
  if not public.has_role(array['owner','reviewer']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select a.role = 'owner' into is_owner from public.admins a where a.user_id = me;

  -- distinct, non-null ids; a bulk action is capped so one click cannot lock the whole table
  select coalesce(array_agg(distinct x), '{}') into ids from unnest(coalesce(p_ids, '{}')) as x where x is not null;
  wanted := cardinality(ids);
  if wanted = 0 then
    return jsonb_build_object('updated', 0, 'skipped', 0);
  end if;
  if wanted > 100 then
    raise exception 'too_many' using errcode = '22023';
  end if;

  if p_reviewer is not null then
    select a.role into target_role from public.admins a where a.user_id = p_reviewer;
    if target_role is null or target_role not in ('owner','reviewer') then
      raise exception 'invalid_reviewer' using errcode = '22023';
    end if;
    if not is_owner and p_reviewer <> me then
      raise exception 'forbidden' using errcode = '42501'; -- a reviewer can take work, not hand it to someone else
    end if;
  end if;

  for r in
    select id, status, reviewer_id
      from public.applications
     where id = any(ids)
       and status in ('submitted','under_review','changes_requested')
     order by id
       for update
  loop
    -- no change, or not theirs to change
    if r.reviewer_id is not distinct from p_reviewer then continue; end if;
    if not is_owner and r.reviewer_id is not null and r.reviewer_id <> me then continue; end if;

    update public.applications set reviewer_id = p_reviewer where id = r.id;

    insert into public.application_events(application_id, actor, type, data)
      values (r.id, 'admin', case when p_reviewer is null then 'unassigned' else 'assigned' end,
              jsonb_build_object('by', me, 'to', p_reviewer, 'from', r.reviewer_id));
    perform public.admin_audit_action(
      case when p_reviewer is null then 'application.unassign' else 'application.assign' end,
      'application', r.id::text,
      jsonb_build_object('reviewer_id', r.reviewer_id), jsonb_build_object('reviewer_id', p_reviewer), null);
    changed := changed + 1;
  end loop;

  return jsonb_build_object('updated', changed, 'skipped', wanted - changed);
end $$;
revoke all on function public.admin_assign_applications(uuid[], uuid) from public, anon;
grant execute on function public.admin_assign_applications(uuid[], uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Indexes for the queue
-- ---------------------------------------------------------------------------
create index if not exists applications_reviewer_idx on public.applications (reviewer_id, status);
create index if not exists applications_business_name_trgm on public.applications using gin (business_name extensions.gin_trgm_ops);
create index if not exists applications_owner_name_trgm on public.applications using gin (owner_full_name extensions.gin_trgm_ops);
create index if not exists applications_reference_trgm on public.applications using gin (reference_no extensions.gin_trgm_ops);
