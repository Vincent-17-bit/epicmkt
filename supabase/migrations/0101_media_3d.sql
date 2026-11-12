-- 0101_media_3d.sql  (A17: 3D data, media roles and signed uploads)
--
--   * item_media.role      image | video | spin-frame | model-glb | poster. item_media.kind gains model, spin and poster (one kind per role), so
--                          every existing query that filters kind = 'image' or 'video' (gallery, counts, limits, reorder, copy) keeps
--                          returning exactly what it did. Existing rows get role = kind.
--   * item_media.option_ids  text[] of option VALUE ids (plain ids, NO foreign key: J01 adds the link). A photo or video may list several
--                          values; a 3D asset lists none (the item) or exactly one. An empty list = belongs to the whole item.
--   * Files: a .glb is a file in the Supabase bucket (like a video; the bucket now allows model/gltf-binary). Posters and spin frames are
--     pictures in Cloudinary. media_uploads / media_register_upload / the GC trigger and queue know the three new purposes
--     (item_model, item_poster, item_spin).
--   * attach_item_media3d(...)  service-only. A model or poster REPLACES the one in the same scope (the old file is queued for deletion);
--                          a spin takes up to 72 frames per scope, in the order given by p_position (or upload order).
--   * seller_set_media_options  a seller sets which option values a photo or video belongs to.
--   * seller_item_media3d       the seller read for the 3D uploaders. seller_item_media now lists only photos and videos (plus role, optionIds).
--   * item_check_media3d(item jsonb)  issues for seller_check_item: view3d_missing_poster, spin_too_few_frames, spin_too_many_frames.
--   * public_item_media3d(item)  { view3d, view3dByOption } as PATHS (shared/src/media3d.js resolveMedia3d makes urls). A view needs a poster
--                          AND (a model, or 12 to 72 spin frames); anything else is left out.
--   * items.has_3d              kept by triggers on item_media: true when the item has at least one visible view.
--   * public_items.media        photos and videos only, each with id, role and optionIds (ids of values that still exist).
-- The rules mirror shared/src/media3d.js (db tests run both on the same cases). Never edit this file once applied.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Columns and constraints
-- ---------------------------------------------------------------------------------------------------------------------

alter table public.item_media add column if not exists role text;
alter table public.item_media add column if not exists option_ids text[] not null default '{}';
update public.item_media set role = kind where role is null;
alter table public.item_media alter column role set not null;

create or replace function public.media_option_ids_ok(p_ids text[], p_role text) returns boolean
language sql immutable parallel safe as $$
  select p_ids is not null
    and cardinality(p_ids) <= (case when p_role in ('spin-frame', 'model-glb', 'poster') then 1 else 40 end)
    and (select count(distinct x) = cardinality(p_ids) and coalesce(bool_and(x ~ '^[a-z0-9][a-z0-9_-]{0,39}$'), true) from unnest(p_ids) as x)
$$;

create or replace function public.item_media_role_default() returns trigger
language plpgsql as $$
begin
  new.role := coalesce(new.role, case new.kind when 'model' then 'model-glb' when 'spin' then 'spin-frame' else new.kind end);
  return new;
end $$;
drop trigger if exists item_media_role_default on public.item_media;
create trigger item_media_role_default before insert on public.item_media for each row execute function public.item_media_role_default();

alter table public.item_media drop constraint if exists item_media_kind_check;
alter table public.item_media add constraint item_media_kind_check check (kind in ('image', 'video', 'model', 'spin', 'poster'));
alter table public.item_media drop constraint if exists item_media_role_ck;
alter table public.item_media add constraint item_media_role_ck check (
  (kind, role) in (('image', 'image'), ('video', 'video'), ('model', 'model-glb'), ('spin', 'spin-frame'), ('poster', 'poster')));
alter table public.item_media drop constraint if exists item_media_option_ids_ck;
alter table public.item_media add constraint item_media_option_ids_ck check (public.media_option_ids_ok(option_ids, role));
create index if not exists item_media_item_role_idx on public.item_media (item_id, role);

-- Does this item have an option value with this id (in any axis)?
create or replace function public.item_has_option_value(p_item uuid, p_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.items i,
      jsonb_array_elements(case when jsonb_typeof(i.option_axes) = 'array' then i.option_axes else '[]'::jsonb end) as a(e),
      jsonb_array_elements(case when jsonb_typeof(a.e -> 'values') = 'array' then a.e -> 'values' else '[]'::jsonb end) as v(e)
    where i.id = p_item and v.e ->> 'id' = p_id)
$$;
-- public_items calls it as the reader, so anon needs it. It only says whether an option value id exists on an item.
revoke all on function public.item_has_option_value(uuid, text) from public;
grant execute on function public.item_has_option_value(uuid, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Files: bucket, path rules, uploads, garbage collection
-- ---------------------------------------------------------------------------------------------------------------------

update storage.buckets
   set allowed_mime_types = allowed_mime_types || array['model/gltf-binary']
 where id = 'seller-media' and allowed_mime_types is not null and not ('model/gltf-binary' = any (allowed_mime_types));
-- Only that one type is added (not application/octet-stream): the ticket tells the uploader to send contentType model/gltf-binary, and
-- seller-media3d-finalize reads the real bytes and deletes anything that is not a glTF 2 binary.

create or replace function public.is_storage_model_path(p text) returns boolean
language sql immutable as $$
  select p is not null
    and char_length(p) <= 300
    and p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.glb$'
$$;
revoke all on function public.is_storage_model_path(text) from public, anon, authenticated;
grant execute on function public.is_storage_model_path(text) to anon, authenticated, service_role;

alter table public.media_uploads drop constraint if exists media_uploads_purpose_ck;
alter table public.media_uploads drop constraint if exists media_uploads_id_ck;
alter table public.media_uploads drop constraint if exists media_uploads_item_ck;
alter table public.media_uploads
  add constraint media_uploads_purpose_ck check (purpose in ('item_photo', 'item_video', 'item_model', 'item_poster', 'item_spin', 'logo', 'cover', 'gallery', 'staff')),
  add constraint media_uploads_id_ck check (
    case purpose when 'item_video' then public.is_storage_video_path(public_id) when 'item_model' then public.is_storage_model_path(public_id)
    else public.is_cloudinary_id(public_id) end),
  add constraint media_uploads_item_ck check ((purpose in ('item_photo', 'item_video', 'item_model', 'item_poster', 'item_spin')) = (item_id is not null));

create or replace function public.media_register_upload(p_business uuid, p_item uuid, p_purpose text, p_public_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_purpose not in ('item_photo', 'item_video', 'item_model', 'item_poster', 'item_spin', 'logo', 'cover', 'gallery', 'staff') then raise exception 'invalid_purpose'; end if;
  if p_purpose in ('item_video', 'item_model') then
    if p_item is null or not exists (select 1 from public.items i where i.id = p_item and i.business_id = p_business) then raise exception 'item_not_found'; end if;
    if not (case p_purpose when 'item_video' then public.is_storage_video_path(p_public_id) else public.is_storage_model_path(p_public_id) end)
       or p_public_id not like p_business::text || '/' || p_item::text || '/%' then raise exception 'path_not_owned' using errcode = '42501'; end if;
  else
    if not public.is_cloudinary_id(p_public_id) or p_public_id not like p_business::text || '/%' then raise exception 'path_not_owned' using errcode = '42501'; end if;
    if p_purpose in ('item_photo', 'item_poster', 'item_spin') then
      if p_item is null or not exists (select 1 from public.items i where i.id = p_item and i.business_id = p_business) then raise exception 'item_not_found'; end if;
      if p_purpose <> 'item_photo' and p_public_id not like p_business::text || '/' || p_item::text || '/%' then raise exception 'path_not_owned' using errcode = '42501'; end if;
    elsif p_item is not null then
      raise exception 'invalid_purpose';
    elsif p_purpose in ('gallery', 'staff') and p_public_id not like p_business::text || '/' || p_purpose || '/%' then
      raise exception 'path_not_owned' using errcode = '42501';
    end if;
  end if;
  insert into public.media_uploads (public_id, business_id, item_id, purpose) values (p_public_id, p_business, p_item, p_purpose);
end $$;

create or replace function public.media_gc_enqueue(p_ids text[], p_reason text) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.media_gc (public_id, reason)
  select x, left(coalesce(p_reason, 'manual'), 60) from unnest(p_ids) as x
   where public.is_cloudinary_id(x) or public.is_storage_video_path(x) or public.is_storage_model_path(x)
  on conflict (public_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.media_gc_from_item_media() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.kind in ('image', 'spin', 'poster') and public.is_cloudinary_id(old.path) then
    insert into public.media_gc (public_id, reason) values (old.path, case old.kind when 'image' then 'photo_removed' else 'media3d_removed' end) on conflict (public_id) do nothing;
  elsif old.kind = 'video' and public.is_storage_video_path(old.path) then
    insert into public.media_gc (public_id, reason) values (old.path, 'video_removed') on conflict (public_id) do nothing;
  elsif old.kind = 'model' and public.is_storage_model_path(old.path) then
    insert into public.media_gc (public_id, reason) values (old.path, 'media3d_removed') on conflict (public_id) do nothing;
  end if;
  return null;
end $$;

-- A signed bucket ticket (video or model) lasts two hours, so those uploads get three hours before the sweep calls them abandoned.
create or replace function public.media_sweep_orphans(p_grace interval default interval '1 hour') returns integer
language plpgsql security definer set search_path = public as $$
declare queued integer;
begin
  with put as (
    insert into public.media_gc (public_id, reason)
    select u.public_id, 'unattached_upload' from public.media_uploads u
    where u.created_at < now() - (case when u.purpose in ('item_video', 'item_model') then greatest(p_grace, interval '3 hours') else p_grace end)
      and not public.media_in_use(u.public_id)
    on conflict (public_id) do nothing
    returning 1
  )
  select count(*) into queued from put;
  delete from public.media_uploads u
  where u.created_at < now() - (case when u.purpose in ('item_video', 'item_model') then greatest(p_grace, interval '3 hours') else p_grace end);
  return queued;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. The 3D views (one per scope: the whole item, or one option value)
-- ---------------------------------------------------------------------------------------------------------------------

create or replace function public.item_view3d_scopes(p_item uuid) returns table (scope text, model jsonb, frames jsonb, n integer, poster text)
language sql stable security definer set search_path = public as $$
  with m as (
    select x.kind, x.path, x.size_bytes, coalesce(x.option_ids[1], '') as scope, x.sort, x.created_at, x.id
    from public.item_media x where x.item_id = p_item and x.kind in ('model', 'spin', 'poster')
  )
  select g.scope,
    (select jsonb_build_object('path', x.path, 'size', x.size_bytes) from m x where x.scope = g.scope and x.kind = 'model' order by x.sort, x.created_at, x.id limit 1),
    (select jsonb_agg(x.path order by x.sort, x.created_at, x.id) from m x where x.scope = g.scope and x.kind = 'spin'),
    (select count(*)::integer from m x where x.scope = g.scope and x.kind = 'spin'),
    (select x.path from m x where x.scope = g.scope and x.kind = 'poster' order by x.sort, x.created_at, x.id limit 1)
  from (select distinct m.scope from m) g
$$;

-- { "": view, "<valueId>": view } for the scopes a buyer may see (poster AND (model OR 12..72 frames)).
create or replace function public.item_view3d_raw(p_item uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(s.scope,
      jsonb_build_object('poster', s.poster)
      || case when s.model is not null then jsonb_build_object('model', s.model) else '{}'::jsonb end
      || case when s.n between 12 and 72 then jsonb_build_object('spin', jsonb_build_object('frames', s.frames, 'count', s.n)) else '{}'::jsonb end
    ) filter (where s.poster is not null and (s.model is not null or s.n between 12 and 72)), '{}'::jsonb)
  from public.item_view3d_scopes(p_item) s
$$;

create or replace function public.item_view3d_issues(p_item uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('code', q.code, 'scope', q.scope) order by q.scope nulls first, q.code), '[]'::jsonb)
  from (
    select nullif(s.scope, '') as scope, 'view3d_missing_poster' as code from public.item_view3d_scopes(p_item) s where s.poster is null and (s.model is not null or s.n > 0)
    union all select nullif(s.scope, ''), 'spin_too_few_frames' from public.item_view3d_scopes(p_item) s where s.n > 0 and s.n < 12
    union all select nullif(s.scope, ''), 'spin_too_many_frames' from public.item_view3d_scopes(p_item) s where s.n > 72
  ) q
$$;

-- For seller_check_item (wired by J01): item jsonb carries the item id; returns the list of issues.
create or replace function public.item_check_media3d(item jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if item is null or jsonb_typeof(item) <> 'object' or not public.option_uuid_ok(item -> 'id') then return '[]'::jsonb; end if;
  return public.item_view3d_issues((item ->> 'id')::uuid);
end $$;

create or replace function public.public_item_media3d(p_item uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from public.public_items pi where pi.id = p_item)
    then jsonb_build_object('view3d', public.item_view3d_raw(p_item) -> '', 'view3dByOption', public.item_view3d_raw(p_item) - '')
    else null end
$$;

revoke all on function public.item_view3d_scopes(uuid), public.item_view3d_raw(uuid), public.item_view3d_issues(uuid), public.item_check_media3d(jsonb) from public, anon, authenticated;
grant execute on function public.item_view3d_scopes(uuid), public.item_view3d_raw(uuid), public.item_view3d_issues(uuid), public.item_check_media3d(jsonb) to service_role;
revoke all on function public.public_item_media3d(uuid) from public, anon;
grant execute on function public.public_item_media3d(uuid) to anon, authenticated, service_role;

-- items.has_3d follows item_media (statement-level, so a 72-frame upload recomputes once per statement).
create or replace function public.item_media_refresh_3d(p_ids uuid[]) returns void
language sql security definer set search_path = public as $$
  update public.items i set has_3d = (public.item_view3d_raw(i.id) <> '{}'::jsonb)
   where i.id = any (p_ids) and i.has_3d is distinct from (public.item_view3d_raw(i.id) <> '{}'::jsonb)
$$;
revoke all on function public.item_media_refresh_3d(uuid[]) from public, anon, authenticated;
grant execute on function public.item_media_refresh_3d(uuid[]) to service_role;

create or replace function public.item_media_3d_ins() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.item_media_refresh_3d(array(select distinct n.item_id from new_rows n where n.kind in ('model', 'spin', 'poster'))); return null; end $$;
create or replace function public.item_media_3d_upd() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.item_media_refresh_3d(array(select distinct n.item_id from new_rows n where n.kind in ('model', 'spin', 'poster'))); return null; end $$;
create or replace function public.item_media_3d_del() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.item_media_refresh_3d(array(select distinct o.item_id from old_rows o where o.kind in ('model', 'spin', 'poster'))); return null; end $$;
drop trigger if exists t_item_media_3d_ins on public.item_media;
create trigger t_item_media_3d_ins after insert on public.item_media referencing new table as new_rows for each statement execute function public.item_media_3d_ins();
drop trigger if exists t_item_media_3d_upd on public.item_media;
create trigger t_item_media_3d_upd after update on public.item_media referencing new table as new_rows for each statement execute function public.item_media_3d_upd();
drop trigger if exists t_item_media_3d_del on public.item_media;
create trigger t_item_media_3d_del after delete on public.item_media referencing old table as old_rows for each statement execute function public.item_media_3d_del();

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Attaching and reading
-- ---------------------------------------------------------------------------------------------------------------------

create or replace function public.attach_item_media3d(
  p_item uuid, p_role text, p_path text, p_mime text, p_width integer, p_height integer, p_size bigint,
  p_option_ids text[] default '{}', p_position integer default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_bid uuid;
  v_kind text;
  v_scope text;
  v_sort integer;
  v_id uuid;
begin
  select i.business_id into v_bid from public.items i where i.id = p_item;
  if v_bid is null then raise exception 'item_not_found'; end if;
  v_kind := case p_role when 'spin-frame' then 'spin' when 'model-glb' then 'model' when 'poster' then 'poster' end;
  if v_kind is null then raise exception 'invalid_role'; end if;
  if p_path is null or p_path not like v_bid::text || '/' || p_item::text || '/%' then raise exception 'path_not_owned' using errcode = '42501'; end if;
  p_option_ids := coalesce(p_option_ids, '{}');
  if not public.media_option_ids_ok(p_option_ids, p_role) then raise exception 'bad_option_ids'; end if;
  if cardinality(p_option_ids) > 0 and not public.item_has_option_value(p_item, p_option_ids[1]) then raise exception 'unknown_option_value'; end if;
  if p_position is not null and p_position not between 0 and 71 then raise exception 'bad_position'; end if;
  v_scope := coalesce(p_option_ids[1], '');

  -- Same lock as media_limit_ok, so two uploads of one item cannot both pass a limit.
  perform pg_advisory_xact_lock(hashtext(v_bid::text || 'item_media'));

  if p_role = 'spin-frame' then
    if (select count(*) from public.item_media m where m.item_id = p_item and m.kind = 'spin' and coalesce(m.option_ids[1], '') = v_scope) >= 72 then
      raise exception 'limit_reached:spin_frames';
    end if;
    v_sort := coalesce(p_position, (select coalesce(max(m.sort) + 1, 0) from public.item_media m where m.item_id = p_item and m.kind = 'spin' and coalesce(m.option_ids[1], '') = v_scope));
  else
    -- One model and one poster per scope: a new one replaces the old (the old file is queued for deletion by the delete trigger).
    delete from public.item_media m where m.item_id = p_item and m.kind = v_kind and coalesce(m.option_ids[1], '') = v_scope;
    v_sort := 0;
  end if;
  if (select count(*) from public.item_media m where m.item_id = p_item and m.kind in ('model', 'spin', 'poster')) >= 500 then raise exception 'limit_reached:media3d'; end if;

  insert into public.item_media (item_id, business_id, kind, role, path, mime, sort, width, height, size_bytes, option_ids)
  values (p_item, v_bid, v_kind, p_role, p_path, p_mime, v_sort, p_width, p_height, p_size, p_option_ids)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.attach_item_media3d(uuid, text, text, text, integer, integer, bigint, text[], integer) from public, anon, authenticated;
grant execute on function public.attach_item_media3d(uuid, text, text, text, integer, integer, bigint, text[], integer) to service_role;

create or replace function public.seller_set_media_options(p_item uuid, p_media uuid, p_option_ids text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_kind text;
  v_ids text[] := coalesce(p_option_ids, '{}');
  x text;
begin
  perform public.assert_seller_active();
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if not exists (select 1 from public.items i where i.id = p_item and i.business_id = v_id and not i.removed_by_admin) then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;
  select m.kind into v_kind from public.item_media m where m.id = p_media and m.item_id = p_item and m.business_id = v_id;
  if v_kind is null then raise exception 'media_not_found' using errcode = 'P0001'; end if;
  -- A 3D asset chooses its scope when it is uploaded (the ticket takes optionIds); only photos and videos move afterwards.
  if v_kind not in ('image', 'video') then raise exception 'not_for_3d' using errcode = 'P0001'; end if;
  if not public.media_option_ids_ok(v_ids, v_kind) then raise exception 'bad_option_ids' using errcode = 'P0001'; end if;
  foreach x in array v_ids loop
    if not public.item_has_option_value(p_item, x) then raise exception 'unknown_option_value' using errcode = 'P0001'; end if;
  end loop;
  update public.item_media m set option_ids = v_ids where m.id = p_media;
  return jsonb_build_object('id', p_media, 'optionIds', to_jsonb(v_ids));
end $$;
revoke all on function public.seller_set_media_options(uuid, uuid, text[]) from public, anon;
grant execute on function public.seller_set_media_options(uuid, uuid, text[]) to authenticated, service_role;

-- The photo and video list is unchanged apart from role and optionIds; 3D rows have their own read below.
create or replace function public.seller_item_media(p_item uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_lim jsonb;
begin
  perform public.assert_seller_active();
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if not exists (select 1 from public.items i where i.id = p_item and i.business_id = v_id) then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;
  select case b.plan_key when 'premium' then g.premium else g.standard end into v_lim
  from public.businesses b cross join public.global_limits g where b.id = v_id and g.id = 1;
  return jsonb_build_object(
    'media', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'path', m.path, 'kind', m.kind, 'sort', m.sort, 'duration', m.duration_sec, 'role', m.role, 'optionIds', to_jsonb(m.option_ids)) order by m.sort, m.created_at, m.id)
                       from public.item_media m where m.item_id = p_item and m.kind in ('image', 'video')), '[]'::jsonb),
    'cover', (select m.path from public.item_media m where m.item_id = p_item and m.kind = 'image' order by m.sort, m.created_at, m.id limit 1),
    'limits', jsonb_build_object(
      'photos', jsonb_build_object('used', (select count(*) from public.item_media m where m.item_id = p_item and m.kind = 'image')::integer, 'max', (v_lim ->> 'photosPerItem')::integer),
      'videos', jsonb_build_object('used', (select count(*) from public.item_media m where m.item_id = p_item and m.kind = 'video')::integer, 'max', (v_lim ->> 'videosPerItem')::integer)));
end $$;

create or replace function public.seller_item_media3d(p_item uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid := public.my_business_id();
begin
  perform public.assert_seller_active();
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if not exists (select 1 from public.items i where i.id = p_item and i.business_id = v_id) then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'media3d', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'path', m.path, 'role', m.role, 'sort', m.sort, 'optionIds', to_jsonb(m.option_ids), 'size', m.size_bytes, 'width', m.width, 'height', m.height)
                          order by m.role, m.sort, m.created_at, m.id)
                         from public.item_media m where m.item_id = p_item and m.kind in ('model', 'spin', 'poster')), '[]'::jsonb),
    'issues', public.item_view3d_issues(p_item),
    'hasView', public.item_view3d_raw(p_item) <> '{}'::jsonb,
    'limits', jsonb_build_object('modelMaxBytes', 15728640, 'spinMinFrames', 12, 'spinMaxFrames', 72, 'maxRows', 500));
end $$;
revoke all on function public.seller_item_media3d(uuid) from public, anon;
grant execute on function public.seller_item_media3d(uuid) to authenticated, service_role;

-- Reordering photos and videos must ignore 3D rows (the list a seller sends has only photos and videos).
create or replace function public.seller_reorder_item_media(p_item uuid, p_paths text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_have text[];
  v_n integer;
begin
  perform public.assert_seller_active();
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if not exists (select 1 from public.items i where i.id = p_item and i.business_id = v_id and not i.removed_by_admin) then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;
  if p_paths is null then raise exception 'no_items' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext(v_id::text || 'item_media'));
  select coalesce(array_agg(m.path order by m.sort, m.created_at, m.id), '{}') into v_have
  from public.item_media m where m.item_id = p_item and m.business_id = v_id and m.kind in ('image', 'video');
  if cardinality(p_paths) <> (select count(distinct p) from unnest(p_paths) as p) then raise exception 'duplicate_path' using errcode = 'P0001'; end if;
  if exists (select 1 from unnest(p_paths) as p where p is null or p <> all (v_have)) then raise exception 'path_not_found' using errcode = 'P0001'; end if;
  if cardinality(p_paths) <> cardinality(v_have) then raise exception 'order_incomplete' using errcode = 'P0001'; end if;
  v_n := public.media_apply_order(p_item, p_paths);
  return jsonb_build_object('updated', v_n,
    'cover', (select m.path from public.item_media m where m.item_id = p_item and m.kind = 'image' order by m.sort, m.created_at, m.id limit 1));
end $$;

-- Same fix for the older photo-only reorder: its working list must not include 3D rows (their sort values are frame positions).
create or replace function public.seller_reorder_item_photos(p_item uuid, p_paths text[]) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_order text[];
  v_n integer;
begin
  perform public.assert_seller_active();
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if not exists (select 1 from public.items i where i.id = p_item and i.business_id = v_id and not i.removed_by_admin) then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;
  if p_paths is null or cardinality(p_paths) = 0 or cardinality(p_paths) > 50 then raise exception 'no_items' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext(v_id::text || 'item_media'));
  with cur as (
    select m.path, m.kind, row_number() over (order by m.sort, m.created_at, m.id) as rn
    from public.item_media m where m.item_id = p_item and m.business_id = v_id and m.kind in ('image', 'video')
  ), want as (
    select u.path, min(u.ord) as ord from unnest(p_paths) with ordinality as u(path, ord) group by u.path
  ), slots as (
    select rn, row_number() over (order by rn) as idx from cur where kind = 'image'
  ), picks as (
    select c.path, row_number() over (order by coalesce(w.ord, 2147483647), c.rn) as idx
    from cur c left join want w on w.path = c.path where c.kind = 'image'
  ), placed as (
    select c.path, c.rn as pos from cur c where c.kind <> 'image'
    union all
    select p.path, s.rn from picks p join slots s on s.idx = p.idx
  )
  select coalesce(array_agg(path order by pos), '{}') into v_order from placed;
  v_n := public.media_apply_order(p_item, v_order);
  return v_n;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. Public payload: photos and videos only, with id, role and optionIds (ids of values that still exist)
-- ---------------------------------------------------------------------------------------------------------------------

create or replace view public.public_items with (security_barrier = true) as
select
  i.id, i.business_id, i.name, i.description, i.section, i.price, i.price_max, i.price_type, i.unit,
  i.availability, i.sort, i.created_at,
  coalesce((select jsonb_agg(m.path order by m.sort, m.created_at, m.id) from public.item_media m where m.item_id = i.id and m.kind = 'image'), '[]'::jsonb) as image_paths,
  coalesce((select jsonb_agg(m.path order by m.sort, m.created_at, m.id) from public.item_media m where m.item_id = i.id and m.kind = 'video'), '[]'::jsonb) as video_paths,
  case when i.track_stock and i.show_stock_count and i.availability = 'limited_stock' and i.stock_count > 0 then i.stock_count end as stock_left,
  i.brand, i.short_description, i.highlights, i.specs, i.includes, i.terms, i.pack_size,
  coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'path', m.path, 'kind', m.kind, 'duration', m.duration_sec, 'role', m.role,
      'optionIds', to_jsonb(array(select u from unnest(m.option_ids) as u where public.item_has_option_value(i.id, u))))
      order by m.sort, m.created_at, m.id)
    from public.item_media m where m.item_id = i.id and m.kind in ('image', 'video')), '[]'::jsonb) as media,
  coalesce((select jsonb_agg(jsonb_build_object('id', x.e ->> 'id', 'label', x.e ->> 'label', 'price', (x.e ->> 'price')::numeric) order by x.n)
    from jsonb_array_elements(case when jsonb_typeof(i.variants) = 'array' then i.variants else '[]'::jsonb end) with ordinality as x(e, n)
    where coalesce(x.e ->> 'stock', '') <> '0'), '[]'::jsonb) as variants,
  i.price_min, i.price_high, i.has_options, i.department_id, i.product_type_id, i.has_3d
from public.items i
join public.businesses b on b.id = i.business_id
where public.business_is_visible(b) and i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin
  and public.item_is_listed(i.availability);
revoke all on public.public_items from public;
grant select on public.public_items to anon, authenticated, service_role;
