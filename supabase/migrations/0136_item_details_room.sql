-- 0136_item_details_room.sql
-- Room for sellers to write everything a buyer needs, a photo for each "What's included" line, and photo-spin frames that can be
-- reordered after upload.
--
--   1. Limits (the JS mirror is shared/src/seller/itemForm.js: ITEM_DETAIL_LIMITS, SPEC_LIMITS)
--        highlights        12 rows (was 8), lead 60 characters (was 40), text 250 (was 200)
--        specs             200 rows (was 80); a plain row's label 100 (was 40) and value 2000 (was 120). FAQ and Brand rows keep theirs.
--        includes          50 lines (was 10) of 300 characters (was 80)
--        pack_size         120 characters (was 40)
--        terms             5000 characters (was 500)
--      The check functions are replaced, the two column constraints are swapped, and the hard-coded numbers in seller_save_item_base
--      and seller_import_items are patched in place (the same way 0123 patched the import), so none of their lines is copied.
--   2. items.include_media   one photo per "What's included" line: a jsonb array of item_media ids (or null), in the order of
--      `includes`. Written by seller_set_item_include_media after the item is saved; an id that is not one of the item's own photos
--      is refused. public_items gains the column (appended, so the view can be replaced in place).
--   3. seller_reorder_spin   puts the uploaded frames of one photo spin (whole item, or one option value) in a new order.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Limits
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.item_highlights_valid(p jsonb) returns boolean
language plpgsql immutable parallel safe as $$
declare
  e jsonb;
  k text;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 12 then return false; end if;
  for e in select jsonb_array_elements(p) loop
    if jsonb_typeof(e) <> 'object' then return false; end if;
    for k in select jsonb_object_keys(e) loop
      if k not in ('title', 'text') then return false; end if;
    end loop;
    if not public.item_detail_text_ok(e -> 'text', 250) then return false; end if;
    if e ? 'title' and not public.item_detail_text_ok(e -> 'title', 60) then return false; end if;
  end loop;
  return true;
end $$;

create or replace function public.item_specs_valid(p jsonb) returns boolean
language plpgsql immutable parallel safe as $$
declare
  e jsonb;
  k text;
  g text;
  c_groups constant text[] := array['Features & Specs', 'Measurements', 'Additional details', 'User guide', 'Item details'];
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 200 then return false; end if;
  for e in select jsonb_array_elements(p) loop
    if jsonb_typeof(e) <> 'object' then return false; end if;
    for k in select jsonb_object_keys(e) loop
      if k not in ('group', 'label', 'value') then return false; end if;
    end loop;
    if jsonb_typeof(e -> 'group') is distinct from 'string' then return false; end if;
    g := e ->> 'group';
    if g <> all (c_groups) and not (g like 'Info: %' and char_length(g) <= 40) then return false; end if;
    if g = 'Info: FAQ' then
      if not public.item_detail_text_ok(e -> 'label', 160) or not public.item_detail_text_ok(e -> 'value', 600) then return false; end if;
    elsif g = 'Info: Brand' then
      if not public.item_detail_text_ok(e -> 'label', 80) or not public.item_detail_text_ok(e -> 'value', 600) then return false; end if;
    elsif not public.item_detail_text_ok(e -> 'label', 100) or not public.item_detail_text_ok(e -> 'value', 2000) then return false; end if;
  end loop;
  return true;
end $$;

create or replace function public.item_includes_valid(p text[]) returns boolean
language plpgsql immutable parallel safe as $$
declare
  t text;
begin
  if p is null or cardinality(p) > 50 or coalesce(array_ndims(p), 1) <> 1 then return false; end if;
  foreach t in array p loop
    if t is null or btrim(t) = '' or char_length(t) > 300 then return false; end if;
  end loop;
  return true;
end $$;

alter table public.items drop constraint if exists items_pack_size_len, drop constraint if exists items_terms_len;
alter table public.items
  add constraint items_pack_size_len check (char_length(pack_size) <= 120),
  add constraint items_terms_len check (char_length(terms) <= 5000);

-- The save and the import repeat the two text limits as numbers. Patch exactly those numbers; fail loudly if the text moved.
do $$
declare
  v_fn text;
  v_def text;
  v_new text;
begin
  foreach v_fn in array array['seller_save_item_base', 'seller_import_items'] loop
    select pg_get_functiondef(p.oid) into v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn limit 1;
    if v_def is null then raise notice '0136: % not found, skipped', v_fn; continue; end if;
    v_def := replace(v_def, E'\r', '');
    v_new := v_def;
    v_new := replace(v_new, 'char_length(coalesce(v_terms, '''')) > 500', 'char_length(coalesce(v_terms, '''')) > 5000');
    v_new := replace(v_new, 'char_length(coalesce(v_pack, '''')) > 40', 'char_length(coalesce(v_pack, '''')) > 120');
    if v_new = v_def then
      if position('> 5000' in v_def) > 0 then continue; end if;   -- already patched (a re-run)
      raise exception '0136: the text limits of % were not found', v_fn;
    end if;
    execute v_new;
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. A photo for each "What's included" line
-- ---------------------------------------------------------------------------------------------------------------------
alter table public.items add column if not exists include_media jsonb not null default '[]'::jsonb;
alter table public.items drop constraint if exists items_include_media_shape;
alter table public.items add constraint items_include_media_shape check (
  jsonb_typeof(include_media) = 'array' and jsonb_array_length(include_media) <= 50);

-- p_media: [media id | null, ...] in the order of the item's `includes`. null clears every photo. Ids must be this item's own photos.
create or replace function public.seller_set_item_include_media(p_id uuid, p_media jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_biz uuid := public.my_business_id();
  v_item public.items;
  v_clean jsonb := '[]'::jsonb;
  e jsonb;
begin
  perform public.assert_seller_active();
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select * into v_item from public.items i where i.id = p_id and i.business_id = v_biz and not i.removed_by_admin;
  if not found then raise exception 'item_not_found' using errcode = 'P0001'; end if;
  if p_media is not null and jsonb_typeof(p_media) <> 'null' then
    if jsonb_typeof(p_media) <> 'array' or jsonb_array_length(p_media) > 50 then raise exception 'invalid_details' using errcode = 'P0001'; end if;
    for e in select x from jsonb_array_elements(p_media) as x loop
      if jsonb_typeof(e) = 'null' or (jsonb_typeof(e) = 'string' and btrim(e #>> '{}') = '') then
        v_clean := v_clean || 'null'::jsonb;
      elsif jsonb_typeof(e) = 'string'
        and (e #>> '{}') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and exists (select 1 from public.item_media m where m.id = (e #>> '{}')::uuid and m.item_id = p_id and m.kind = 'image') then
        v_clean := v_clean || jsonb_build_array(e #>> '{}');
      else
        raise exception 'invalid_details' using errcode = 'P0001';
      end if;
    end loop;
  end if;
  -- Nothing to keep when every line has no photo.
  if not exists (select 1 from jsonb_array_elements(v_clean) x where jsonb_typeof(x) = 'string') then v_clean := '[]'::jsonb; end if;
  update public.items set include_media = v_clean, updated_at = now() where id = p_id;
  return v_clean;
end $$;
revoke all on function public.seller_set_item_include_media(uuid, jsonb) from public, anon;
grant execute on function public.seller_set_item_include_media(uuid, jsonb) to authenticated, service_role;

-- A deleted photo leaves its line without a picture (the line itself stays).
create or replace function public.item_include_media_forget() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.kind = 'image' then
    update public.items i
       set include_media = (select coalesce(jsonb_agg(case when x.e #>> '{}' = old.id::text then 'null'::jsonb else x.e end order by x.n), '[]'::jsonb)
                              from jsonb_array_elements(i.include_media) with ordinality as x(e, n))
     where i.id = old.item_id and i.include_media @> jsonb_build_array(old.id::text);
  end if;
  return old;
end $$;
drop trigger if exists item_media_include_forget on public.item_media;
create trigger item_media_include_forget after delete on public.item_media for each row execute function public.item_include_media_forget();

-- public_items: the 0121 definition with include_media appended at the end.
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
    from jsonb_array_elements(i.include_media) with ordinality as x(e, n)), '[]'::jsonb) as include_media
from public.items i
join public.businesses b on b.id = i.business_id
where public.business_is_visible(b) and i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin
  and public.item_is_listed(i.availability);

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Reorder the frames of one photo spin
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.seller_reorder_spin(p_item uuid, p_option text, p_paths text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_scope text := coalesce(nullif(btrim(coalesce(p_option, '')), ''), '');
  v_have text[];
  v_n integer := 0;
  v_path text;
begin
  perform public.assert_seller_active();
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if not exists (select 1 from public.items i where i.id = p_item and i.business_id = v_id and not i.removed_by_admin) then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;
  if p_paths is null then raise exception 'invalid_order' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext(v_id::text || 'item_media'));
  select coalesce(array_agg(m.path order by m.sort, m.created_at, m.id), '{}') into v_have
    from public.item_media m
   where m.item_id = p_item and m.business_id = v_id and m.kind = 'spin' and coalesce(m.option_ids[1], '') = v_scope;
  if cardinality(p_paths) <> (select count(distinct p) from unnest(p_paths) as p)
     or exists (select 1 from unnest(p_paths) as p where p is null or p <> all (v_have))
     or cardinality(p_paths) <> cardinality(v_have) then
    raise exception 'invalid_order' using errcode = 'P0001';
  end if;
  foreach v_path in array p_paths loop
    update public.item_media set sort = v_n where item_id = p_item and path = v_path and kind = 'spin';
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('updated', v_n);
end $$;
revoke all on function public.seller_reorder_spin(uuid, text, text[]) from public, anon;
grant execute on function public.seller_reorder_spin(uuid, text, text[]) to authenticated, service_role;
