-- 0057_item_media_sequence.sql
-- Photos and videos of an item share ONE ordered sequence (item_media.sort, then created_at, then id).
--
--   * The first kind='image' row in that sequence is the cover. A video can sit anywhere in the sequence but is never the cover;
--     nothing stores the cover, it is always derived, so it cannot drift.
--   * seller_reorder_item_media(item, paths) orders the WHOLE sequence. It refuses a list that is not exactly the item's media.
--   * seller_item_media(item) reads the sequence and the plan limits ({photos:{used,max}, videos:{used,max}}) in one call.
--   * seller_reorder_item_photos (0053/0055) still works and is DEPRECATED: it reorders photos among the slots photos already
--     occupy, so videos keep their place in the sequence.
--   * attach_item_media appends at max(sort)+1. It used count(*), which collides with an existing row after a delete.
--   * public_items gains `media` (the merged sequence); image_paths and video_paths stay, in the same order.
--   * products_snapshot carries video_paths so a grid card no longer drops an item's videos.
--   * Videos live in the Supabase bucket, so an upload that is signed but never finalized, or a video that is deleted, can leave
--     a file behind. Signed video uploads are now recorded in media_uploads, and the sweep and the delete trigger queue the file
--     in media_gc; the media-gc function deletes it from storage.
-- Idempotent: every statement can be run twice.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Video paths in the upload and cleanup tables
-- ---------------------------------------------------------------------------------------------------------------------

create or replace function public.is_storage_video_path(p text) returns boolean
language sql immutable as $$
  select p is not null
    and char_length(p) <= 300
    and p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|webm)$'
$$;

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.media_uploads'::regclass and contype = 'c'
      and (pg_get_constraintdef(oid) ~ 'is_cloudinary_id|item_photo|purpose|is_storage_video_path')
  loop
    execute format('alter table public.media_uploads drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.media_uploads
  add constraint media_uploads_purpose_ck check (purpose in ('item_photo', 'item_video', 'logo', 'cover')),
  add constraint media_uploads_id_ck check (
    case when purpose = 'item_video' then public.is_storage_video_path(public_id) else public.is_cloudinary_id(public_id) end),
  add constraint media_uploads_item_ck check ((purpose in ('item_photo', 'item_video')) = (item_id is not null));

create or replace function public.media_register_upload(p_business uuid, p_item uuid, p_purpose text, p_public_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_purpose not in ('item_photo', 'item_video', 'logo', 'cover') then raise exception 'invalid_purpose'; end if;
  if p_purpose = 'item_video' then
    if p_item is null or not exists (select 1 from public.items i where i.id = p_item and i.business_id = p_business) then raise exception 'item_not_found'; end if;
    if not public.is_storage_video_path(p_public_id) or p_public_id not like p_business::text || '/' || p_item::text || '/%' then raise exception 'path_not_owned' using errcode = '42501'; end if;
  else
    if not public.is_cloudinary_id(p_public_id) or p_public_id not like p_business::text || '/%' then raise exception 'path_not_owned' using errcode = '42501'; end if;
    if p_purpose = 'item_photo' then
      if p_item is null or not exists (select 1 from public.items i where i.id = p_item and i.business_id = p_business) then raise exception 'item_not_found'; end if;
    elsif p_item is not null then
      raise exception 'invalid_purpose';
    end if;
  end if;
  insert into public.media_uploads (public_id, business_id, item_id, purpose) values (p_public_id, p_business, p_item, p_purpose);
end $$;

-- A removed photo (Cloudinary id) or removed video (bucket file) is queued in the same transaction as the delete.
create or replace function public.media_gc_from_item_media() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.kind = 'image' and public.is_cloudinary_id(old.path) then
    insert into public.media_gc (public_id, reason) values (old.path, 'photo_removed') on conflict (public_id) do nothing;
  elsif old.kind = 'video' and public.is_storage_video_path(old.path) then
    insert into public.media_gc (public_id, reason) values (old.path, 'video_removed') on conflict (public_id) do nothing;
  end if;
  return null;
end $$;

create or replace function public.media_gc_enqueue(p_ids text[], p_reason text) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.media_gc (public_id, reason)
  select x, left(coalesce(p_reason, 'manual'), 60) from unnest(p_ids) as x where public.is_cloudinary_id(x) or public.is_storage_video_path(x)
  on conflict (public_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- A signed video ticket lasts two hours, so a video upload gets three hours before the sweep calls it abandoned.
create or replace function public.media_sweep_orphans(p_grace interval default interval '1 hour') returns integer
language plpgsql security definer set search_path = public as $$
declare queued integer;
begin
  with put as (
    insert into public.media_gc (public_id, reason)
    select u.public_id, 'unattached_upload' from public.media_uploads u
    where u.created_at < now() - (case when u.purpose = 'item_video' then greatest(p_grace, interval '3 hours') else p_grace end)
      and not exists (select 1 from public.item_media m where m.path = u.public_id)
      and not exists (select 1 from public.businesses b where b.logo_path = u.public_id or b.cover_path = u.public_id)
    on conflict (public_id) do nothing
    returning 1
  )
  select count(*) into queued from put;
  delete from public.media_uploads u
  where u.created_at < now() - (case when u.purpose = 'item_video' then greatest(p_grace, interval '3 hours') else p_grace end);
  return queued;
end $$;

revoke all on function public.is_storage_video_path(text) from public, anon, authenticated;
grant execute on function public.is_storage_video_path(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. One sequence
-- ---------------------------------------------------------------------------------------------------------------------

-- Dense, per-item sequence from whatever order the rows already have. Same order the views already showed, id breaks exact ties.
update public.item_media m set sort = r.pos
from (select id, (row_number() over (partition by item_id order by sort, created_at, id) - 1)::integer as pos from public.item_media) r
where m.id = r.id and m.sort is distinct from r.pos;

create or replace function public.attach_item_media(
  p_item uuid, p_kind text, p_path text, p_mime text, p_width integer, p_height integer, p_duration numeric, p_size bigint
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_bid uuid;
  v_id uuid;
  v_sort integer;
begin
  select i.business_id into v_bid from public.items i where i.id = p_item;
  if v_bid is null then raise exception 'item_not_found'; end if;
  if p_path not like v_bid::text || '/%' then raise exception 'path_not_owned' using errcode = '42501'; end if;
  -- media_limit_ok takes the per-business advisory lock, so the max() below cannot race another attach.
  if not public.media_limit_ok(p_item, p_kind) then raise exception 'limit_reached:item_media'; end if;
  select coalesce(max(m.sort) + 1, 0) into v_sort from public.item_media m where m.item_id = p_item;
  insert into public.item_media (item_id, business_id, kind, path, mime, sort, width, height, duration_sec, size_bytes)
  values (p_item, v_bid, p_kind, p_path, p_mime, v_sort, p_width, p_height, p_duration, p_size)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.attach_item_media(uuid, text, text, text, integer, integer, numeric, bigint) from public, anon, authenticated;
grant execute on function public.attach_item_media(uuid, text, text, text, integer, integer, numeric, bigint) to service_role;

-- Writes sort = position for a COMPLETE ordered list of one item's paths. Internal: callers have already checked ownership.
create or replace function public.media_apply_order(p_item uuid, p_ordered text[]) returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  update public.item_media m set sort = o.pos
  from (select u.path, (u.ord - 1)::integer as pos from unnest(p_ordered) with ordinality as u(path, ord)) o
  where m.item_id = p_item and m.path = o.path and m.sort is distinct from o.pos;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.media_apply_order(uuid, text[]) from public, anon, authenticated;

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
  from public.item_media m where m.item_id = p_item and m.business_id = v_id;
  if cardinality(p_paths) <> (select count(distinct p) from unnest(p_paths) as p) then raise exception 'duplicate_path' using errcode = 'P0001'; end if;
  if exists (select 1 from unnest(p_paths) as p where p is null or p <> all (v_have)) then raise exception 'path_not_found' using errcode = 'P0001'; end if;
  if cardinality(p_paths) <> cardinality(v_have) then raise exception 'order_incomplete' using errcode = 'P0001'; end if;
  v_n := public.media_apply_order(p_item, p_paths);
  return jsonb_build_object('updated', v_n,
    'cover', (select m.path from public.item_media m where m.item_id = p_item and m.kind = 'image' order by m.sort, m.created_at, m.id limit 1));
end $$;
revoke all on function public.seller_reorder_item_media(uuid, text[]) from public, anon;
grant execute on function public.seller_reorder_item_media(uuid, text[]) to authenticated, service_role;

-- DEPRECATED: use seller_reorder_item_media. Photos are reordered inside the slots photos already occupy; videos keep their place.
-- Paths that are not this item's photos are ignored and photos left out of the list keep their relative order after the listed ones.
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
    from public.item_media m where m.item_id = p_item and m.business_id = v_id
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
revoke all on function public.seller_reorder_item_photos(uuid, text[]) from public, anon;
grant execute on function public.seller_reorder_item_photos(uuid, text[]) to authenticated, service_role;

-- The sequence and the plan limits, for the seller's own item. max is null when the plan has no limit.
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
    'media', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'path', m.path, 'kind', m.kind, 'sort', m.sort, 'duration', m.duration_sec) order by m.sort, m.created_at, m.id)
                       from public.item_media m where m.item_id = p_item), '[]'::jsonb),
    'cover', (select m.path from public.item_media m where m.item_id = p_item and m.kind = 'image' order by m.sort, m.created_at, m.id limit 1),
    'limits', jsonb_build_object(
      'photos', jsonb_build_object('used', (select count(*) from public.item_media m where m.item_id = p_item and m.kind = 'image')::integer, 'max', (v_lim ->> 'photosPerItem')::integer),
      'videos', jsonb_build_object('used', (select count(*) from public.item_media m where m.item_id = p_item and m.kind = 'video')::integer, 'max', (v_lim ->> 'videosPerItem')::integer)));
end $$;
revoke all on function public.seller_item_media(uuid) from public, anon;
grant execute on function public.seller_item_media(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Public read: image_paths, video_paths and the merged media, all in the one sequence
-- ---------------------------------------------------------------------------------------------------------------------

-- New column goes last so the existing definition stays valid.
create or replace view public.public_items with (security_barrier = true) as
select
  i.id, i.business_id, i.name, i.description, i.section, i.price, i.price_max, i.price_type, i.unit,
  i.availability, i.sort, i.created_at,
  coalesce((select jsonb_agg(m.path order by m.sort, m.created_at, m.id) from public.item_media m where m.item_id = i.id and m.kind = 'image'), '[]'::jsonb) as image_paths,
  coalesce((select jsonb_agg(m.path order by m.sort, m.created_at, m.id) from public.item_media m where m.item_id = i.id and m.kind = 'video'), '[]'::jsonb) as video_paths,
  case when i.track_stock and i.show_stock_count and i.availability = 'limited_stock' and i.stock_count > 0 then i.stock_count end as stock_left,
  i.brand, i.short_description, i.highlights, i.specs, i.includes, i.terms, i.pack_size,
  coalesce((select jsonb_agg(jsonb_build_object('path', m.path, 'kind', m.kind, 'duration', m.duration_sec) order by m.sort, m.created_at, m.id) from public.item_media m where m.item_id = i.id), '[]'::jsonb) as media
from public.items i
join public.businesses b on b.id = i.business_id
where public.business_is_visible(b) and i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin
  and public.item_is_listed(i.availability);
revoke all on public.public_items from public;
grant select on public.public_items to anon, authenticated, service_role;

-- The home grid snapshot carries video_paths (null when there are none) so a card keeps the item's videos.
do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'products_snapshot';
  if position('video_paths' in v_def) = 0 then
    v_new := replace(v_def, 'i.image_paths ->> 0 as image_path', 'i.image_paths ->> 0 as image_path, nullif(i.video_paths, ''[]''::jsonb) as video_paths');
    if v_new = v_def then raise exception 'products_snapshot: capped column list not found'; end if;
    v_def := v_new;
    v_new := replace(v_def, 'k.created_at, k.image_path,', 'k.created_at, k.image_path, k.video_paths,');
    if v_new = v_def then raise exception 'products_snapshot: item column list not found'; end if;
    execute v_new;
  end if;
end $$;
