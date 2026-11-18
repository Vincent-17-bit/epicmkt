-- 0138_item_page_sections.sql
-- Item page sections the seller sets beside the basics (shared/src/item/page.js holds the same rules for the apps):
--   1. "extra" pictures   a picture for a page section (What's included, the gallery, From the brand). item_media kind 'extra',
--                         role 'extra-image', upload purpose 'item_extra' (seller-media-ticket / seller-media3d-finalize, like posters).
--                         Its own kind, so every query that filters kind = 'image' (the photo gallery, the plan's photo limit, the cover,
--                         reorder, copy) leaves it out. At most 80 per item. The delete trigger queues the file for deletion, as for photos.
--   2. items.delivery     null = same as the shop. { mode: 'custom', fee, area, time, notes, pickup } or { mode: 'none', notes, pickup }.
--                         'custom' needs the plan's delivery feature (0124), when saved and when shown.
--   3. items.notices      up to 3 notes buyers must see under "About this item": [{ tone: info|caution|warning, title, text }].
--   4. items.gallery      up to 5 pictures shown above the videos: [{ id: extra media id, label, caption }].
--   5. items.brand_page   "From the brand": { banner: extra media id | null, cards: [{ id, caption }] } (at most 8 cards).
--   6. seller_set_item_page(p_id, p_page)   sets any of delivery, notices, gallery, brand and includeMedia in one call, then deletes the
--                         item's extra pictures nothing points at any more. "What's included" photos may now be extra pictures too.
--   7. seller_item_extras(p_item)            the item's extra pictures, for the editor.
--   8. public_items       the 0137 definition with delivery, notices, gallery and brand_page appended (pictures as paths with sizes).
-- Re-runnable: every statement can be run twice.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. The "extra" picture kind
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.media_option_ids_ok(p_ids text[], p_role text) returns boolean
language sql immutable parallel safe as $$
  select p_ids is not null
    and cardinality(p_ids) <= (case when p_role = 'extra-image' then 0 when p_role in ('spin-frame', 'model-glb', 'poster') then 1 else 40 end)
    and (select count(distinct x) = cardinality(p_ids) and coalesce(bool_and(x ~ '^[a-z0-9][a-z0-9_-]{0,39}$'), true) from unnest(p_ids) as x)
$$;

create or replace function public.item_media_role_default() returns trigger
language plpgsql as $$
begin
  new.role := coalesce(new.role, case new.kind when 'model' then 'model-glb' when 'spin' then 'spin-frame' when 'extra' then 'extra-image' else new.kind end);
  return new;
end $$;

alter table public.item_media drop constraint if exists item_media_kind_check;
alter table public.item_media add constraint item_media_kind_check check (kind in ('image', 'video', 'model', 'spin', 'poster', 'extra'));
alter table public.item_media drop constraint if exists item_media_role_ck;
alter table public.item_media add constraint item_media_role_ck check (
  (kind, role) in (('image', 'image'), ('video', 'video'), ('model', 'model-glb'), ('spin', 'spin-frame'), ('poster', 'poster'), ('extra', 'extra-image')));

alter table public.media_uploads drop constraint if exists media_uploads_purpose_ck;
alter table public.media_uploads drop constraint if exists media_uploads_id_ck;
alter table public.media_uploads drop constraint if exists media_uploads_item_ck;
alter table public.media_uploads
  add constraint media_uploads_purpose_ck check (purpose in ('item_photo', 'item_video', 'item_model', 'item_poster', 'item_spin', 'item_extra', 'logo', 'cover', 'gallery', 'staff')),
  add constraint media_uploads_id_ck check (
    case purpose when 'item_video' then public.is_storage_video_path(public_id) when 'item_model' then public.is_storage_model_path(public_id)
    else public.is_cloudinary_id(public_id) end),
  add constraint media_uploads_item_ck check ((purpose in ('item_photo', 'item_video', 'item_model', 'item_poster', 'item_spin', 'item_extra')) = (item_id is not null));

create or replace function public.media_register_upload(p_business uuid, p_item uuid, p_purpose text, p_public_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_purpose not in ('item_photo', 'item_video', 'item_model', 'item_poster', 'item_spin', 'item_extra', 'logo', 'cover', 'gallery', 'staff') then raise exception 'invalid_purpose'; end if;
  if p_purpose in ('item_video', 'item_model') then
    if p_item is null or not exists (select 1 from public.items i where i.id = p_item and i.business_id = p_business) then raise exception 'item_not_found'; end if;
    if not (case p_purpose when 'item_video' then public.is_storage_video_path(p_public_id) else public.is_storage_model_path(p_public_id) end)
       or p_public_id not like p_business::text || '/' || p_item::text || '/%' then raise exception 'path_not_owned' using errcode = '42501'; end if;
  else
    if not public.is_cloudinary_id(p_public_id) or p_public_id not like p_business::text || '/%' then raise exception 'path_not_owned' using errcode = '42501'; end if;
    if p_purpose in ('item_photo', 'item_poster', 'item_spin', 'item_extra') then
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
revoke all on function public.media_register_upload(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.media_register_upload(uuid, uuid, text, text) to service_role;

create or replace function public.media_gc_from_item_media() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.kind in ('image', 'spin', 'poster', 'extra') and public.is_cloudinary_id(old.path) then
    insert into public.media_gc (public_id, reason)
    values (old.path, case old.kind when 'image' then 'photo_removed' when 'extra' then 'extra_removed' else 'media3d_removed' end)
    on conflict (public_id) do nothing;
  elsif old.kind = 'video' and public.is_storage_video_path(old.path) then
    insert into public.media_gc (public_id, reason) values (old.path, 'video_removed') on conflict (public_id) do nothing;
  elsif old.kind = 'model' and public.is_storage_model_path(old.path) then
    insert into public.media_gc (public_id, reason) values (old.path, 'media3d_removed') on conflict (public_id) do nothing;
  end if;
  return null;
end $$;

-- Service only (seller-media3d-finalize). A model or poster replaces the one in its scope; spin frames and extra pictures add up.
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
  v_kind := case p_role when 'spin-frame' then 'spin' when 'model-glb' then 'model' when 'poster' then 'poster' when 'extra-image' then 'extra' end;
  if v_kind is null then raise exception 'invalid_role'; end if;
  if p_path is null or p_path not like v_bid::text || '/' || p_item::text || '/%' then raise exception 'path_not_owned' using errcode = '42501'; end if;
  p_option_ids := coalesce(p_option_ids, '{}');
  if not public.media_option_ids_ok(p_option_ids, p_role) then raise exception 'bad_option_ids'; end if;
  if cardinality(p_option_ids) > 0 and not public.item_has_option_value(p_item, p_option_ids[1]) then raise exception 'unknown_option_value'; end if;
  if p_position is not null and p_position not between 0 and 71 then raise exception 'bad_position'; end if;
  v_scope := coalesce(p_option_ids[1], '');

  -- Same lock as media_limit_ok, so two uploads of one item cannot both pass a limit.
  perform pg_advisory_xact_lock(hashtext(v_bid::text || 'item_media'));

  if p_role = 'extra-image' then
    if (select count(*) from public.item_media m where m.item_id = p_item and m.kind = 'extra') >= 80 then raise exception 'limit_reached:extras'; end if;
    v_sort := (select coalesce(max(m.sort) + 1, 0) from public.item_media m where m.item_id = p_item and m.kind = 'extra');
  else
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
  end if;

  insert into public.item_media (item_id, business_id, kind, role, path, mime, sort, width, height, size_bytes, option_ids)
  values (p_item, v_bid, v_kind, p_role, p_path, p_mime, v_sort, p_width, p_height, p_size, p_option_ids)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.attach_item_media3d(uuid, text, text, text, integer, integer, bigint, text[], integer) from public, anon, authenticated;
grant execute on function public.attach_item_media3d(uuid, text, text, text, integer, integer, bigint, text[], integer) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2-5. The new item columns and their checks
-- ---------------------------------------------------------------------------------------------------------------------
alter table public.items add column if not exists delivery jsonb;
alter table public.items add column if not exists notices jsonb not null default '[]'::jsonb;
alter table public.items add column if not exists gallery jsonb not null default '[]'::jsonb;
alter table public.items add column if not exists brand_page jsonb;

-- A short text: null, or a string of at most p_max characters (and, when p_need, at least one that is not a space).
create or replace function public.page_text_ok(p jsonb, p_max integer, p_need boolean default false) returns boolean
language sql immutable parallel safe as $$
  select case
    when p is null or jsonb_typeof(p) = 'null' then not p_need
    when jsonb_typeof(p) <> 'string' then false
    else char_length(p #>> '{}') <= p_max and (not p_need or btrim(p #>> '{}') <> '')
  end
$$;

create or replace function public.page_media_id_ok(p jsonb) returns boolean
language sql immutable parallel safe as $$
  select jsonb_typeof(p) = 'string' and (p #>> '{}') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;

create or replace function public.item_delivery_valid(d jsonb) returns boolean
language sql immutable parallel safe as $$
  select d is null or jsonb_typeof(d) = 'null' or (
    jsonb_typeof(d) = 'object'
    and d ->> 'mode' in ('custom', 'none')
    and not exists (select 1 from jsonb_object_keys(d) k where k not in ('mode', 'fee', 'area', 'time', 'notes', 'pickup'))
    -- CASE, not AND: the cast must only run on a number (AND does not promise an order).
    and (case when d -> 'fee' is null or jsonb_typeof(d -> 'fee') = 'null' then true
              when jsonb_typeof(d -> 'fee') = 'number' then (d ->> 'fee')::numeric between 0 and 100000
              else false end)
    and public.page_text_ok(d -> 'area', 120) and public.page_text_ok(d -> 'time', 60) and public.page_text_ok(d -> 'notes', 300)
    and (d -> 'pickup' is null or jsonb_typeof(d -> 'pickup') in ('boolean', 'null')))
$$;

create or replace function public.item_notices_valid(n jsonb) returns boolean
language sql immutable parallel safe as $$
  select jsonb_typeof(n) = 'array' and jsonb_array_length(n) <= 3
    and not exists (
      select 1 from jsonb_array_elements(n) e
      where jsonb_typeof(e) <> 'object'
         or coalesce(e ->> 'tone', '') not in ('info', 'caution', 'warning')
         or not public.page_text_ok(e -> 'title', 60, true)
         or not public.page_text_ok(e -> 'text', 300, true)
         or exists (select 1 from jsonb_object_keys(e) k where k not in ('tone', 'title', 'text')))
$$;

create or replace function public.item_gallery_valid(g jsonb) returns boolean
language sql immutable parallel safe as $$
  select jsonb_typeof(g) = 'array' and jsonb_array_length(g) <= 5
    and not exists (
      select 1 from jsonb_array_elements(g) e
      where jsonb_typeof(e) <> 'object' or not public.page_media_id_ok(e -> 'id')
         or not public.page_text_ok(e -> 'label', 30) or not public.page_text_ok(e -> 'caption', 140)
         or exists (select 1 from jsonb_object_keys(e) k where k not in ('id', 'label', 'caption')))
    and (select count(distinct e ->> 'id') = count(*) from jsonb_array_elements(g) e)
$$;

create or replace function public.item_brand_page_valid(b jsonb) returns boolean
language sql immutable parallel safe as $$
  select b is null or jsonb_typeof(b) = 'null' or (
    jsonb_typeof(b) = 'object'
    and not exists (select 1 from jsonb_object_keys(b) k where k not in ('banner', 'cards'))
    and (b -> 'banner' is null or jsonb_typeof(b -> 'banner') = 'null' or public.page_media_id_ok(b -> 'banner'))
    and jsonb_typeof(coalesce(b -> 'cards', '[]'::jsonb)) = 'array'
    and jsonb_array_length(coalesce(b -> 'cards', '[]'::jsonb)) <= 8
    and not exists (
      select 1 from jsonb_array_elements(coalesce(b -> 'cards', '[]'::jsonb)) e
      where jsonb_typeof(e) <> 'object' or not public.page_media_id_ok(e -> 'id') or not public.page_text_ok(e -> 'caption', 80)
         or exists (select 1 from jsonb_object_keys(e) k where k not in ('id', 'caption'))))
$$;

alter table public.items drop constraint if exists items_delivery_valid;
alter table public.items add constraint items_delivery_valid check (public.item_delivery_valid(delivery));
alter table public.items drop constraint if exists items_notices_valid;
alter table public.items add constraint items_notices_valid check (public.item_notices_valid(notices));
alter table public.items drop constraint if exists items_gallery_valid;
alter table public.items add constraint items_gallery_valid check (public.item_gallery_valid(gallery));
alter table public.items drop constraint if exists items_brand_page_valid;
alter table public.items add constraint items_brand_page_valid check (public.item_brand_page_valid(brand_page));

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. Set the sections in one call
-- ---------------------------------------------------------------------------------------------------------------------
-- Is this id one of the item's extra pictures (or, when p_photo, also one of its photos)?
create or replace function public.item_page_media_ok(p_item uuid, p jsonb, p_photo boolean default false) returns boolean
language sql stable security definer set search_path = public as $$
  select case when public.page_media_id_ok(p) then exists (
    select 1 from public.item_media m where m.id::text = (p #>> '{}') and m.item_id = p_item
      and (m.kind = 'extra' or (p_photo and m.kind = 'image'))) else false end
$$;
revoke all on function public.item_page_media_ok(uuid, jsonb, boolean) from public, anon, authenticated;

-- p_page: any of { delivery, notices, gallery, brand, includeMedia }. A key that is missing keeps what is stored.
--   delivery      null (same as the shop) or the object above.         notices   [] clears them.
--   gallery       [{ id, label, caption }], ids of this item's extra pictures.
--   brand         null or { banner, cards: [{ id, caption }] }, ids of this item's extra pictures.
--   includeMedia  [id | null, ...] in the order of `includes`: this item's extra pictures or photos. null or [] clears them.
-- Afterwards the item's extra pictures that nothing points at are deleted (the delete trigger queues their files).
create or replace function public.seller_set_item_page(p_id uuid, p_page jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_biz uuid := public.my_business_id();
  v_item public.items;
  v_val jsonb;
  v_clean jsonb;
  e jsonb;
  v_removed integer := 0;
begin
  perform public.assert_seller_active();
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select * into v_item from public.items i where i.id = p_id and i.business_id = v_biz and not i.removed_by_admin for update;
  if not found then raise exception 'item_not_found' using errcode = 'P0001'; end if;
  if p_page is null or jsonb_typeof(p_page) <> 'object' then raise exception 'invalid_page' using errcode = 'P0001'; end if;

  if p_page ? 'delivery' then
    v_val := case when jsonb_typeof(p_page -> 'delivery') = 'null' then null else p_page -> 'delivery' end;
    if not public.item_delivery_valid(v_val) then raise exception 'invalid_delivery' using errcode = 'P0001'; end if;
    -- Delivering is a plan feature for the shop (0124); an item cannot switch it on by itself. Pickup only is always allowed.
    if v_val ->> 'mode' = 'custom' and not public.plan_feature_on(v_biz, 'delivery') then
      raise exception 'feature_off' using errcode = 'P0001', detail = 'delivery';
    end if;
    update public.items set delivery = v_val where id = p_id;
  end if;

  if p_page ? 'notices' then
    v_val := case when jsonb_typeof(p_page -> 'notices') = 'null' then '[]'::jsonb else p_page -> 'notices' end;
    if not public.item_notices_valid(v_val) then raise exception 'invalid_notices' using errcode = 'P0001'; end if;
    update public.items set notices = v_val where id = p_id;
  end if;

  if p_page ? 'gallery' then
    v_val := case when jsonb_typeof(p_page -> 'gallery') = 'null' then '[]'::jsonb else p_page -> 'gallery' end;
    if not public.item_gallery_valid(v_val) then raise exception 'invalid_gallery' using errcode = 'P0001'; end if;
    if exists (select 1 from jsonb_array_elements(v_val) x where not public.item_page_media_ok(p_id, x -> 'id')) then
      raise exception 'invalid_gallery' using errcode = 'P0001';
    end if;
    update public.items set gallery = v_val where id = p_id;
  end if;

  if p_page ? 'brand' then
    v_val := case when jsonb_typeof(p_page -> 'brand') = 'null' then null else p_page -> 'brand' end;
    if v_val is not null and coalesce(jsonb_typeof(v_val -> 'banner'), 'null') = 'null' and jsonb_array_length(coalesce(v_val -> 'cards', '[]'::jsonb)) = 0 then
      v_val := null;
    end if;
    if not public.item_brand_page_valid(v_val) then raise exception 'invalid_brand' using errcode = 'P0001'; end if;
    if v_val is not null and (
         (coalesce(jsonb_typeof(v_val -> 'banner'), 'null') <> 'null' and not public.item_page_media_ok(p_id, v_val -> 'banner'))
         or exists (select 1 from jsonb_array_elements(coalesce(v_val -> 'cards', '[]'::jsonb)) x where not public.item_page_media_ok(p_id, x -> 'id'))) then
      raise exception 'invalid_brand' using errcode = 'P0001';
    end if;
    update public.items set brand_page = v_val where id = p_id;
  end if;

  if p_page ? 'includeMedia' then
    v_val := p_page -> 'includeMedia';
    v_clean := '[]'::jsonb;
    if jsonb_typeof(v_val) <> 'null' then
      if jsonb_typeof(v_val) <> 'array' or jsonb_array_length(v_val) > 50 then raise exception 'invalid_details' using errcode = 'P0001'; end if;
      for e in select x from jsonb_array_elements(v_val) as x loop
        if jsonb_typeof(e) = 'null' or (jsonb_typeof(e) = 'string' and btrim(e #>> '{}') = '') then
          v_clean := v_clean || 'null'::jsonb;
        elsif public.item_page_media_ok(p_id, e, true) then
          v_clean := v_clean || jsonb_build_array(e #>> '{}');
        else
          raise exception 'invalid_details' using errcode = 'P0001';
        end if;
      end loop;
    end if;
    if not exists (select 1 from jsonb_array_elements(v_clean) x where jsonb_typeof(x) = 'string') then v_clean := '[]'::jsonb; end if;
    update public.items set include_media = v_clean where id = p_id;
  end if;

  update public.items set updated_at = now() where id = p_id;
  select * into v_item from public.items where id = p_id;

  -- Extra pictures nothing points at any more (replaced, removed in the editor, or an upload whose save failed) are deleted.
  with refs as (
    select x.e #>> '{}' as id from jsonb_array_elements(v_item.include_media) as x(e) where jsonb_typeof(x.e) = 'string'
    union select x.e ->> 'id' from jsonb_array_elements(v_item.gallery) as x(e)
    union select v_item.brand_page ->> 'banner'
    union select x.e ->> 'id' from jsonb_array_elements(coalesce(v_item.brand_page -> 'cards', '[]'::jsonb)) as x(e)
  ), gone as (
    delete from public.item_media m
     where m.item_id = p_id and m.kind = 'extra' and m.id::text not in (select r.id from refs r where r.id is not null)
    returning 1
  )
  select count(*) into v_removed from gone;

  return jsonb_build_object('delivery', v_item.delivery, 'notices', v_item.notices, 'gallery', v_item.gallery, 'brand', v_item.brand_page,
    'includeMedia', v_item.include_media, 'removed', v_removed);
end $$;
revoke all on function public.seller_set_item_page(uuid, jsonb) from public, anon;
grant execute on function public.seller_set_item_page(uuid, jsonb) to authenticated, service_role;

-- "What's included" photos set on their own (0137) may now be extra pictures as well as photos.
create or replace function public.seller_set_item_include_media(p_id uuid, p_media jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_seller_active();
  return (public.seller_set_item_page(p_id, jsonb_build_object('includeMedia', coalesce(p_media, 'null'::jsonb)))) -> 'includeMedia';
end $$;
revoke all on function public.seller_set_item_include_media(uuid, jsonb) from public, anon;
grant execute on function public.seller_set_item_include_media(uuid, jsonb) to authenticated, service_role;

-- A deleted photo or extra picture leaves its "What's included" line without a picture, and leaves the gallery and the brand cards.
create or replace function public.item_include_media_forget() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.kind in ('image', 'extra') then
    update public.items i
       set include_media = (select coalesce(jsonb_agg(case when x.e #>> '{}' = old.id::text then 'null'::jsonb else x.e end order by x.n), '[]'::jsonb)
                              from jsonb_array_elements(i.include_media) with ordinality as x(e, n))
     where i.id = old.item_id and i.include_media @> jsonb_build_array(old.id::text);
  end if;
  if old.kind = 'extra' then
    update public.items i
       set gallery = (select coalesce(jsonb_agg(x.e order by x.n), '[]'::jsonb) from jsonb_array_elements(i.gallery) with ordinality as x(e, n) where x.e ->> 'id' <> old.id::text)
     where i.id = old.item_id and exists (select 1 from jsonb_array_elements(i.gallery) x where x ->> 'id' = old.id::text);
    update public.items i
       set brand_page = case
             when (case when i.brand_page ->> 'banner' = old.id::text then null else i.brand_page ->> 'banner' end) is null
              and not exists (select 1 from jsonb_array_elements(coalesce(i.brand_page -> 'cards', '[]'::jsonb)) x where x ->> 'id' <> old.id::text)
             then null
             else jsonb_build_object(
               'banner', case when i.brand_page ->> 'banner' = old.id::text then null else i.brand_page -> 'banner' end,
               'cards', (select coalesce(jsonb_agg(x.e order by x.n), '[]'::jsonb)
                           from jsonb_array_elements(coalesce(i.brand_page -> 'cards', '[]'::jsonb)) with ordinality as x(e, n) where x.e ->> 'id' <> old.id::text))
           end
     where i.id = old.item_id and i.brand_page is not null
       and (i.brand_page ->> 'banner' = old.id::text
            or exists (select 1 from jsonb_array_elements(coalesce(i.brand_page -> 'cards', '[]'::jsonb)) x where x ->> 'id' = old.id::text));
  end if;
  return old;
end $$;
drop trigger if exists item_media_include_forget on public.item_media;
create trigger item_media_include_forget after delete on public.item_media for each row execute function public.item_include_media_forget();

-- ---------------------------------------------------------------------------------------------------------------------
-- 7. The item's extra pictures, for the editor
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.seller_item_extras(p_item uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_biz uuid := public.my_business_id();
begin
  perform public.assert_seller_active();
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if not exists (select 1 from public.items i where i.id = p_item and i.business_id = v_biz) then raise exception 'item_not_found' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'path', m.path, 'width', m.width, 'height', m.height, 'size', m.size_bytes) order by m.sort, m.created_at, m.id)
                     from public.item_media m where m.item_id = p_item and m.kind = 'extra'), '[]'::jsonb);
end $$;
revoke all on function public.seller_item_extras(uuid) from public, anon;
grant execute on function public.seller_item_extras(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 8. public_items: the 0137 definition with the sections appended at the end
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
  i.price_min, i.price_high, i.has_options, i.department_id, i.product_type_id, i.has_3d,
  case
    when exists (select 1 from public.item_variants v where v.item_id = i.id)
      then (select count(*) from public.item_variants v where v.item_id = i.id and v.status <> 'unavailable')::int
    when jsonb_typeof(i.variants) = 'array' then jsonb_array_length(i.variants)
    else 0
  end as option_count,
  coalesce((select jsonb_agg(case when jsonb_typeof(x.e) = 'string' then (select to_jsonb(m.path) from public.item_media m where m.id::text = x.e #>> '{}' and m.item_id = i.id) else 'null'::jsonb end order by x.n)
    from jsonb_array_elements(i.include_media) with ordinality as x(e, n)), '[]'::jsonb) as include_media,
  -- An item's own delivery shows only while the shop's plan has delivery (like the shop's own, business_delivery in 0124).
  case when i.delivery ->> 'mode' = 'custom' and not public.plan_feature_on(i.business_id, 'delivery') then null else i.delivery end as delivery,
  i.notices,
  coalesce((select jsonb_agg(jsonb_build_object('path', m.path, 'width', m.width, 'height', m.height, 'label', x.e ->> 'label', 'caption', x.e ->> 'caption') order by x.n)
    from jsonb_array_elements(i.gallery) with ordinality as x(e, n)
    join public.item_media m on m.id::text = x.e ->> 'id' and m.item_id = i.id and m.kind = 'extra'), '[]'::jsonb) as gallery,
  case when i.brand_page is null then null else jsonb_build_object(
    'banner', (select jsonb_build_object('path', m.path, 'width', m.width, 'height', m.height) from public.item_media m
                where m.id::text = i.brand_page ->> 'banner' and m.item_id = i.id and m.kind = 'extra'),
    'cards', coalesce((select jsonb_agg(jsonb_build_object('path', m.path, 'width', m.width, 'height', m.height, 'caption', x.e ->> 'caption') order by x.n)
      from jsonb_array_elements(coalesce(i.brand_page -> 'cards', '[]'::jsonb)) with ordinality as x(e, n)
      join public.item_media m on m.id::text = x.e ->> 'id' and m.item_id = i.id and m.kind = 'extra'), '[]'::jsonb)) end as brand_page
from public.items i
join public.businesses b on b.id = i.business_id
where public.business_is_visible(b) and i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin
  and public.item_is_listed(i.availability);

-- ---------------------------------------------------------------------------------------------------------------------
-- 9. A duplicated item keeps its delivery and its notes (the pictures stay with the original)
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.seller_duplicate_item(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_new uuid;
begin
  perform public.assert_seller_active();
  v_new := public.seller_duplicate_item_base(p_id);
  update public.items n set price_tiers = s.price_tiers, price_tier_mode = s.price_tier_mode, delivery = s.delivery, notices = s.notices
    from public.items s where s.id = p_id and n.id = v_new;
  update public.item_variants n set price_tiers = o.price_tiers
    from public.item_variants o where o.item_id = p_id and n.item_id = v_new and n.combo_key = o.combo_key;
  return v_new;
end $$;
revoke all on function public.seller_duplicate_item(uuid) from public, anon;
grant execute on function public.seller_duplicate_item(uuid) to authenticated, service_role;
