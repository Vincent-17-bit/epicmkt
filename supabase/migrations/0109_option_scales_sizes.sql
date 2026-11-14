-- 0109_option_scales_sizes.sql
-- Scale-aware options (the scales framework, the size filters and the buyer labels already read these fields).
--   1. An option axis may name a scale (`scale`: "shoe", "volume", ...) and each value may carry its stored scale value (`stored`:
--      {scale, system?, value, unit?, width?, shape?}). They are validated, cleaned, shown to buyers, copied by Duplicate and kept when a
--      photo is deleted. Before this migration every function that rebuilds an axis dropped them.
--   2. products_snapshot carries `size_values` per item (the product list's `sizeValues`): the stored scale values of its size-like options, which the buyer's
--      size filters read (docs/requests/2026-11-07-sizes-to-client-list-size-values.md).
--      public_item_size_values() returns the same for every live item at once, for the product list's fallback path.
-- Nothing else changes: an axis without `scale` reads and saves exactly as before. Running it twice changes nothing.
-- Also fixes item_option_axes_drop_media (0086), which rebuilt each axis from four keys and so lost `dependsOn` (0088) when a photo was deleted.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. An axis's scale and a value's stored scale value
-- ---------------------------------------------------------------------------------------------------------------------

-- A scale id: lower-case letters, digits and hyphens, starting with a letter ("apparel-alpha", "shoe").
create or replace function public.option_scale_id_ok(p jsonb) returns boolean
language sql immutable parallel safe as
$$ select coalesce(jsonb_typeof(p) = 'string' and (p #>> '{}') ~ '^[a-z][a-z0-9-]{0,29}$', false) $$;

-- One stored scale value. Small on purpose: at most six known keys, short text, and it must belong to the axis's scale.
create or replace function public.option_scale_value_ok(p jsonb, p_scale jsonb) returns boolean
language plpgsql immutable parallel safe as $$
declare
  k text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  for k in select jsonb_object_keys(p) loop
    if k not in ('scale', 'system', 'value', 'unit', 'width', 'shape') then return false; end if;
  end loop;
  if not (p ? 'scale') or not public.option_scale_id_ok(p -> 'scale') or (p -> 'scale') is distinct from p_scale then return false; end if;
  if not (p ? 'value') or jsonb_typeof(p -> 'value') not in ('number', 'string') then return false; end if;
  if jsonb_typeof(p -> 'value') = 'string' and (char_length(p ->> 'value') not between 1 and 60 or (p ->> 'value') ~ '[<>]') then return false; end if;
  if jsonb_typeof(p -> 'value') = 'number' and abs((p ->> 'value')::numeric) > 1000000000 then return false; end if;
  for k in select unnest(array['system', 'unit']) loop
    if p ? k and (jsonb_typeof(p -> k) <> 'string' or (p ->> k) !~ '^[A-Za-z0-9._/-]{1,20}$') then return false; end if;
  end loop;
  if p ? 'width' and (jsonb_typeof(p -> 'width') <> 'string' or (p ->> 'width') <> all (array['narrow', 'regular', 'wide'])) then return false; end if;
  if p ? 'shape' and (jsonb_typeof(p -> 'shape') <> 'string' or (p ->> 'shape') <> all (array['rectangular', 'round'])) then return false; end if;
  return true;
end $$;

-- What an axis / a value adds to the object being rebuilt: nothing when it has no scale.
create or replace function public.item_option_axis_extra(e jsonb) returns jsonb
language sql immutable parallel safe as
$$ select case when e ? 'scale' and jsonb_typeof(e -> 'scale') <> 'null' then jsonb_build_object('scale', e -> 'scale') else '{}'::jsonb end $$;

create or replace function public.item_option_value_extra(e jsonb) returns jsonb
language sql immutable parallel safe as
$$ select case when e ? 'stored' and jsonb_typeof(e -> 'stored') <> 'null' then jsonb_build_object('stored', e -> 'stored') else '{}'::jsonb end $$;

revoke all on function public.option_scale_id_ok(jsonb), public.option_scale_value_ok(jsonb, jsonb), public.item_option_axis_extra(jsonb), public.item_option_value_extra(jsonb) from public, anon, authenticated;
grant execute on function public.option_scale_id_ok(jsonb), public.option_scale_value_ok(jsonb, jsonb), public.item_option_axis_extra(jsonb), public.item_option_value_extra(jsonb) to anon, authenticated, service_role;

create or replace function public.item_option_axes_valid(p jsonb) returns boolean
language plpgsql immutable parallel safe as $$
declare
  a jsonb;
  v jsonb;
  k text;
  v_keys text[] := '{}';
  v_ids text[];
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 3 then return false; end if;
  for a in select jsonb_array_elements(p) loop
    if jsonb_typeof(a) <> 'object' then return false; end if;
    for k in select jsonb_object_keys(a) loop
      if k not in ('key', 'label', 'display', 'values', 'dependsOn', 'scale') then return false; end if;
    end loop;
    if not public.option_slug_ok(a -> 'key', 30) or (a ->> 'key') = any (v_keys) then return false; end if;
    if a ? 'dependsOn' and (not public.option_slug_ok(a -> 'dependsOn', 30) or not ((a ->> 'dependsOn') = any (v_keys))) then return false; end if;
    if a ? 'scale' and not public.option_scale_id_ok(a -> 'scale') then return false; end if;
    v_keys := v_keys || (a ->> 'key');
    if not public.item_detail_text_ok(a -> 'label', 30) then return false; end if;
    if jsonb_typeof(a -> 'display') is distinct from 'string' or (a ->> 'display') <> all (array['swatch', 'image-card', 'button', 'dropdown', 'text-card']) then return false; end if;
    if jsonb_typeof(a -> 'values') is distinct from 'array' or jsonb_array_length(a -> 'values') not between 1 and 40 then return false; end if;
    v_ids := '{}';
    for v in select jsonb_array_elements(a -> 'values') loop
      if jsonb_typeof(v) <> 'object' then return false; end if;
      for k in select jsonb_object_keys(v) loop
        if k not in ('id', 'label', 'color', 'mediaId', 'copyMediaId', 'stored') then return false; end if;
      end loop;
      if not public.option_slug_ok(v -> 'id', 40) or (v ->> 'id') = any (v_ids) then return false; end if;
      v_ids := v_ids || (v ->> 'id');
      if not public.item_detail_text_ok(v -> 'label', 40) then return false; end if;
      if v ? 'color' and (jsonb_typeof(v -> 'color') <> 'string' or (v ->> 'color') !~ '^#[0-9a-fA-F]{6}$') then return false; end if;
      if v ? 'mediaId' and not public.option_uuid_ok(v -> 'mediaId') then return false; end if;
      if v ? 'copyMediaId' and not public.option_uuid_ok(v -> 'copyMediaId') then return false; end if;
      -- a value's `stored` only makes sense on an axis that names the same scale
      if v ? 'stored' and not public.option_scale_value_ok(v -> 'stored', a -> 'scale') then return false; end if;
    end loop;
  end loop;
  return true;
end $$;

-- Rebuilds user-sent axes keeping only known keys. A value's `stored` is rebuilt from its six keys (text trimmed, nulls dropped); anything that
-- is not the expected shape is kept as sent, so item_option_axes_valid refuses it.
create or replace function public.item_option_axes_clean(p jsonb) returns jsonb
language plpgsql immutable parallel safe as $$
declare
  a jsonb;
  v jsonb;
  k text;
  v_axis jsonb;
  v_vals jsonb;
  v_out jsonb := '[]'::jsonb;
  v_one jsonb;
  v_sv jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'array' then return p; end if;
  for a in select jsonb_array_elements(p) loop
    if jsonb_typeof(a) <> 'object' or jsonb_typeof(a -> 'values') is distinct from 'array' then return p; end if;
    v_vals := '[]'::jsonb;
    for v in select jsonb_array_elements(a -> 'values') loop
      if jsonb_typeof(v) <> 'object' then return p; end if;
      v_one := jsonb_build_object('id', v -> 'id', 'label', case when jsonb_typeof(v -> 'label') = 'string' then to_jsonb(btrim(v ->> 'label')) else v -> 'label' end);
      if v ? 'color' and jsonb_typeof(v -> 'color') <> 'null' then v_one := v_one || jsonb_build_object('color', case when jsonb_typeof(v -> 'color') = 'string' then to_jsonb(lower(v ->> 'color')) else v -> 'color' end); end if;
      if v ? 'mediaId' and jsonb_typeof(v -> 'mediaId') <> 'null' then v_one := v_one || jsonb_build_object('mediaId', case when jsonb_typeof(v -> 'mediaId') = 'string' then to_jsonb(lower(v ->> 'mediaId')) else v -> 'mediaId' end); end if;
      if v ? 'stored' and jsonb_typeof(v -> 'stored') <> 'null' then
        if jsonb_typeof(v -> 'stored') = 'object' then
          v_sv := '{}'::jsonb;
          for k in select unnest(array['scale', 'system', 'value', 'unit', 'width', 'shape']) loop
            if (v -> 'stored') ? k and jsonb_typeof(v -> 'stored' -> k) <> 'null' then
              v_sv := v_sv || jsonb_build_object(k, case when jsonb_typeof(v -> 'stored' -> k) = 'string' then to_jsonb(btrim(v -> 'stored' ->> k)) else v -> 'stored' -> k end);
            end if;
          end loop;
          -- keys that are not ours stay, so the validator refuses them instead of silently losing them
          for k in select jsonb_object_keys(v -> 'stored') loop
            if k not in ('scale', 'system', 'value', 'unit', 'width', 'shape') then v_sv := v_sv || jsonb_build_object(k, v -> 'stored' -> k); end if;
          end loop;
          v_one := v_one || jsonb_build_object('stored', v_sv);
        else
          v_one := v_one || jsonb_build_object('stored', v -> 'stored');
        end if;
      end if;
      v_vals := v_vals || jsonb_build_array(v_one);
    end loop;
    v_axis := jsonb_build_object('key', a -> 'key', 'label', case when jsonb_typeof(a -> 'label') = 'string' then to_jsonb(btrim(a ->> 'label')) else a -> 'label' end,
                                 'display', a -> 'display', 'values', v_vals);
    if a ? 'dependsOn' and jsonb_typeof(a -> 'dependsOn') <> 'null' then v_axis := v_axis || jsonb_build_object('dependsOn', a -> 'dependsOn'); end if;
    if a ? 'scale' and jsonb_typeof(a -> 'scale') <> 'null' then
      v_axis := v_axis || jsonb_build_object('scale', case when jsonb_typeof(a -> 'scale') = 'string' then to_jsonb(lower(btrim(a ->> 'scale'))) else a -> 'scale' end);
    end if;
    v_out := v_out || jsonb_build_array(v_axis);
  end loop;
  return v_out;
end $$;

create or replace function public.item_option_axes_public(p jsonb) returns jsonb
language sql immutable parallel safe as $$
  select coalesce(jsonb_agg(
    jsonb_build_object('key', a.e -> 'key', 'label', a.e -> 'label', 'display', a.e -> 'display', 'values', (
      select coalesce(jsonb_agg(
        jsonb_build_object('id', v.e -> 'id', 'label', v.e -> 'label')
          || case when v.e ? 'color' then jsonb_build_object('color', v.e -> 'color') else '{}'::jsonb end
          || case when v.e ? 'mediaId' then jsonb_build_object('mediaId', v.e -> 'mediaId') else '{}'::jsonb end
          || public.item_option_value_extra(v.e)
        order by v.n), '[]'::jsonb)
      from jsonb_array_elements(a.e -> 'values') with ordinality as v(e, n))) || case when a.e ? 'dependsOn' then jsonb_build_object('dependsOn', a.e -> 'dependsOn') else '{}'::jsonb end
      || public.item_option_axis_extra(a.e)
    order by a.n), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p, '[]'::jsonb)) with ordinality as a(e, n)
$$;

create or replace function public.item_option_axes_for_copy(p jsonb) returns jsonb
language sql immutable parallel safe as $$
  select coalesce(jsonb_agg(
    jsonb_build_object('key', a.e -> 'key', 'label', a.e -> 'label', 'display', a.e -> 'display', 'values', (
      select coalesce(jsonb_agg(
        jsonb_build_object('id', v.e -> 'id', 'label', v.e -> 'label')
          || case when v.e ? 'color' then jsonb_build_object('color', v.e -> 'color') else '{}'::jsonb end
          || case when v.e ? 'mediaId' then jsonb_build_object('copyMediaId', v.e -> 'mediaId')
                  when v.e ? 'copyMediaId' then jsonb_build_object('copyMediaId', v.e -> 'copyMediaId') else '{}'::jsonb end
          || public.item_option_value_extra(v.e)
        order by v.n), '[]'::jsonb)
      from jsonb_array_elements(a.e -> 'values') with ordinality as v(e, n))) || case when a.e ? 'dependsOn' then jsonb_build_object('dependsOn', a.e -> 'dependsOn') else '{}'::jsonb end
      || public.item_option_axis_extra(a.e)
    order by a.n), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p, '[]'::jsonb)) with ordinality as a(e, n)
$$;

create or replace function public.item_option_axes_remap(p jsonb, p_map jsonb) returns jsonb
language sql immutable parallel safe as $$
  select coalesce(jsonb_agg(
    jsonb_build_object('key', a.e -> 'key', 'label', a.e -> 'label', 'display', a.e -> 'display', 'values', (
      select coalesce(jsonb_agg(
        jsonb_build_object('id', v.e -> 'id', 'label', v.e -> 'label')
          || case when v.e ? 'color' then jsonb_build_object('color', v.e -> 'color') else '{}'::jsonb end
          || case when v.e ? 'copyMediaId' and p_map ? (v.e ->> 'copyMediaId') then jsonb_build_object('mediaId', p_map -> (v.e ->> 'copyMediaId'))
                  when v.e ? 'mediaId' then jsonb_build_object('mediaId', v.e -> 'mediaId') else '{}'::jsonb end
          || public.item_option_value_extra(v.e)
        order by v.n), '[]'::jsonb)
      from jsonb_array_elements(a.e -> 'values') with ordinality as v(e, n))) || case when a.e ? 'dependsOn' then jsonb_build_object('dependsOn', a.e -> 'dependsOn') else '{}'::jsonb end
      || public.item_option_axis_extra(a.e)
    order by a.n), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p, '[]'::jsonb)) with ordinality as a(e, n)
$$;

-- A deleted photo can no longer be a value's picture. The rest of the axis, including dependsOn and scale, stays as it was.
create or replace function public.item_option_axes_drop_media(p jsonb, p_media uuid) returns jsonb
language sql immutable parallel safe as $$
  select coalesce(jsonb_agg(
    (a.e - 'values') || jsonb_build_object('values', (
      select coalesce(jsonb_agg(
        case when lower(v.e ->> 'mediaId') = p_media::text then v.e - 'mediaId' else v.e end order by v.n), '[]'::jsonb)
      from jsonb_array_elements(a.e -> 'values') with ordinality as v(e, n)))
    order by a.n), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p, '[]'::jsonb)) with ordinality as a(e, n)
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Sizes for the product list
-- ---------------------------------------------------------------------------------------------------------------------

-- The stored scale values in a set of option axes: [{scale, system?, value, unit?, width?, shape?}], each once, at most 60; null when there are
-- none (so a payload stays small). Only axes that name a scale count. Pure, so the snapshot and the bulk read below cannot drift apart.
create or replace function public.item_size_values_from_axes(p jsonb) returns jsonb
language sql immutable parallel safe as $$
  select nullif(coalesce(jsonb_agg(s.sv), '[]'::jsonb), '[]'::jsonb)
  from (
    select distinct v.e -> 'stored' as sv
    from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) as a(e)
    cross join lateral jsonb_array_elements(case when jsonb_typeof(a.e -> 'values') = 'array' then a.e -> 'values' else '[]'::jsonb end) as v(e)
    where a.e ? 'scale' and v.e ? 'stored'
    order by 1
    limit 60
  ) s
$$;
revoke all on function public.item_size_values_from_axes(jsonb) from public;
grant execute on function public.item_size_values_from_axes(jsonb) to anon, authenticated, service_role;

-- One live public item's sizes. The items table stays closed to anon; this is a door that answers only for items the buyer page already shows
-- (public_items), and returns only what that page shows.
create or replace function public.item_size_values_public(p_item uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select public.item_size_values_from_axes(it.option_axes)
  from public.items it join public.public_items pi on pi.id = it.id
  where it.id = p_item
$$;
revoke all on function public.item_size_values_public(uuid) from public;
grant execute on function public.item_size_values_public(uuid) to anon, authenticated, service_role;

-- Every live public item's sizes at once, as { "<item id>": [..] }, for items that have any. The buyer product list reads this when it cannot
-- use products_snapshot (the fallback path), so size filters keep working. Same visibility rule as item_size_values_public.
create or replace function public.public_item_size_values(p_limit integer default 50000) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(x.id, x.sizes), '{}'::jsonb)
  from (
    select it.id, public.item_size_values_from_axes(it.option_axes) as sizes
    from public.items it join public.public_items pi on pi.id = it.id
    where it.option_axes <> '[]'::jsonb
    order by it.id
    limit least(greatest(coalesce(p_limit, 50000), 1), 50000)
  ) x
  where x.sizes is not null
$$;
revoke all on function public.public_item_size_values(integer) from public;
grant execute on function public.public_item_size_values(integer) to anon, authenticated, service_role;

-- products_snapshot: one more column, `size_values`. Patches the function as it is now (like 0054, 0057 and 0092), so every column added by an
-- earlier migration is kept. Running it twice changes nothing.
do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'products_snapshot';
  if position('item_size_values_public' in v_def) = 0 then
    v_new := replace(v_def, 'k.created_at, k.image_path, k.brand, k.video_paths,', 'k.created_at, k.image_path, k.brand, k.video_paths, public.item_size_values_public(k.id) as size_values,');
    if v_new = v_def then raise exception 'products_snapshot: item column list not found'; end if;
    execute v_new;
  end if;
end $$;
