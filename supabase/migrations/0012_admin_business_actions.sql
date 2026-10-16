-- B3a/B3b: the write side of the business admin. Each action is its own RPC (what the detail page calls), and the
-- list's bulk bar calls the same core, so a single and a bulk action can never behave differently.
--
-- Roles (owner always passes, see has_role):
--   suspend, unsuspend, unlist, relist, verification, strikes, feature, tags, assign, message : reviewer, support
--   extend days                                                                             : finance
--   delete, restore                                                                         : owner only
-- A reason (3 to 300 characters) is required for suspend, unsuspend, unlist, extend, verification, strikes, delete and
-- restore. Every action appends audit_log with before/after and the reason.

create or replace function public.admin_business_apply(p_id uuid, p_action text, p_reason text default null, p_args jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b public.businesses;
  v_before jsonb;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_args jsonb := coalesce(p_args, '{}'::jsonb);
  v_roles text[];
  v_days int;
  v_base date;
  v_new_paid timestamptz;
  v_tags text[];
  v_tag text;
  v_agent uuid;
  v_level text;
  v_delta int;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_roles := case p_action
    when 'extend' then array['finance']
    when 'delete' then array[]::text[]
    when 'restore' then array[]::text[]
    when 'suspend' then array['reviewer', 'support']
    when 'unsuspend' then array['reviewer', 'support']
    when 'unlist' then array['reviewer', 'support']
    when 'relist' then array['reviewer', 'support']
    when 'verify' then array['reviewer', 'support']
    when 'strikes' then array['reviewer', 'support']
    when 'feature' then array['reviewer', 'support']
    when 'tag' then array['reviewer', 'support']
    when 'assign' then array['reviewer', 'support']
    else null end;
  if v_roles is null then raise exception 'invalid_action'; end if;
  if not public.has_role(v_roles) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_action in ('suspend', 'unsuspend', 'unlist', 'extend', 'verify', 'strikes', 'delete', 'restore')
     and (v_reason is null or char_length(v_reason) < 3 or char_length(v_reason) > 300) then
    raise exception 'reason_required';
  end if;

  select * into b from public.businesses where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  v_before := jsonb_build_object('status', b.status, 'status_reason', b.status_reason, 'paid_until', b.paid_until,
    'featured', b.featured, 'featured_until', b.featured_until, 'featured_rank', b.featured_rank,
    'verification_level', b.verification_level, 'strikes', b.strikes, 'tags', to_jsonb(b.tags),
    'assigned_agent', b.assigned_agent, 'deleted_at', b.deleted_at);

  if b.deleted_at is not null and p_action <> 'restore' then raise exception 'invalid_status'; end if;

  if p_action = 'suspend' then
    if b.status not in ('live', 'paused', 'expired') then raise exception 'invalid_status'; end if;
    b.status := 'suspended'; b.status_reason := v_reason;
  elsif p_action = 'unsuspend' then
    if b.status <> 'suspended' then raise exception 'invalid_status'; end if;
    b.status := 'live'; b.status_reason := null;
  elsif p_action = 'unlist' then
    if b.status <> 'live' then raise exception 'invalid_status'; end if;
    b.status := 'paused'; b.status_reason := v_reason;
  elsif p_action = 'relist' then
    if b.status <> 'paused' then raise exception 'invalid_status'; end if;
    b.status := 'live'; b.status_reason := null;
  elsif p_action = 'feature' then
    if jsonb_typeof(v_args -> 'featured') <> 'boolean' then raise exception 'invalid_args'; end if;
    b.featured := (v_args ->> 'featured')::boolean;
    if b.featured then
      b.featured_until := nullif(v_args ->> 'until', '')::timestamptz;
      b.featured_rank := nullif(v_args ->> 'rank', '')::int;
      if b.featured_until is not null and b.featured_until <= now() then raise exception 'invalid_args'; end if;
    else
      b.featured_until := null; b.featured_rank := null;
    end if;
  elsif p_action = 'extend' then
    if b.status not in ('live', 'paused', 'suspended', 'expired') then raise exception 'invalid_status'; end if;
    v_days := (v_args ->> 'days')::int;
    if v_days is null or v_days < 1 or v_days > 365 then raise exception 'invalid_args'; end if;
    -- From the later of today and the current paid_until, so an early extension loses no days.
    v_base := greatest(coalesce(public.nairobi_day(b.paid_until), public.nairobi_today()), public.nairobi_today());
    v_new_paid := public.nairobi_midnight(v_base + v_days);
    b.paid_until := v_new_paid;
    if b.first_paid_at is null and b.status = 'live' then b.first_paid_at := now(); end if;
    if b.status = 'expired' and public.listing_state(v_new_paid) = 'active' then
      b.status := 'live'; b.status_reason := null;
    end if;
  elsif p_action = 'verify' then
    v_level := v_args ->> 'level';
    if v_level not in ('verified', 'unverified') then raise exception 'invalid_args'; end if;
    b.verification_level := v_level;
  elsif p_action = 'strikes' then
    v_delta := (v_args ->> 'delta')::int;
    if v_delta is null or v_delta = 0 or abs(v_delta) > 3 then raise exception 'invalid_args'; end if;
    b.strikes := greatest(0, b.strikes + v_delta);
  elsif p_action = 'tag' then
    v_tags := coalesce(b.tags, '{}');
    for v_tag in select lower(btrim(x)) from jsonb_array_elements_text(coalesce(v_args -> 'add', '[]'::jsonb)) x loop
      if char_length(v_tag) < 1 or char_length(v_tag) > 30 then raise exception 'invalid_args'; end if;
      if not (v_tag = any(v_tags)) then v_tags := v_tags || v_tag; end if;
    end loop;
    for v_tag in select lower(btrim(x)) from jsonb_array_elements_text(coalesce(v_args -> 'remove', '[]'::jsonb)) x loop
      v_tags := array_remove(v_tags, v_tag);
    end loop;
    if cardinality(v_tags) > 10 then raise exception 'too_many_tags'; end if;
    b.tags := v_tags;
  elsif p_action = 'assign' then
    v_agent := nullif(v_args ->> 'agent', '')::uuid;
    if v_agent is not null and not exists (select 1 from public.admins a where a.user_id = v_agent) then raise exception 'unknown_agent'; end if;
    b.assigned_agent := v_agent;
  elsif p_action = 'delete' then
    b.status := 'deleted'; b.deleted_at := now(); b.status_reason := v_reason; b.featured := false; b.featured_until := null; b.featured_rank := null;
  elsif p_action = 'restore' then
    if b.deleted_at is null then raise exception 'invalid_status'; end if;
    -- Back as unlisted, so an admin decides when customers see it again.
    b.status := 'paused'; b.deleted_at := null; b.status_reason := v_reason;
  end if;

  update public.businesses set
    status = b.status, status_reason = b.status_reason, paid_until = b.paid_until, first_paid_at = b.first_paid_at,
    featured = b.featured, featured_until = b.featured_until, featured_rank = b.featured_rank,
    verification_level = b.verification_level, strikes = b.strikes, tags = b.tags,
    assigned_agent = b.assigned_agent, deleted_at = b.deleted_at, updated_at = now()
  where id = p_id;

  perform public.admin_audit_action('business.' || p_action, 'business', p_id::text, v_before,
    jsonb_build_object('status', b.status, 'status_reason', b.status_reason, 'paid_until', b.paid_until,
      'featured', b.featured, 'featured_until', b.featured_until, 'featured_rank', b.featured_rank,
      'verification_level', b.verification_level, 'strikes', b.strikes, 'tags', to_jsonb(b.tags),
      'assigned_agent', b.assigned_agent, 'deleted_at', b.deleted_at),
    v_reason, p_id);

  return jsonb_build_object('id', p_id, 'status', b.status, 'status_reason', b.status_reason, 'paid_until', b.paid_until,
    'featured', b.featured, 'featured_until', b.featured_until, 'verification_level', b.verification_level,
    'strikes', b.strikes, 'tags', to_jsonb(b.tags), 'assigned_agent', b.assigned_agent, 'deleted_at', b.deleted_at);
end $$;
revoke all on function public.admin_business_apply(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.admin_business_apply(uuid, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Messages to a seller: in-app notice, SMS or email, queued like every other outbound message.
-- ---------------------------------------------------------------------------
create or replace function public.admin_message_business(p_id uuid, p_subject text, p_body text, p_channels text[] default array['in_app']) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b public.businesses;
  v_subject text := nullif(btrim(coalesce(p_subject, '')), '');
  v_body text := btrim(coalesce(p_body, ''));
  v_ch text;
  v_sent text[] := '{}';
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not public.has_role(array['reviewer', 'support']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 1000 then raise exception 'invalid_args'; end if;
  if v_subject is not null and char_length(v_subject) > 150 then raise exception 'invalid_args'; end if;
  if p_channels is null or cardinality(p_channels) = 0 or not (p_channels <@ array['in_app', 'sms', 'email']) then raise exception 'invalid_args'; end if;
  select * into b from public.businesses where id = p_id and deleted_at is null;
  if not found then raise exception 'not_found'; end if;

  foreach v_ch in array p_channels loop
    if v_ch = 'in_app' then
      if v_subject is null then raise exception 'subject_required'; end if;
      insert into public.messages (business_id, subject, body, channel, template_key, created_by, transactional, status, sent_at)
        values (p_id, v_subject, v_body, 'in_app', 'admin_message', auth.uid(), false, 'sent', now());
    elsif v_ch = 'sms' then
      if char_length(v_body) > 480 then raise exception 'sms_too_long'; end if;
      insert into public.messages (business_id, subject, body, channel, template_key, to_address, created_by, transactional, status)
        values (p_id, null, v_body, 'sms', 'admin_message', b.phone, auth.uid(), false, 'queued');
    else
      if b.email is null then raise exception 'no_email'; end if;
      if v_subject is null then raise exception 'subject_required'; end if;
      insert into public.messages (business_id, subject, body, channel, template_key, to_address, created_by, transactional, status)
        values (p_id, v_subject, v_body, 'email', 'admin_message', b.email, auth.uid(), false, 'queued');
    end if;
    v_sent := v_sent || v_ch;
  end loop;

  perform public.admin_audit_action('business.message', 'business', p_id::text, null,
    jsonb_build_object('channels', to_jsonb(v_sent), 'subject', v_subject), null, p_id);
  return jsonb_build_object('id', p_id, 'channels', to_jsonb(v_sent));
end $$;
revoke all on function public.admin_message_business(uuid, text, text, text[]) from public, anon;
grant execute on function public.admin_message_business(uuid, text, text, text[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- One RPC per action (the detail page calls these)
-- ---------------------------------------------------------------------------
create or replace function public.admin_suspend_business(p_id uuid, p_reason text) returns jsonb
language sql security definer set search_path = public as $$ select public.admin_business_apply(p_id, 'suspend', p_reason) $$;
create or replace function public.admin_unsuspend_business(p_id uuid, p_reason text) returns jsonb
language sql security definer set search_path = public as $$ select public.admin_business_apply(p_id, 'unsuspend', p_reason) $$;
create or replace function public.admin_unlist_business(p_id uuid, p_reason text) returns jsonb
language sql security definer set search_path = public as $$ select public.admin_business_apply(p_id, 'unlist', p_reason) $$;
create or replace function public.admin_relist_business(p_id uuid, p_reason text default null) returns jsonb
language sql security definer set search_path = public as $$ select public.admin_business_apply(p_id, 'relist', p_reason) $$;
create or replace function public.admin_feature_business(p_id uuid, p_featured boolean, p_until timestamptz default null, p_rank int default null, p_reason text default null) returns jsonb
language sql security definer set search_path = public as $$
  select public.admin_business_apply(p_id, 'feature', p_reason, jsonb_build_object('featured', p_featured, 'until', p_until, 'rank', p_rank)) $$;
create or replace function public.admin_extend_business(p_id uuid, p_days int, p_reason text) returns jsonb
language sql security definer set search_path = public as $$ select public.admin_business_apply(p_id, 'extend', p_reason, jsonb_build_object('days', p_days)) $$;
create or replace function public.admin_set_business_verification(p_id uuid, p_level text, p_reason text) returns jsonb
language sql security definer set search_path = public as $$ select public.admin_business_apply(p_id, 'verify', p_reason, jsonb_build_object('level', p_level)) $$;
create or replace function public.admin_adjust_business_strikes(p_id uuid, p_delta int, p_reason text) returns jsonb
language sql security definer set search_path = public as $$ select public.admin_business_apply(p_id, 'strikes', p_reason, jsonb_build_object('delta', p_delta)) $$;
create or replace function public.admin_tag_business(p_id uuid, p_add text[] default '{}', p_remove text[] default '{}') returns jsonb
language sql security definer set search_path = public as $$
  select public.admin_business_apply(p_id, 'tag', null, jsonb_build_object('add', to_jsonb(coalesce(p_add, '{}')), 'remove', to_jsonb(coalesce(p_remove, '{}')))) $$;
create or replace function public.admin_assign_business_agent(p_id uuid, p_agent uuid default null) returns jsonb
language sql security definer set search_path = public as $$ select public.admin_business_apply(p_id, 'assign', null, jsonb_build_object('agent', p_agent)) $$;
create or replace function public.admin_delete_business(p_id uuid, p_reason text) returns jsonb
language sql security definer set search_path = public as $$ select public.admin_business_apply(p_id, 'delete', p_reason) $$;
create or replace function public.admin_restore_business(p_id uuid, p_reason text) returns jsonb
language sql security definer set search_path = public as $$ select public.admin_business_apply(p_id, 'restore', p_reason) $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'admin_suspend_business(uuid, text)', 'admin_unsuspend_business(uuid, text)', 'admin_unlist_business(uuid, text)',
    'admin_relist_business(uuid, text)', 'admin_feature_business(uuid, boolean, timestamptz, int, text)',
    'admin_extend_business(uuid, int, text)', 'admin_set_business_verification(uuid, text, text)',
    'admin_adjust_business_strikes(uuid, int, text)', 'admin_tag_business(uuid, text[], text[])',
    'admin_assign_business_agent(uuid, uuid)', 'admin_delete_business(uuid, text)', 'admin_restore_business(uuid, text)'] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Bulk: the same core, one business at a time, so one bad row never blocks the rest.
-- ---------------------------------------------------------------------------
create or replace function public.admin_bulk_businesses(p_ids uuid[], p_action text, p_reason text default null, p_args jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_done int := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_args jsonb := coalesce(p_args, '{}'::jsonb);
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_action not in ('suspend', 'unsuspend', 'unlist', 'relist', 'feature', 'extend', 'tag', 'assign', 'message') then
    raise exception 'invalid_action';
  end if;
  if p_ids is null or cardinality(p_ids) < 1 or cardinality(p_ids) > 200 then raise exception 'invalid_selection'; end if;

  foreach v_id in array (select array(select distinct unnest(p_ids))) loop
    begin
      if p_action = 'message' then
        perform public.admin_message_business(v_id, v_args ->> 'subject', v_args ->> 'body',
          coalesce(array(select jsonb_array_elements_text(v_args -> 'channels')), array['in_app']));
      else
        perform public.admin_business_apply(v_id, p_action, p_reason, v_args);
      end if;
      v_done := v_done + 1;
    exception when others then
      -- A permission or reason problem is the same for every row: stop instead of failing 200 times.
      if sqlerrm in ('forbidden', 'reason_required', 'invalid_args', 'invalid_action', 'too_many_tags', 'unknown_agent', 'sms_too_long', 'subject_required') then
        raise;
      end if;
      v_skipped := v_skipped || jsonb_build_object('id', v_id, 'error', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('done', v_done, 'skipped', v_skipped);
end $$;
revoke all on function public.admin_bulk_businesses(uuid[], text, text, jsonb) from public, anon;
grant execute on function public.admin_bulk_businesses(uuid[], text, text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
create or replace function public.admin_add_business_note(p_id uuid, p_body text, p_pinned boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
  v_note public.business_notes;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then raise exception 'invalid_args'; end if;
  if not exists (select 1 from public.businesses where id = p_id) then raise exception 'not_found'; end if;
  insert into public.business_notes (business_id, author_id, author_email, body, pinned)
    values (p_id, auth.uid(), (select u.email from auth.users u where u.id = auth.uid()), v_body, coalesce(p_pinned, false))
    returning * into v_note;
  perform public.admin_audit_action('business.note_added', 'business', p_id::text, null,
    jsonb_build_object('note_id', v_note.id, 'pinned', v_note.pinned), null, p_id);
  return jsonb_build_object('id', v_note.id, 'body', v_note.body, 'pinned', v_note.pinned, 'author_email', v_note.author_email, 'created_at', v_note.created_at);
end $$;

create or replace function public.admin_set_business_note_pinned(p_note_id uuid, p_pinned boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_business uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.business_notes set pinned = coalesce(p_pinned, false) where id = p_note_id returning business_id into v_business;
  if v_business is null then raise exception 'not_found'; end if;
  perform public.admin_audit_action('business.note_pinned', 'business', v_business::text, null,
    jsonb_build_object('note_id', p_note_id, 'pinned', coalesce(p_pinned, false)), null, v_business);
  return true;
end $$;

-- An admin deletes their own notes; the owner can delete any.
create or replace function public.admin_delete_business_note(p_note_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  n public.business_notes;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into n from public.business_notes where id = p_note_id;
  if not found then raise exception 'not_found'; end if;
  if n.author_id is distinct from auth.uid() and not exists (select 1 from public.admins a where a.user_id = auth.uid() and a.role = 'owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.business_notes where id = p_note_id;
  perform public.admin_audit_action('business.note_deleted', 'business', n.business_id::text,
    jsonb_build_object('note_id', n.id, 'body', n.body), null, null, n.business_id);
  return true;
end $$;

revoke all on function public.admin_add_business_note(uuid, text, boolean) from public, anon;
revoke all on function public.admin_set_business_note_pinned(uuid, boolean) from public, anon;
revoke all on function public.admin_delete_business_note(uuid) from public, anon;
grant execute on function public.admin_add_business_note(uuid, text, boolean) to authenticated, service_role;
grant execute on function public.admin_set_business_note_pinned(uuid, boolean) to authenticated, service_role;
grant execute on function public.admin_delete_business_note(uuid) to authenticated, service_role;
