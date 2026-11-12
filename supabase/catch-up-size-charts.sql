-- EpicMKT: size charts for the admin site (migrations 0086, 0091, 0093 and 0100 in one paste).
-- Fixes the Size charts page showing
--   "Could not find the function public.admin_size_charts_list without parameters in the schema cache"
--   "Could not find the table 'public.public_shoe_conversion' in the schema cache".
-- Safe to run more than once: these migrations only create or replace, add if missing, or skip if present.
-- Run it ONCE, whole, in the Supabase SQL editor on the project the admin site points to. The last line reloads the API for you.

-- Preflight: the base schema (migrations 0001 to 0085) must already be there.
do $$
declare v_missing text;
begin
  select string_agg(x, ', ') into v_missing from unnest(array[
    'public.is_admin()', 'public.has_role(text[])', 'public.my_business_id()'
  ]) as x where to_regprocedure(x) is null;
  if v_missing is not null then raise exception 'Missing base functions: %. Apply migrations 0001 to 0085 first.', v_missing; end if;
  select string_agg(x, ', ') into v_missing from unnest(array['public.items', 'public.businesses', 'public.audit_log']) as x where to_regclass(x) is null;
  if v_missing is not null then raise exception 'Missing base tables: %. Apply migrations 0001 to 0085 first.', v_missing; end if;
end $$;

-- Re-running: 0086 defines this view with fewer columns than 0093 gives it, and Postgres cannot shrink a view in place.
drop view if exists public.public_size_charts;

-- ======================================================================
-- 0086_item_options.sql
-- ======================================================================
-- 0086_item_options.sql
-- Product options (up to 3 axes), variants (one row per sellable combination), an availability matrix, and an admin-owned size chart library.
--
--   * items.option_axes   jsonb  [{key,label,display,values:[{id,label,color?,mediaId?}]}], max 3 axes, 1..40 values per axis.
--   * item_variants       one row per sellable combination (unique per item on combo_key). A combination with NO row is "unavailable":
--                         public_item_options() returns that as an explicit availability matrix, so the client never guesses.
--   * size_charts         library owned by admin (admin_save_size_chart). items.size_chart_id points at one chart, items.size_chart_override
--                         optionally replaces its rows for that item.
--   * public_item_options(item)  the public read: { options, variants, availability, sizeChart }. null when the item is not public.
--   * seller_item_options(item)  the seller read (raw stock counts).
--   * seller_save_item           accepts `options` {axes, variants}, `size_chart_id`, `size_chart_override`. A key that is absent leaves the
--                                stored value alone; `options: null` clears. Items without options behave exactly as before.
--   * seller_duplicate_item      copies axes, variants and the size chart. Media ids cannot exist yet (the files are copied afterwards by
--                                seller-item-copy-media), so the old ids are parked in copy_media_ids / copyMediaId and
--                                item_remap_copied_media() resolves them once the new media rows exist.
--   * seller_bulk_items          price_percent also scales variant prices (otherwise an item and its variants drift apart).
--   * Legacy: items.variants (0017) was never written by any function and is '[]' on every real row. item_options_convert_legacy() turns an
--     old [{id,label,price}] list into one "option" axis; it runs once below for any non-empty row. The old column is kept, unused.
-- Validation mirrors shared/src/seller/options.js (same limits, same error names); db and shared tests keep the two aligned.
-- Idempotent where possible; never edit this file once applied.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Validators (immutable, reused by CHECK constraints and by the save helper)
-- ---------------------------------------------------------------------------------------------------------------------

create or replace function public.option_slug_ok(p jsonb, p_max integer) returns boolean
language sql immutable parallel safe as
$$ select coalesce(jsonb_typeof(p) = 'string' and (p #>> '{}') ~ '^[a-z0-9][a-z0-9_-]*$' and char_length(p #>> '{}') <= p_max, false) $$;

create or replace function public.option_uuid_ok(p jsonb) returns boolean
language sql immutable parallel safe as
$$ select coalesce(jsonb_typeof(p) = 'string' and (p #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false) $$;

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
      if k not in ('key', 'label', 'display', 'values') then return false; end if;
    end loop;
    if not public.option_slug_ok(a -> 'key', 30) or (a ->> 'key') = any (v_keys) then return false; end if;
    v_keys := v_keys || (a ->> 'key');
    if not public.item_detail_text_ok(a -> 'label', 30) then return false; end if;
    if jsonb_typeof(a -> 'display') is distinct from 'string' or (a ->> 'display') <> all (array['swatch', 'image-card', 'button', 'dropdown', 'text-card']) then return false; end if;
    if jsonb_typeof(a -> 'values') is distinct from 'array' or jsonb_array_length(a -> 'values') not between 1 and 40 then return false; end if;
    v_ids := '{}';
    for v in select jsonb_array_elements(a -> 'values') loop
      if jsonb_typeof(v) <> 'object' then return false; end if;
      for k in select jsonb_object_keys(v) loop
        if k not in ('id', 'label', 'color', 'mediaId', 'copyMediaId') then return false; end if;
      end loop;
      if not public.option_slug_ok(v -> 'id', 40) or (v ->> 'id') = any (v_ids) then return false; end if;
      v_ids := v_ids || (v ->> 'id');
      if not public.item_detail_text_ok(v -> 'label', 40) then return false; end if;
      if v ? 'color' and (jsonb_typeof(v -> 'color') <> 'string' or (v ->> 'color') !~ '^#[0-9a-fA-F]{6}$') then return false; end if;
      if v ? 'mediaId' and not public.option_uuid_ok(v -> 'mediaId') then return false; end if;
      if v ? 'copyMediaId' and not public.option_uuid_ok(v -> 'copyMediaId') then return false; end if;
    end loop;
  end loop;
  return true;
end $$;

-- The identity of a combination: "color=red|size=m", axis order. null when the choice is not exactly one valid value per axis.
create or replace function public.item_option_combo_key(p_axes jsonb, p_choice jsonb) returns text
language plpgsql immutable parallel safe as $$
declare
  a jsonb;
  v_val text;
  v_parts text[] := '{}';
begin
  if p_axes is null or jsonb_typeof(p_axes) <> 'array' or jsonb_array_length(p_axes) = 0 then return null; end if;
  if p_choice is null or jsonb_typeof(p_choice) <> 'object' then return null; end if;
  if (select count(*) from jsonb_object_keys(p_choice)) <> jsonb_array_length(p_axes) then return null; end if;
  for a in select jsonb_array_elements(p_axes) loop
    if jsonb_typeof(p_choice -> (a ->> 'key')) is distinct from 'string' then return null; end if;
    v_val := p_choice ->> (a ->> 'key');
    if not exists (select 1 from jsonb_array_elements(a -> 'values') x where x ->> 'id' = v_val) then return null; end if;
    v_parts := v_parts || ((a ->> 'key') || '=' || v_val);
  end loop;
  return array_to_string(v_parts, '|');
end $$;

-- Rebuilds user-sent axes keeping only the known keys (never copyMediaId), trimming text and lower-casing colours.
-- Anything that is not the expected shape is returned unchanged so item_option_axes_valid refuses it.
create or replace function public.item_option_axes_clean(p jsonb) returns jsonb
language plpgsql immutable parallel safe as $$
declare
  a jsonb;
  v jsonb;
  v_axis jsonb;
  v_vals jsonb;
  v_out jsonb := '[]'::jsonb;
  v_one jsonb;
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
      v_vals := v_vals || jsonb_build_array(v_one);
    end loop;
    v_axis := jsonb_build_object('key', a -> 'key', 'label', case when jsonb_typeof(a -> 'label') = 'string' then to_jsonb(btrim(a ->> 'label')) else a -> 'label' end,
                                 'display', a -> 'display', 'values', v_vals);
    v_out := v_out || jsonb_build_array(v_axis);
  end loop;
  return v_out;
end $$;

-- The public/seller view of the axes: no internal keys (copyMediaId).
create or replace function public.item_option_axes_public(p jsonb) returns jsonb
language sql immutable parallel safe as $$
  select coalesce(jsonb_agg(
    jsonb_build_object('key', a.e -> 'key', 'label', a.e -> 'label', 'display', a.e -> 'display', 'values', (
      select coalesce(jsonb_agg(
        jsonb_build_object('id', v.e -> 'id', 'label', v.e -> 'label')
          || case when v.e ? 'color' then jsonb_build_object('color', v.e -> 'color') else '{}'::jsonb end
          || case when v.e ? 'mediaId' then jsonb_build_object('mediaId', v.e -> 'mediaId') else '{}'::jsonb end
        order by v.n), '[]'::jsonb)
      from jsonb_array_elements(a.e -> 'values') with ordinality as v(e, n)))
    order by a.n), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p, '[]'::jsonb)) with ordinality as a(e, n)
$$;

-- Duplicate: the new item has no media yet, so each mediaId is parked as copyMediaId until item_remap_copied_media runs.
create or replace function public.item_option_axes_for_copy(p jsonb) returns jsonb
language sql immutable parallel safe as $$
  select coalesce(jsonb_agg(
    jsonb_build_object('key', a.e -> 'key', 'label', a.e -> 'label', 'display', a.e -> 'display', 'values', (
      select coalesce(jsonb_agg(
        jsonb_build_object('id', v.e -> 'id', 'label', v.e -> 'label')
          || case when v.e ? 'color' then jsonb_build_object('color', v.e -> 'color') else '{}'::jsonb end
          || case when v.e ? 'mediaId' then jsonb_build_object('copyMediaId', v.e -> 'mediaId')
                  when v.e ? 'copyMediaId' then jsonb_build_object('copyMediaId', v.e -> 'copyMediaId') else '{}'::jsonb end
        order by v.n), '[]'::jsonb)
      from jsonb_array_elements(a.e -> 'values') with ordinality as v(e, n)))
    order by a.n), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p, '[]'::jsonb)) with ordinality as a(e, n)
$$;

-- Resolves parked copyMediaId values with {oldId: newId}; an id with no mapping (a file that failed to copy) is dropped.
create or replace function public.item_option_axes_remap(p jsonb, p_map jsonb) returns jsonb
language sql immutable parallel safe as $$
  select coalesce(jsonb_agg(
    jsonb_build_object('key', a.e -> 'key', 'label', a.e -> 'label', 'display', a.e -> 'display', 'values', (
      select coalesce(jsonb_agg(
        jsonb_build_object('id', v.e -> 'id', 'label', v.e -> 'label')
          || case when v.e ? 'color' then jsonb_build_object('color', v.e -> 'color') else '{}'::jsonb end
          || case when v.e ? 'copyMediaId' and p_map ? (v.e ->> 'copyMediaId') then jsonb_build_object('mediaId', p_map -> (v.e ->> 'copyMediaId'))
                  when v.e ? 'mediaId' then jsonb_build_object('mediaId', v.e -> 'mediaId') else '{}'::jsonb end
        order by v.n), '[]'::jsonb)
      from jsonb_array_elements(a.e -> 'values') with ordinality as v(e, n)))
    order by a.n), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p, '[]'::jsonb)) with ordinality as a(e, n)
$$;

-- A deleted photo can no longer be a value's picture.
create or replace function public.item_option_axes_drop_media(p jsonb, p_media uuid) returns jsonb
language sql immutable parallel safe as $$
  select coalesce(jsonb_agg(
    jsonb_build_object('key', a.e -> 'key', 'label', a.e -> 'label', 'display', a.e -> 'display', 'values', (
      select coalesce(jsonb_agg(
        case when lower(v.e ->> 'mediaId') = p_media::text then v.e - 'mediaId' else v.e end order by v.n), '[]'::jsonb)
      from jsonb_array_elements(a.e -> 'values') with ordinality as v(e, n)))
    order by a.n), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p, '[]'::jsonb)) with ordinality as a(e, n)
$$;

create or replace function public.size_chart_columns_valid(p jsonb) returns boolean
language plpgsql immutable parallel safe as $$
declare
  e jsonb;
  v_seen text[] := '{}';
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) not between 1 and 12 then return false; end if;
  for e in select jsonb_array_elements(p) loop
    if not public.item_detail_text_ok(e, 30) or lower(btrim(e #>> '{}')) = any (v_seen) then return false; end if;
    v_seen := v_seen || lower(btrim(e #>> '{}'));
  end loop;
  return true;
end $$;

-- Rows of cells. p_width null = any width (a seller override is compared with the chart's columns when it is saved and when it is read).
create or replace function public.size_chart_rows_valid(p jsonb, p_width integer) returns boolean
language plpgsql immutable parallel safe as $$
declare
  r jsonb;
  c jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) not between 1 and 60 then return false; end if;
  for r in select jsonb_array_elements(p) loop
    if jsonb_typeof(r) <> 'array' or jsonb_array_length(r) not between 1 and 12 then return false; end if;
    if p_width is not null and jsonb_array_length(r) <> p_width then return false; end if;
    for c in select jsonb_array_elements(r) loop
      if not public.item_detail_text_ok(c, 20) then return false; end if;
    end loop;
  end loop;
  return true;
end $$;

create or replace function public.size_chart_override_valid(p jsonb) returns boolean
language sql immutable parallel safe as $$
  select p is null or (jsonb_typeof(p) = 'object' and (select count(*) from jsonb_object_keys(p)) = 1 and p ? 'rows' and public.size_chart_rows_valid(p -> 'rows', null))
$$;

revoke all on function public.option_slug_ok(jsonb, integer), public.option_uuid_ok(jsonb), public.item_option_axes_valid(jsonb),
  public.item_option_combo_key(jsonb, jsonb), public.item_option_axes_clean(jsonb), public.item_option_axes_public(jsonb),
  public.item_option_axes_for_copy(jsonb), public.item_option_axes_remap(jsonb, jsonb), public.item_option_axes_drop_media(jsonb, uuid),
  public.size_chart_columns_valid(jsonb), public.size_chart_rows_valid(jsonb, integer), public.size_chart_override_valid(jsonb) from public;
grant execute on function public.option_slug_ok(jsonb, integer), public.option_uuid_ok(jsonb), public.item_option_axes_valid(jsonb),
  public.item_option_combo_key(jsonb, jsonb), public.item_option_axes_public(jsonb),
  public.size_chart_columns_valid(jsonb), public.size_chart_rows_valid(jsonb, integer), public.size_chart_override_valid(jsonb) to anon, authenticated, service_role;
grant execute on function public.item_option_axes_clean(jsonb), public.item_option_axes_for_copy(jsonb), public.item_option_axes_remap(jsonb, jsonb),
  public.item_option_axes_drop_media(jsonb, uuid) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Tables and columns
-- ---------------------------------------------------------------------------------------------------------------------

create table if not exists public.size_charts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  category text references public.categories(id) on update cascade on delete set null,
  unit text not null default 'cm' check (unit in ('cm', 'in', 'mm', 'kg', 'lb', 'none')),
  columns jsonb not null check (public.size_chart_columns_valid(columns)),
  rows jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint size_charts_rows_shape check (public.size_chart_rows_valid(rows, jsonb_array_length(columns)))
);
create unique index if not exists size_charts_name_idx on public.size_charts (coalesce(category, ''), lower(btrim(name)));
create index if not exists size_charts_category_idx on public.size_charts (category) where active;

alter table public.items
  add column if not exists option_axes jsonb not null default '[]'::jsonb,
  add column if not exists size_chart_id uuid references public.size_charts(id) on delete restrict,
  add column if not exists size_chart_override jsonb;

alter table public.items
  drop constraint if exists items_option_axes_shape,
  drop constraint if exists items_size_chart_override_shape,
  add constraint items_option_axes_shape check (public.item_option_axes_valid(option_axes)),
  add constraint items_size_chart_override_shape check (size_chart_override is null or (size_chart_id is not null and public.size_chart_override_valid(size_chart_override)));
create index if not exists items_size_chart_idx on public.items (size_chart_id) where size_chart_id is not null;

create table if not exists public.item_variants (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  combo_key text not null check (char_length(combo_key) between 3 and 400),
  choice jsonb not null check (jsonb_typeof(choice) = 'object'),
  price numeric(12,2) check (price >= 0),
  sale_price numeric(12,2) check (sale_price >= 0),
  stock_count integer check (stock_count between 0 and 999999),
  status text not null default 'available' check (status in ('available', 'limited_stock', 'out_of_stock', 'unavailable')),
  sku text check (char_length(sku) between 1 and 40),
  media_ids uuid[] not null default '{}' check (cardinality(media_ids) <= 10),
  copy_media_ids uuid[] not null default '{}' check (cardinality(copy_media_ids) <= 10),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint item_variants_combo_uq unique (item_id, combo_key),
  constraint item_variants_sale_ck check (sale_price is null or (price is not null and sale_price < price))
);
create unique index if not exists item_variants_sku_idx on public.item_variants (item_id, lower(sku)) where sku is not null;
create index if not exists item_variants_business_idx on public.item_variants (business_id);

alter table public.size_charts enable row level security;
alter table public.item_variants enable row level security;
drop policy if exists "admin reads size_charts" on public.size_charts;
create policy "admin reads size_charts" on public.size_charts for select to authenticated using (public.is_admin());
drop policy if exists "seller reads own variants" on public.item_variants;
create policy "seller reads own variants" on public.item_variants for select to authenticated using (business_id = public.my_business_id());
drop policy if exists "admin reads item_variants" on public.item_variants;
create policy "admin reads item_variants" on public.item_variants for select to authenticated using (public.is_admin());
revoke all on public.size_charts, public.item_variants from public, anon, authenticated;
grant select on public.size_charts, public.item_variants to authenticated;
grant all on public.size_charts, public.item_variants to service_role;

-- A deleted media row can no longer picture a variant or an option value.
create or replace function public.item_options_media_removed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.item_variants set media_ids = array_remove(media_ids, old.id), updated_at = now()
    where item_id = old.item_id and old.id = any (media_ids);
  update public.items set option_axes = public.item_option_axes_drop_media(option_axes, old.id)
    where id = old.item_id and option_axes::text ilike '%' || old.id::text || '%';
  return null;
end $$;
drop trigger if exists item_options_media_removed on public.item_media;
create trigger item_options_media_removed after delete on public.item_media for each row execute function public.item_options_media_removed();
revoke all on function public.item_options_media_removed() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Legacy items.variants -> one "option" axis
-- ---------------------------------------------------------------------------------------------------------------------

-- items.variants (0017) holds [{id, label, price, stock?}], up to 10, written by the seller editor since 0085. Those entries stay the
-- source for any item that has no option_axes: the public and seller reads below turn them into ONE "option" axis on the fly, so
-- nothing visible changes and an edit made in the old editor shows at once. (A one-time copy into item_variants would go stale the
-- moment the old editor saved again.) Saving real options supersedes the old list: item_options_apply empties it.
-- Returns { axes: [ the one axis, or none ], rows: [{ slug, label, price, stock }] }. Entries without a label are skipped; ids become
-- unique slugs (the old id when it has one, so selections keep working); a numeric stock is kept, 0 meaning out of stock.
create or replace function public.item_options_from_legacy(p_variants jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  e jsonb;
  n integer := 0;
  v_i integer := 0;
  v_slug text;
  v_used text[] := '{}';
  v_vals jsonb := '[]'::jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_label text;
begin
  if p_variants is null or jsonb_typeof(p_variants) <> 'array' then return jsonb_build_object('axes', '[]'::jsonb, 'rows', '[]'::jsonb); end if;
  for e in select jsonb_array_elements(p_variants) loop
    v_i := v_i + 1;
    exit when n >= 40;
    if jsonb_typeof(e) <> 'object' then continue; end if;
    v_label := btrim(coalesce(e ->> 'label', ''));
    if not public.item_detail_text_ok(to_jsonb(v_label), 40) then continue; end if;
    v_slug := regexp_replace(lower(coalesce(nullif(btrim(e ->> 'id'), ''), v_label)), '[^a-z0-9_-]+', '-', 'g');
    v_slug := left(regexp_replace(v_slug, '^[^a-z0-9]+', ''), 40);
    if v_slug = '' then v_slug := 'option-' || v_i; end if;
    if v_slug = any (v_used) then v_slug := left(v_slug, 36) || '-' || v_i; end if;
    if v_slug = any (v_used) then continue; end if;
    v_used := v_used || v_slug;
    n := n + 1;
    v_vals := v_vals || jsonb_build_array(jsonb_build_object('id', v_slug, 'label', v_label));
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'slug', v_slug, 'label', v_label,
      'price', case when coalesce(e ->> 'price', '') ~ '^\d{1,10}(\.\d{1,2})?$' then (e ->> 'price')::numeric end,
      'stock', case when coalesce(e ->> 'stock', '') ~ '^\d{1,6}$' then (e ->> 'stock')::integer end));
  end loop;
  if n = 0 then return jsonb_build_object('axes', '[]'::jsonb, 'rows', '[]'::jsonb); end if;
  return jsonb_build_object('axes', jsonb_build_array(jsonb_build_object('key', 'option', 'label', 'Option', 'display', 'button', 'values', v_vals)), 'rows', v_rows);
end $$;
revoke all on function public.item_options_from_legacy(jsonb) from public;
grant execute on function public.item_options_from_legacy(jsonb) to anon, authenticated, service_role;

-- For the editor task's one-time move to stored options (not run by this migration): copies an item's old list into option_axes and
-- item_variants and empties the old list. Returns true when it converted something.
create or replace function public.item_options_convert_legacy(p_item uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  r public.items;
  c jsonb;
begin
  select * into r from public.items where id = p_item for update;
  if not found or r.option_axes <> '[]'::jsonb then return false; end if;
  c := public.item_options_from_legacy(r.variants);
  if jsonb_array_length(c -> 'axes') = 0 then return false; end if;
  update public.items set option_axes = c -> 'axes', variants = '[]'::jsonb where id = p_item;
  insert into public.item_variants (item_id, business_id, combo_key, choice, price, stock_count, status, sort)
  select p_item, r.business_id, 'option=' || (x.e ->> 'slug'), jsonb_build_object('option', x.e ->> 'slug'), (x.e ->> 'price')::numeric,
         (x.e ->> 'stock')::integer, case when (x.e ->> 'stock') = '0' then 'out_of_stock' else 'available' end, (x.n - 1)::integer
    from jsonb_array_elements(c -> 'rows') with ordinality as x(e, n);
  return true;
end $$;
revoke all on function public.item_options_convert_legacy(uuid) from public, anon, authenticated;
grant execute on function public.item_options_convert_legacy(uuid) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Saving options (called by seller_save_item)
-- ---------------------------------------------------------------------------------------------------------------------

-- Validates and stores what a seller_save_item call sent for options and the size chart. Internal: the caller has checked ownership.
-- Errors (P0001): invalid_options, too_many_variants, invalid_variant, duplicate_variant, duplicate_sku, invalid_size_chart, item_in_flash_sale.
create or replace function public.item_options_apply(p_item uuid, p_business uuid, f jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old public.items;
  v_opts jsonb;
  v_axes jsonb;
  v_vars jsonb;
  e jsonb;
  k text;
  n integer := 0;
  v_key text;
  v_keys text[] := '{}';
  v_skus text[] := '{}';
  v_sku text;
  v_status text;
  v_stock integer;
  v_price numeric;
  v_sale numeric;
  v_media uuid[];
  v_rows jsonb := '[]'::jsonb;
  m jsonb;
  v_changed boolean;
  v_chart public.size_charts;
  v_chart_id uuid;
  c_money constant text := '^\d{1,10}(\.\d{1,2})?$';
begin
  select * into v_old from public.items where id = p_item and business_id = p_business for update;
  if not found then raise exception 'item_not_found' using errcode = 'P0001'; end if;

  if f ? 'options' then
    v_opts := f -> 'options';
    if v_opts is null or jsonb_typeof(v_opts) = 'null' then
      v_axes := '[]'::jsonb;
      v_vars := '[]'::jsonb;
    else
      if jsonb_typeof(v_opts) <> 'object' then raise exception 'invalid_options' using errcode = 'P0001'; end if;
      for k in select jsonb_object_keys(v_opts) loop
        if k not in ('axes', 'variants') then raise exception 'invalid_options' using errcode = 'P0001'; end if;
      end loop;
      v_axes := coalesce(nullif(v_opts -> 'axes', 'null'::jsonb), '[]'::jsonb);
      v_vars := coalesce(nullif(v_opts -> 'variants', 'null'::jsonb), '[]'::jsonb);
    end if;
    if jsonb_typeof(v_axes) <> 'array' or jsonb_typeof(v_vars) <> 'array' then raise exception 'invalid_options' using errcode = 'P0001'; end if;
    v_axes := public.item_option_axes_clean(v_axes);
    if not public.item_option_axes_valid(v_axes) then raise exception 'invalid_options' using errcode = 'P0001'; end if;
    if jsonb_array_length(v_vars) > 200 then raise exception 'too_many_variants' using errcode = 'P0001'; end if;
    if jsonb_array_length(v_axes) = 0 and jsonb_array_length(v_vars) > 0 then raise exception 'invalid_options' using errcode = 'P0001'; end if;

    -- A value's picture must be one of this item's own media.
    for m in select v.e from jsonb_array_elements(v_axes) a(e), jsonb_array_elements(a.e -> 'values') v(e) where v.e ? 'mediaId' loop
      if not exists (select 1 from public.item_media im where im.id = (m ->> 'mediaId')::uuid and im.item_id = p_item) then
        raise exception 'invalid_options' using errcode = 'P0001';
      end if;
    end loop;

    -- Check every variant first (collected in v_rows), then write.

    for e in select jsonb_array_elements(v_vars) loop
      n := n + 1;
      if jsonb_typeof(e) <> 'object' then raise exception 'invalid_variant' using errcode = 'P0001'; end if;
      for k in select jsonb_object_keys(e) loop
        if k not in ('id', 'choice', 'price', 'salePrice', 'stock', 'status', 'sku', 'mediaIds') then raise exception 'invalid_variant' using errcode = 'P0001'; end if;
      end loop;
      v_key := public.item_option_combo_key(v_axes, e -> 'choice');
      if v_key is null then raise exception 'invalid_variant' using errcode = 'P0001'; end if;
      if v_key = any (v_keys) then raise exception 'duplicate_variant' using errcode = 'P0001'; end if;
      v_keys := v_keys || v_key;

      v_price := null; v_sale := null; v_stock := null; v_sku := null; v_media := '{}';
      if jsonb_typeof(e -> 'price') not in ('null') and e ? 'price' then
        if (e ->> 'price') !~ c_money then raise exception 'invalid_variant' using errcode = 'P0001'; end if;
        v_price := (e ->> 'price')::numeric;
      end if;
      if e ? 'salePrice' and jsonb_typeof(e -> 'salePrice') <> 'null' then
        if (e ->> 'salePrice') !~ c_money or v_price is null then raise exception 'invalid_variant' using errcode = 'P0001'; end if;
        v_sale := (e ->> 'salePrice')::numeric;
        if v_sale >= v_price then raise exception 'invalid_variant' using errcode = 'P0001'; end if;
      end if;
      if e ? 'stock' and jsonb_typeof(e -> 'stock') <> 'null' then
        if (e ->> 'stock') !~ '^\d{1,6}$' then raise exception 'invalid_variant' using errcode = 'P0001'; end if;
        v_stock := (e ->> 'stock')::integer;
      end if;
      v_status := coalesce(case when e ? 'status' and jsonb_typeof(e -> 'status') <> 'null' then e ->> 'status' end, 'available');
      if jsonb_typeof(coalesce(e -> 'status', '"available"'::jsonb)) not in ('string', 'null')
         or v_status not in ('available', 'limited_stock', 'out_of_stock', 'unavailable') then raise exception 'invalid_variant' using errcode = 'P0001'; end if;
      if v_stock = 0 then v_status := 'out_of_stock'; end if;
      if e ? 'sku' and jsonb_typeof(e -> 'sku') <> 'null' then
        if jsonb_typeof(e -> 'sku') <> 'string' then raise exception 'invalid_variant' using errcode = 'P0001'; end if;
        v_sku := nullif(btrim(e ->> 'sku'), '');
        if char_length(coalesce(v_sku, '')) > 40 then raise exception 'invalid_variant' using errcode = 'P0001'; end if;
        if v_sku is not null then
          if lower(v_sku) = any (v_skus) then raise exception 'duplicate_sku' using errcode = 'P0001'; end if;
          v_skus := v_skus || lower(v_sku);
        end if;
      end if;
      if e ? 'mediaIds' and jsonb_typeof(e -> 'mediaIds') <> 'null' then
        if jsonb_typeof(e -> 'mediaIds') <> 'array' or jsonb_array_length(e -> 'mediaIds') > 10 then raise exception 'invalid_variant' using errcode = 'P0001'; end if;
        for m in select jsonb_array_elements(e -> 'mediaIds') loop
          if not public.option_uuid_ok(m) then raise exception 'invalid_variant' using errcode = 'P0001'; end if;
          if (m #>> '{}')::uuid = any (v_media) then raise exception 'invalid_variant' using errcode = 'P0001'; end if;
          if not exists (select 1 from public.item_media im where im.id = (m #>> '{}')::uuid and im.item_id = p_item) then
            raise exception 'invalid_variant' using errcode = 'P0001';
          end if;
          v_media := v_media || (m #>> '{}')::uuid;
        end loop;
      end if;
      v_rows := v_rows || jsonb_build_array(jsonb_build_object('ord', n, 'combo_key', v_key, 'choice', e -> 'choice', 'price', v_price, 'sale_price', v_sale,
                                                               'stock_count', v_stock, 'status', v_status, 'sku', v_sku, 'media_ids', to_jsonb(v_media)));
    end loop;

    -- The flash guard of seller_save_item covers variant prices too: they cannot change while the item is in a scheduled or live sale.
    if exists (select 1 from public.flash_sales s where s.item_id = p_item and s.status in ('scheduled', 'live')) then
      select exists (
        select 1 from jsonb_to_recordset(v_rows) as t(combo_key text, price numeric, sale_price numeric)
          full join public.item_variants o on o.item_id = p_item and o.combo_key = t.combo_key
        where (t.combo_key is null or o.combo_key is null) and coalesce(t.price, o.price) is not null
           or (t.combo_key is not null and o.combo_key is not null and (t.price, t.sale_price) is distinct from (o.price, o.sale_price))
      ) into v_changed;
      if v_changed then raise exception 'item_in_flash_sale' using errcode = 'P0001'; end if;
    end if;

    delete from public.item_variants where item_id = p_item and not (combo_key = any (v_keys));
    update public.item_variants set sku = null where item_id = p_item;   -- a SKU may move between combinations in one save
    insert into public.item_variants (item_id, business_id, combo_key, choice, price, sale_price, stock_count, status, sku, media_ids, copy_media_ids, sort)
    select p_item, p_business, t.combo_key, t.choice, t.price, t.sale_price, t.stock_count, t.status, t.sku,
           array(select jsonb_array_elements_text(t.media_ids)::uuid), '{}', t.ord - 1
      from jsonb_to_recordset(v_rows) as t(ord integer, combo_key text, choice jsonb, price numeric, sale_price numeric, stock_count integer, status text, sku text, media_ids jsonb)
    on conflict (item_id, combo_key) do update set
      choice = excluded.choice, price = excluded.price, sale_price = excluded.sale_price, stock_count = excluded.stock_count, status = excluded.status,
      sku = excluded.sku, media_ids = excluded.media_ids, copy_media_ids = '{}', sort = excluded.sort, updated_at = now();
    -- Real options supersede the old single-list variants (still written by the old editor); leaving both would show two lists.
    update public.items set option_axes = v_axes, variants = case when jsonb_array_length(v_axes) > 0 then '[]'::jsonb else variants end where id = p_item;
  end if;

  if f ? 'size_chart_id' then
    if jsonb_typeof(f -> 'size_chart_id') = 'null' then
      update public.items set size_chart_id = null, size_chart_override = null where id = p_item;
    else
      if not public.option_uuid_ok(f -> 'size_chart_id') then raise exception 'invalid_size_chart' using errcode = 'P0001'; end if;
      v_chart_id := (f ->> 'size_chart_id')::uuid;
      -- An item may keep a chart that was retired since, but cannot newly pick one.
      if not exists (select 1 from public.size_charts sc where sc.id = v_chart_id and (sc.active or sc.id = v_old.size_chart_id)) then
        raise exception 'invalid_size_chart' using errcode = 'P0001';
      end if;
      update public.items set size_chart_id = v_chart_id, size_chart_override = case when v_chart_id is distinct from v_old.size_chart_id then null else size_chart_override end
        where id = p_item;
    end if;
  end if;

  if f ? 'size_chart_override' then
    select * into v_old from public.items where id = p_item;
    if jsonb_typeof(f -> 'size_chart_override') = 'null' then
      update public.items set size_chart_override = null where id = p_item;
    else
      if v_old.size_chart_id is null or jsonb_typeof(f -> 'size_chart_override') <> 'object' then raise exception 'invalid_size_chart' using errcode = 'P0001'; end if;
      for k in select jsonb_object_keys(f -> 'size_chart_override') loop
        if k <> 'rows' then raise exception 'invalid_size_chart' using errcode = 'P0001'; end if;
      end loop;
      select * into v_chart from public.size_charts where id = v_old.size_chart_id;
      if not public.size_chart_rows_valid(f #> '{size_chart_override,rows}', jsonb_array_length(v_chart.columns)) then raise exception 'invalid_size_chart' using errcode = 'P0001'; end if;
      update public.items set size_chart_override = jsonb_build_object('rows', f #> '{size_chart_override,rows}') where id = p_item;
    end if;
  end if;
end $$;
revoke all on function public.item_options_apply(uuid, uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. Reads: availability matrix, public payload, seller payload
-- ---------------------------------------------------------------------------------------------------------------------

create or replace function public.option_status_rank(p text) returns integer
language sql immutable parallel safe as
$$ select case p when 'available' then 4 when 'limited_stock' then 3 when 'out_of_stock' then 2 else 1 end $$;

-- { axes: [key], missing: 'unavailable', cells: [{ key, choice, status, variantId }], values: { axisKey: { valueId: status } } }
-- p_cells: [{ id, key, choice, status }] in display order (stored variants, or the old list read as one axis). A combination with no
-- cell is unavailable: `missing` says so. `values` gives every option value its best status across the cells that contain it, so a
-- picker can grey out a value without enumerating combinations.
create or replace function public.item_options_matrix(p_axes jsonb, p_cells jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  a jsonb;
  v jsonb;
  v_values jsonb := '{}'::jsonb;
  v_axis jsonb;
  v_best text;
begin
  for a in select jsonb_array_elements(coalesce(p_axes, '[]'::jsonb)) loop
    v_axis := '{}'::jsonb;
    for v in select jsonb_array_elements(a -> 'values') loop
      select c ->> 'status' into v_best from jsonb_array_elements(coalesce(p_cells, '[]'::jsonb)) c
        where c -> 'choice' ->> (a ->> 'key') = v ->> 'id'
        order by public.option_status_rank(c ->> 'status') desc limit 1;
      v_axis := v_axis || jsonb_build_object(v ->> 'id', coalesce(v_best, 'unavailable'));
    end loop;
    v_values := v_values || jsonb_build_object(a ->> 'key', v_axis);
  end loop;
  return jsonb_build_object(
    'axes', coalesce((select jsonb_agg(x ->> 'key') from jsonb_array_elements(coalesce(p_axes, '[]'::jsonb)) x), '[]'::jsonb),
    'missing', 'unavailable',
    'cells', coalesce((select jsonb_agg(jsonb_build_object('key', c ->> 'key', 'choice', c -> 'choice', 'status', c ->> 'status', 'variantId', c -> 'id') order by n)
                       from jsonb_array_elements(coalesce(p_cells, '[]'::jsonb)) with ordinality as t(c, n)), '[]'::jsonb),
    'values', v_values);
end $$;
revoke all on function public.item_options_matrix(jsonb, jsonb), public.option_status_rank(text) from public;
grant execute on function public.item_options_matrix(jsonb, jsonb), public.option_status_rank(text) to service_role;

create or replace function public.item_size_chart_payload(p_item public.items) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when c.id is null then null else jsonb_build_object(
    'id', c.id, 'name', c.name, 'category', c.category, 'unit', c.unit, 'columns', c.columns,
    'rows', case when p_item.size_chart_override is not null and public.size_chart_rows_valid(p_item.size_chart_override -> 'rows', jsonb_array_length(c.columns))
                 then p_item.size_chart_override -> 'rows' else c.rows end,
    'overridden', p_item.size_chart_override is not null and public.size_chart_rows_valid(p_item.size_chart_override -> 'rows', jsonb_array_length(c.columns))) end
  from (select 1) one left join public.size_charts c on c.id = p_item.size_chart_id and c.active
$$;
revoke all on function public.item_size_chart_payload(public.items) from public;
grant execute on function public.item_size_chart_payload(public.items) to service_role;

-- "Red / S": the chosen values' labels in axis order. Every option variant carries it, as the old {id, label, price} entries did.
create or replace function public.item_variant_label(p_axes jsonb, p_choice jsonb) returns text
language sql immutable parallel safe as $$
  select string_agg(v.e ->> 'label', ' / ' order by a.n)
  from jsonb_array_elements(coalesce(p_axes, '[]'::jsonb)) with ordinality as a(e, n)
  join lateral jsonb_array_elements(a.e -> 'values') as v(e) on v.e ->> 'id' = p_choice ->> (a.e ->> 'key')
$$;
revoke all on function public.item_variant_label(jsonb, jsonb) from public;
grant execute on function public.item_variant_label(jsonb, jsonb) to anon, authenticated, service_role;

-- The axes, the variants (id, label, choice, price, sale price, status, sku, media, stock) and the cells for one item: stored options,
-- or, when the item has none, its old variants list read as one "option" axis. `legacy` says which. Internal to the two reads below.
create or replace function public.item_options_source(i public.items) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  c jsonb;
  v_axes jsonb;
  v_vars jsonb;
begin
  if i.option_axes <> '[]'::jsonb then
    return jsonb_build_object('legacy', false, 'axes', i.option_axes, 'variants', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'label', public.item_variant_label(i.option_axes, s.choice), 'key', s.combo_key, 'choice', s.choice,
        'price', s.price, 'salePrice', s.sale_price, 'stock', s.stock_count, 'status', s.status, 'sku', s.sku, 'mediaIds', to_jsonb(s.media_ids)) order by s.sort, s.id)
      from public.item_variants s where s.item_id = i.id), '[]'::jsonb));
  end if;
  c := public.item_options_from_legacy(case when jsonb_typeof(i.variants) = 'array' then i.variants else '[]'::jsonb end);
  v_axes := c -> 'axes';
  select coalesce(jsonb_agg(jsonb_build_object('id', x.e ->> 'slug', 'label', x.e ->> 'label', 'key', 'option=' || (x.e ->> 'slug'),
      'choice', jsonb_build_object('option', x.e ->> 'slug'), 'price', x.e -> 'price', 'salePrice', null, 'stock', x.e -> 'stock',
      'status', case when (x.e ->> 'stock') = '0' then 'out_of_stock' else 'available' end, 'sku', null, 'mediaIds', '[]'::jsonb) order by x.n), '[]'::jsonb)
    into v_vars from jsonb_array_elements(c -> 'rows') with ordinality as x(e, n);
  return jsonb_build_object('legacy', jsonb_array_length(v_axes) > 0, 'axes', v_axes, 'variants', v_vars);
end $$;
revoke all on function public.item_options_source(public.items) from public;
grant execute on function public.item_options_source(public.items) to service_role;

-- The public read. null when the item is not public (hidden, draft, removed, sold out, shop not visible).
-- New keys on purpose: the item already has `availability` (its own status string) and `variants` (the old list, which pricing is built
-- from), and pages read both. options / optionVariants / optionAvailability / sizeChart sit beside them.
create or replace function public.public_item_options(p_item uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  i public.items;
  src jsonb;
begin
  if not exists (select 1 from public.public_items pi where pi.id = p_item) then return null; end if;
  select * into i from public.items where id = p_item;
  src := public.item_options_source(i);
  return jsonb_build_object(
    'options', public.item_option_axes_public(src -> 'axes'),
    'optionVariants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.e -> 'id', 'label', x.e -> 'label', 'choice', x.e -> 'choice',
        'price', coalesce(nullif(x.e -> 'price', 'null'::jsonb), to_jsonb(i.price)),
        'salePrice', case when jsonb_typeof(x.e -> 'price') = 'null' then to_jsonb(i.sale_price) else x.e -> 'salePrice' end,
        'status', x.e -> 'status', 'sku', x.e -> 'sku', 'mediaIds', x.e -> 'mediaIds',
        'stockLeft', case when i.show_stock_count and x.e ->> 'status' = 'limited_stock' and (x.e ->> 'stock')::integer > 0 then x.e -> 'stock' end) order by x.n)
      from jsonb_array_elements(src -> 'variants') with ordinality as x(e, n)), '[]'::jsonb),
    'optionAvailability', public.item_options_matrix(src -> 'axes', (
      select coalesce(jsonb_agg(jsonb_build_object('id', x.e -> 'id', 'key', x.e -> 'key', 'choice', x.e -> 'choice', 'status', x.e -> 'status') order by x.n), '[]'::jsonb)
      from jsonb_array_elements(src -> 'variants') with ordinality as x(e, n))),
    'sizeChart', public.item_size_chart_payload(i));
end $$;

create or replace function public.seller_item_options(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  i public.items;
  src jsonb;
begin
  perform public.assert_seller_active();
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select * into i from public.items where id = p_id and business_id = v_id and not removed_by_admin;
  if not found then raise exception 'item_not_found' using errcode = 'P0001'; end if;
  src := public.item_options_source(i);
  return jsonb_build_object(
    'fromLegacy', src -> 'legacy',
    'axes', public.item_option_axes_public(src -> 'axes'),
    'variants', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.e -> 'id', 'choice', x.e -> 'choice', 'price', x.e -> 'price', 'salePrice', x.e -> 'salePrice', 'stock', x.e -> 'stock',
                                          'status', x.e -> 'status', 'sku', x.e -> 'sku', 'mediaIds', x.e -> 'mediaIds') order by x.n)
      from jsonb_array_elements(src -> 'variants') with ordinality as x(e, n)), '[]'::jsonb),
    'optionAvailability', public.item_options_matrix(src -> 'axes', (
      select coalesce(jsonb_agg(jsonb_build_object('id', x.e -> 'id', 'key', x.e -> 'key', 'choice', x.e -> 'choice', 'status', x.e -> 'status') order by x.n), '[]'::jsonb)
      from jsonb_array_elements(src -> 'variants') with ordinality as x(e, n))),
    'sizeChartId', i.size_chart_id,
    'sizeChartOverride', i.size_chart_override);
end $$;

-- Called by seller-item-copy-media (service role) once the copied media exists: {oldMediaId: newMediaId}.
create or replace function public.item_remap_copied_media(p_item uuid, p_map jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  if p_map is null or jsonb_typeof(p_map) <> 'object' then raise exception 'invalid_map' using errcode = 'P0001'; end if;
  update public.item_variants v set
    media_ids = coalesce((
      select array_agg((p_map ->> u.old::text)::uuid order by u.ord)
      from unnest(v.copy_media_ids) with ordinality as u(old, ord)
      where p_map ? u.old::text
        and exists (select 1 from public.item_media im where im.id = (p_map ->> u.old::text)::uuid and im.item_id = p_item)), '{}'),
    copy_media_ids = '{}', updated_at = now()
  where v.item_id = p_item and cardinality(v.copy_media_ids) > 0;
  get diagnostics v_n = row_count;
  update public.items set option_axes = public.item_option_axes_remap(option_axes, p_map)
    where id = p_item and option_axes::text like '%copyMediaId%';
  return v_n;
end $$;
revoke all on function public.item_remap_copied_media(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.item_remap_copied_media(uuid, jsonb) to service_role;

revoke all on function public.public_item_options(uuid), public.seller_item_options(uuid) from public, anon;
grant execute on function public.public_item_options(uuid) to anon, authenticated, service_role;
grant execute on function public.seller_item_options(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. Size chart library (admin owns it; everyone can read the active charts)
-- ---------------------------------------------------------------------------------------------------------------------

create or replace view public.public_size_charts with (security_barrier = true) as
select c.id, c.name, c.category, c.unit, c.columns, c.rows from public.size_charts c where c.active;
revoke all on public.public_size_charts from public;
grant select on public.public_size_charts to anon, authenticated, service_role;

create or replace function public.admin_size_charts_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.category nulls last, x.name)
    from (select c.id, c.name, c.category, c.unit, c.columns, c.rows, c.active, c.updated_at,
                 (select count(*) from public.items i where i.size_chart_id = c.id) as items_using
            from public.size_charts c) x), '[]'::jsonb);
end $$;

create or replace function public.admin_save_size_chart(p_id uuid, p_fields jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  f jsonb := coalesce(p_fields, '{}'::jsonb);
  v_name text := btrim(coalesce(f ->> 'name', ''));
  v_category text := nullif(btrim(coalesce(f ->> 'category', '')), '');
  v_unit text := coalesce(f ->> 'unit', 'cm');
  v_active boolean := coalesce((f ->> 'active')::boolean, true);
  v_old public.size_charts;
  v_id uuid;
begin
  if not public.has_role(array['owner']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(v_name) not between 2 and 80 then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  if v_unit not in ('cm', 'in', 'mm', 'kg', 'lb', 'none') then raise exception 'invalid_unit' using errcode = 'P0001'; end if;
  if v_category is not null and not exists (select 1 from public.categories c where c.id = v_category) then raise exception 'invalid_category' using errcode = 'P0001'; end if;
  if not public.size_chart_columns_valid(f -> 'columns') or not public.size_chart_rows_valid(f -> 'rows', jsonb_array_length(f -> 'columns')) then
    raise exception 'invalid_chart' using errcode = 'P0001';
  end if;
  begin
    if p_id is null then
      insert into public.size_charts (name, category, unit, columns, rows, active) values (v_name, v_category, v_unit, f -> 'columns', f -> 'rows', v_active) returning id into v_id;
      perform public.admin_audit_action('size_chart.create', 'size_chart', v_id::text, null, jsonb_build_object('name', v_name, 'category', v_category), null, null);
    else
      select * into v_old from public.size_charts where id = p_id for update;
      if not found then raise exception 'chart_not_found' using errcode = 'P0001'; end if;
      update public.size_charts set name = v_name, category = v_category, unit = v_unit, columns = f -> 'columns', rows = f -> 'rows', active = v_active, updated_at = now() where id = p_id;
      v_id := p_id;
      perform public.admin_audit_action('size_chart.update', 'size_chart', v_id::text, jsonb_build_object('name', v_old.name, 'active', v_old.active), jsonb_build_object('name', v_name, 'active', v_active), null, null);
    end if;
  exception when unique_violation then
    raise exception 'duplicate_chart' using errcode = 'P0001';
  end;
  return v_id;
end $$;

create or replace function public.admin_delete_size_chart(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old public.size_charts;
begin
  if not public.has_role(array['owner']) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_old from public.size_charts where id = p_id for update;
  if not found then raise exception 'chart_not_found' using errcode = 'P0001'; end if;
  if exists (select 1 from public.items i where i.size_chart_id = p_id) then raise exception 'size_chart_in_use' using errcode = 'P0001'; end if;
  delete from public.size_charts where id = p_id;
  perform public.admin_audit_action('size_chart.delete', 'size_chart', p_id::text, jsonb_build_object('name', v_old.name), null, null, null);
end $$;

revoke all on function public.admin_size_charts_list(), public.admin_save_size_chart(uuid, jsonb), public.admin_delete_size_chart(uuid) from public, anon;
grant execute on function public.admin_size_charts_list(), public.admin_save_size_chart(uuid, jsonb), public.admin_delete_size_chart(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 7. seller_save_item, seller_duplicate_item, seller_bulk_items (latest definitions: 0085, 0050, 004600; changes marked "0086")
-- ---------------------------------------------------------------------------------------------------------------------

create or replace function public.seller_save_item(p_id uuid, p_fields jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  f jsonb := coalesce(p_fields, '{}'::jsonb);
  v_old public.items;
  v_name text := btrim(coalesce(f ->> 'name', ''));
  v_desc text := nullif(btrim(coalesce(f ->> 'description', '')), '');
  v_section text := nullif(btrim(coalesce(f ->> 'section', '')), '');
  v_unit text := nullif(btrim(coalesce(f ->> 'unit', '')), '');
  v_type text := f ->> 'price_type';
  v_avail text := f ->> 'availability';
  v_old_item public.items;
  v_track boolean;
  v_count integer;
  v_low integer;
  v_show boolean;
  v_price numeric;
  v_max numeric;
  v_sale numeric;
  v_sort integer;
  v_new uuid;
  v_brand text;
  v_short text;
  v_terms text;
  v_pack text;
  v_hl jsonb;
  v_specs jsonb;
  v_inc text[];
  v_var jsonb;
  c_money constant text := '^\d{1,10}(\.\d{1,2})?$';
begin
  perform public.assert_seller_active();
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;

  if char_length(v_name) < 2 or char_length(v_name) > 120 then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  if char_length(coalesce(v_desc, '')) > 2000 or char_length(coalesce(v_section, '')) > 60 or char_length(coalesce(v_unit, '')) > 30 then
    raise exception 'invalid_text' using errcode = 'P0001';
  end if;
  if v_avail is null or v_avail not in ('available','limited_stock','out_of_stock','unavailable','by_appointment') then
    raise exception 'invalid_availability' using errcode = 'P0001';
  end if;
  if v_type is null or v_type not in ('fixed','from','range','free','contact') then raise exception 'invalid_price' using errcode = 'P0001'; end if;

  if p_id is not null then
    select * into v_old_item from public.items i where i.id = p_id and i.business_id = v_id;
  end if;
  if (f ? 'low_stock_threshold' and coalesce(f ->> 'low_stock_threshold', '') !~ '^\d{1,4}$')
     or (f ? 'track_stock' and coalesce(f ->> 'track_stock', '') not in ('true', 'false'))
     or (f ? 'show_stock_count' and coalesce(f ->> 'show_stock_count', '') not in ('true', 'false')) then
    raise exception 'invalid_stock' using errcode = 'P0001';
  end if;
  v_track := case when f ? 'track_stock' then coalesce((f ->> 'track_stock')::boolean, false) else coalesce(v_old_item.track_stock, false) end;
  v_low := case when f ? 'low_stock_threshold' then (f ->> 'low_stock_threshold')::integer else coalesce(v_old_item.low_stock_threshold, 3) end;
  v_show := case when f ? 'show_stock_count' then coalesce((f ->> 'show_stock_count')::boolean, false) else coalesce(v_old_item.show_stock_count, false) end;
  if f ? 'stock_count' and coalesce(f ->> 'stock_count', '') <> '' then
    if (f ->> 'stock_count') !~ '^\d{1,6}$' then raise exception 'invalid_stock' using errcode = 'P0001'; end if;
    v_count := (f ->> 'stock_count')::integer;
  elsif f ? 'stock_count' then
    v_count := null;
  else
    v_count := v_old_item.stock_count;
  end if;
  if v_low is null or v_low < 0 or v_low > 9999 then raise exception 'invalid_stock' using errcode = 'P0001'; end if;
  if v_track and v_count is null then raise exception 'invalid_stock' using errcode = 'P0001'; end if;
  if v_track then v_avail := 'available'; end if;

  if (f ? 'brand' and jsonb_typeof(f -> 'brand') not in ('string', 'null'))
     or (f ? 'short_description' and jsonb_typeof(f -> 'short_description') not in ('string', 'null'))
     or (f ? 'terms' and jsonb_typeof(f -> 'terms') not in ('string', 'null'))
     or (f ? 'pack_size' and jsonb_typeof(f -> 'pack_size') not in ('string', 'null'))
     or (f ? 'highlights' and jsonb_typeof(f -> 'highlights') not in ('array', 'null'))
     or (f ? 'specs' and jsonb_typeof(f -> 'specs') not in ('array', 'null'))
     or (f ? 'includes' and jsonb_typeof(f -> 'includes') not in ('array', 'null'))
     or (f ? 'variants' and jsonb_typeof(f -> 'variants') not in ('array', 'null')) then
    raise exception 'invalid_details' using errcode = 'P0001';
  end if;
  v_brand := case when f ? 'brand' then nullif(btrim(coalesce(f ->> 'brand', '')), '') else v_old_item.brand end;
  v_short := case when f ? 'short_description' then nullif(btrim(coalesce(f ->> 'short_description', '')), '') else v_old_item.short_description end;
  v_terms := case when f ? 'terms' then nullif(btrim(coalesce(f ->> 'terms', '')), '') else v_old_item.terms end;
  v_pack := case when f ? 'pack_size' then nullif(btrim(coalesce(f ->> 'pack_size', '')), '') else v_old_item.pack_size end;
  v_hl := case when f ? 'highlights' then coalesce(nullif(f -> 'highlights', 'null'::jsonb), '[]'::jsonb) else coalesce(v_old_item.highlights, '[]'::jsonb) end;
  v_specs := case when f ? 'specs' then coalesce(nullif(f -> 'specs', 'null'::jsonb), '[]'::jsonb) else coalesce(v_old_item.specs, '[]'::jsonb) end;
  if f ? 'specs' then
    select coalesce(jsonb_agg(
      case when jsonb_typeof(x.e) = 'object' and (not x.e ? 'group' or jsonb_typeof(x.e -> 'group') = 'null')
        then x.e || jsonb_build_object('group', 'Features & Specs') else x.e end
      order by x.n), '[]'::jsonb) into v_specs
      from jsonb_array_elements(v_specs) with ordinality as x(e, n);
  end if;
  if f ? 'highlights' then
    select coalesce(jsonb_agg(
      case when jsonb_typeof(x.e) = 'object' and (jsonb_typeof(x.e -> 'title') = 'null' or btrim(coalesce(x.e ->> 'title', 'x')) = '') then x.e - 'title' else x.e end
      order by x.n), '[]'::jsonb) into v_hl
      from jsonb_array_elements(v_hl) with ordinality as x(e, n);
  end if;
  if f ? 'includes' then
    if exists (select 1 from jsonb_array_elements(case when jsonb_typeof(f -> 'includes') = 'array' then f -> 'includes' else '[]'::jsonb end) e
               where jsonb_typeof(e) <> 'string') then
      raise exception 'invalid_details' using errcode = 'P0001';
    end if;
    select coalesce(array_agg(btrim(x.t) order by x.n), '{}') into v_inc
      from jsonb_array_elements_text(case when jsonb_typeof(f -> 'includes') = 'array' then f -> 'includes' else '[]'::jsonb end) with ordinality as x(t, n);
  else
    v_inc := coalesce(v_old_item.includes, '{}');
  end if;
  v_var := case when f ? 'variants' then coalesce(nullif(f -> 'variants', 'null'::jsonb), '[]'::jsonb) else case when jsonb_typeof(v_old_item.variants) = 'array' then v_old_item.variants else '[]'::jsonb end end;
  if f ? 'variants' and not public.item_variants_valid(v_var) then
    raise exception 'invalid_variants' using errcode = 'P0001';
  end if;
  if f ? 'variants' then
    select coalesce(jsonb_agg(
      case when jsonb_typeof(x.e) = 'object'
        then jsonb_build_object('id', x.e -> 'id', 'label', to_jsonb(btrim(coalesce(x.e ->> 'label', ''))), 'price', x.e -> 'price', 'stock', coalesce(x.e -> 'stock', 'null'::jsonb))
        else x.e end
      order by x.n), '[]'::jsonb) into v_var
      from jsonb_array_elements(v_var) with ordinality as x(e, n);
  end if;
  if not public.item_variants_valid(v_var) or (jsonb_array_length(v_var) > 0 and v_type not in ('fixed', 'from')) then
    raise exception 'invalid_variants' using errcode = 'P0001';
  end if;
  if char_length(coalesce(v_brand, '')) > 60 or char_length(coalesce(v_short, '')) > 140
     or char_length(coalesce(v_terms, '')) > 500 or char_length(coalesce(v_pack, '')) > 40
     or not public.item_highlights_valid(v_hl) or not public.item_specs_valid(v_specs) or not public.item_includes_valid(v_inc) then
    raise exception 'invalid_details' using errcode = 'P0001';
  end if;

  if v_type in ('fixed','from','range') then
    if coalesce(f ->> 'price', '') !~ c_money then raise exception 'invalid_price' using errcode = 'P0001'; end if;
    v_price := (f ->> 'price')::numeric;
    if v_type = 'range' then
      if coalesce(f ->> 'price_max', '') !~ c_money then raise exception 'invalid_price' using errcode = 'P0001'; end if;
      v_max := (f ->> 'price_max')::numeric;
      if v_max < v_price then raise exception 'invalid_price' using errcode = 'P0001'; end if;
    end if;
    if coalesce(f ->> 'sale_price', '') <> '' then
      if (f ->> 'sale_price') !~ c_money then raise exception 'invalid_price' using errcode = 'P0001'; end if;
      v_sale := (f ->> 'sale_price')::numeric;
      if v_sale >= v_price then raise exception 'invalid_price' using errcode = 'P0001'; end if;
    end if;
  end if;

  if p_id is null then
    select coalesce(max(sort), 0) + 1 into v_sort from public.items where business_id = v_id;
    insert into public.items (business_id, name, description, section, price_type, price, price_max, sale_price, unit, availability, track_stock, stock_count, low_stock_threshold, show_stock_count, visible, draft, sort,
      brand, short_description, highlights, specs, includes, terms, pack_size, variants)
    values (v_id, v_name, v_desc, v_section, v_type, v_price, v_max, v_sale, v_unit, v_avail, v_track, v_count, v_low, v_show, false, true, v_sort,
      v_brand, v_short, v_hl, v_specs, v_inc, v_terms, v_pack, v_var)
    returning id into v_new;
    perform public.item_options_apply(v_new, v_id, f);   -- 0086
    return v_new;
  end if;

  select * into v_old from public.items i where i.id = p_id and i.business_id = v_id and not i.removed_by_admin for update;
  if not found then raise exception 'item_not_found' using errcode = 'P0001'; end if;

  if (v_old.price, v_old.price_max, v_old.price_type, v_old.sale_price) is distinct from (v_price, v_max, v_type, v_sale)
     and exists (select 1 from public.flash_sales s where s.item_id = p_id and s.status in ('scheduled','live')) then
    raise exception 'item_in_flash_sale' using errcode = 'P0001';
  end if;

  if v_var is distinct from (case when jsonb_typeof(v_old.variants) = 'array' then v_old.variants else '[]'::jsonb end)
     and exists (select 1 from public.flash_sales s where s.item_id = p_id and s.status in ('scheduled','live')) then
    raise exception 'item_in_flash_sale' using errcode = 'P0001';
  end if;

  update public.items set
    name = v_name, description = v_desc, section = v_section, price_type = v_type, price = v_price, price_max = v_max,
    sale_price = v_sale, unit = v_unit, availability = v_avail,
    track_stock = v_track, stock_count = v_count, low_stock_threshold = v_low, show_stock_count = v_show,
    brand = v_brand, short_description = v_short, highlights = v_hl, specs = v_specs, includes = v_inc, terms = v_terms, pack_size = v_pack, variants = v_var
  where id = p_id;
  perform public.item_options_apply(p_id, v_id, f);   -- 0086
  return p_id;
end $$;

create or replace function public.seller_duplicate_item(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_src public.items;
  v_new uuid;
begin
  perform public.assert_seller_active();
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select * into v_src from public.items where id = p_id and business_id = v_id and not removed_by_admin;
  if not found then raise exception 'item_not_found' using errcode = 'P0001'; end if;
  insert into public.items (business_id, name, description, section, price, price_max, price_type, unit, sale_price, availability, stock_count,
    track_stock, low_stock_threshold, show_stock_count, season, tags, badge, variants, visible, draft, sort,
    brand, short_description, highlights, specs, includes, terms, pack_size, option_axes, size_chart_id, size_chart_override)
  values (v_id, left(v_src.name, 111) || ' (copy)', v_src.description, v_src.section, v_src.price, v_src.price_max, v_src.price_type, v_src.unit,
    v_src.sale_price, v_src.availability, v_src.stock_count, v_src.track_stock, v_src.low_stock_threshold, v_src.show_stock_count, v_src.season,
    v_src.tags, v_src.badge, v_src.variants, false, true, v_src.sort + 1,
    v_src.brand, v_src.short_description, v_src.highlights, v_src.specs, v_src.includes, v_src.terms, v_src.pack_size,
    public.item_option_axes_for_copy(v_src.option_axes), v_src.size_chart_id, v_src.size_chart_override)   -- 0086
  returning id into v_new;
  -- 0086: variants are copied with their media ids parked in copy_media_ids; item_remap_copied_media resolves them after the files are copied.
  insert into public.item_variants (item_id, business_id, combo_key, choice, price, sale_price, stock_count, status, sku, media_ids, copy_media_ids, sort)
  select v_new, v_id, s.combo_key, s.choice, s.price, s.sale_price, s.stock_count, s.status, s.sku, '{}', case when cardinality(s.media_ids) > 0 then s.media_ids else s.copy_media_ids end, s.sort
    from public.item_variants s where s.item_id = p_id;
  return v_new;
end $$;

create or replace function public.seller_bulk_items(p_action text, p_ids uuid[], p_args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_ids uuid[];
  v_n integer := 0;
  v_skipped integer := 0;
  v_tenths integer;
  v_section text;
  v_avail text;
  v_blocked integer := 0;
begin
  perform public.assert_seller_active();
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('hide','show','delete','move_section','set_availability','price_percent','confirm_prices') then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'no_items' using errcode = 'P0001'; end if;
  if cardinality(p_ids) > 500 then raise exception 'too_many_items' using errcode = 'P0001'; end if;

  perform 1 from public.items i where i.business_id = v_id and i.id = any (p_ids) and not i.removed_by_admin order by i.id for update;
  select coalesce(array_agg(i.id order by i.id), '{}') into v_ids
    from public.items i
    where i.business_id = v_id and i.id = any (p_ids) and not i.removed_by_admin;
  v_skipped := cardinality(p_ids) - cardinality(v_ids);

  if p_action = 'hide' then
    update public.items set visible = false where id = any (v_ids) and visible;
    get diagnostics v_n = row_count;
  elsif p_action = 'show' then
    update public.items set visible = true, draft = false where id = any (v_ids) and (not visible or draft);
    get diagnostics v_n = row_count;
  elsif p_action = 'delete' then
    delete from public.items where id = any (v_ids);
    get diagnostics v_n = row_count;
  elsif p_action = 'move_section' then
    v_section := nullif(btrim(coalesce(p_args ->> 'section', '')), '');
    if v_section is not null and char_length(v_section) > 60 then raise exception 'invalid_section' using errcode = 'P0001'; end if;
    update public.items set section = v_section where id = any (v_ids) and section is distinct from v_section;
    get diagnostics v_n = row_count;
  elsif p_action = 'set_availability' then
    v_avail := p_args ->> 'availability';
    if v_avail is null or v_avail not in ('available','limited_stock','out_of_stock','unavailable','by_appointment') then
      raise exception 'invalid_availability' using errcode = 'P0001';
    end if;
    -- A counted item takes its availability from its count, so a status alone cannot relist it: with no stock in hand it
    -- would flip straight back out. Those are skipped, and the seller is told to give them a count (Back in stock).
    select count(*) into v_blocked from public.items i
      where i.id = any (v_ids) and i.track_stock and v_avail in ('available','limited_stock') and coalesce(i.stock_count, 0) <= 0;
    update public.items set
      availability = v_avail,
      stock_count = case when track_stock and v_avail in ('out_of_stock','unavailable') then 0 else stock_count end
    where id = any (v_ids) and availability <> v_avail
      and not (track_stock and v_avail in ('available','limited_stock') and coalesce(stock_count, 0) <= 0);
    get diagnostics v_n = row_count;
    v_skipped := v_skipped + v_blocked;
  elsif p_action = 'price_percent' then
    begin
      v_tenths := round((p_args ->> 'percent')::numeric * 10)::integer;
    exception when others then
      raise exception 'invalid_percent' using errcode = 'P0001';
    end;
    if v_tenths = 0 or v_tenths < -900 or v_tenths > 3000 then raise exception 'invalid_percent' using errcode = 'P0001'; end if;
    if exists (
      select 1 from public.items i
      where i.id = any (v_ids) and i.price_type in ('fixed','from','range') and not exists (select 1 from public.flash_sales s where s.item_id = i.id and s.status in ('scheduled','live'))
        and greatest(public.seller_scale_price(i.price, v_tenths), coalesce(public.seller_scale_price(i.price_max, v_tenths), 0)) > 9999999999.99
    ) then raise exception 'price_too_large' using errcode = 'P0001'; end if;
    -- 0086: variant prices follow the item's percent change, for the same items.
    if exists (
      select 1 from public.item_variants x join public.items i on i.id = x.item_id
      where i.id = any (v_ids) and i.price_type in ('fixed','from','range') and x.price is not null and not exists (select 1 from public.flash_sales s where s.item_id = i.id and s.status in ('scheduled','live'))
        and public.seller_scale_price(x.price, v_tenths) > 9999999999.99
    ) then raise exception 'price_too_large' using errcode = 'P0001'; end if;
    update public.items i set
      price = public.seller_scale_price(i.price, v_tenths),
      price_max = public.seller_scale_price(i.price_max, v_tenths),
      sale_price = case
        when i.sale_price is null then null
        when public.seller_scale_price(i.sale_price, v_tenths) < public.seller_scale_price(i.price, v_tenths) then public.seller_scale_price(i.sale_price, v_tenths)
        when public.seller_scale_price(i.price, v_tenths) > 1 then public.seller_scale_price(i.price, v_tenths) - 1
        else null end
    where i.id = any (v_ids) and i.price_type in ('fixed','from','range') and i.price is not null
      and not exists (select 1 from public.flash_sales s where s.item_id = i.id and s.status in ('scheduled','live'));
    get diagnostics v_n = row_count;
    v_skipped := v_skipped + (cardinality(v_ids) - v_n);
    update public.item_variants x set
      price = public.seller_scale_price(x.price, v_tenths),
      sale_price = case
        when x.sale_price is null then null
        when public.seller_scale_price(x.sale_price, v_tenths) < public.seller_scale_price(x.price, v_tenths) then public.seller_scale_price(x.sale_price, v_tenths)
        when public.seller_scale_price(x.price, v_tenths) > 1 then public.seller_scale_price(x.price, v_tenths) - 1
        else null end,
      updated_at = now()
    where x.item_id = any (v_ids) and x.price is not null
      and exists (select 1 from public.items i where i.id = x.item_id and i.price_type in ('fixed','from','range')
                  and not exists (select 1 from public.flash_sales s where s.item_id = i.id and s.status in ('scheduled','live')));   -- 0086
  else
    update public.items set price_confirmed_at = now() where id = any (v_ids);
    get diagnostics v_n = row_count;
  end if;

  perform public.write_audit(v_id, 'items_bulk_' || p_action, 'item', null, jsonb_build_object('count', v_n, 'skipped', v_skipped, 'args', coalesce(p_args, '{}')));
  return jsonb_build_object('affected', v_n, 'skipped', v_skipped);
end $$;

revoke all on function public.seller_save_item(uuid, jsonb), public.seller_duplicate_item(uuid), public.seller_bulk_items(text, uuid[], jsonb) from public, anon;
grant execute on function public.seller_save_item(uuid, jsonb), public.seller_duplicate_item(uuid), public.seller_bulk_items(text, uuid[], jsonb) to authenticated, service_role;

-- ======================================================================
-- 0091_departments_restrictions.sql
-- ======================================================================
-- 0091 (A08): departments as data, selling restrictions on product types, missing-type requests.
--
--   1. departments            Clothing, Shoes, Bags ... one row each (data, not code). Types point at one.
--   2. product_types          contract-shaped table (id, slug, name, kind, department_id, category_ids, restricted_to, quantity_mode, axes, spec_rows,
--                             size_chart_id). Seeded here ONLY with the five types this migration needs to be testable (the regulated three
--                             plus fragrance and stationery). TODO(contract:A06): A06 owns the full type list and must add the remaining types with
--                             `insert ... on conflict (id) do update`; every column below is created `if not exists` so A06 can add the rest.
--   3. restricted_to          shop CATEGORY ids (businesses.category_id). Empty = any shop may sell the type. A restriction naming a category that
--                             does not exist simply means nobody can sell the type (it fails closed).
--   4. items.product_type_id  nullable; null is "Other goods". Items that have no type are untouched.
--   5. enforcement            shop_can_sell_type() + a trigger on items (the guarantee, whoever writes the row) + seller_save_item, which now
--                             accepts `productTypeId` and checks it first so the seller gets a named error.
--                             seller_save_item(uuid, jsonb) is WRAPPED: the 0086 function is renamed seller_save_item_base (no direct grant) and
--                             called by the new wrapper, so none of its 170 lines is copied. seller_check_item (0088) calls seller_save_item and so
--                             checks types too, with nothing written.
--   6. type_requests          a seller who cannot find a type asks for one (seller_request_type) and still adds the item as Other goods.
--                             Admin side: admin_type_requests_list, admin_resolve_type_request.
--   7. seller_product_types   departments + the types THIS shop may sell. TODO(contract:A06): A06 may replace the body; keep the shape
--                             { departments: [{id, name}], types: [ProductType] } and keep leaving out types the shop may not sell.
--
-- Nothing already applied is edited. Old items (no type) behave exactly as before.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Departments
-- ---------------------------------------------------------------------------------------------------------------------

create table if not exists public.departments (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(id) <= 40),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.departments enable row level security;
drop policy if exists "departments are public" on public.departments;
create policy "departments are public" on public.departments for select to anon, authenticated using (active);
grant select on public.departments to anon, authenticated;
grant all on public.departments to service_role;

insert into public.departments (id, name, sort) values
  ('clothing',            'Clothing',                  10),
  ('shoes',               'Shoes',                     20),
  ('bags',                'Bags',                      30),
  ('jewellery',           'Jewellery',                 40),
  ('fragrance',           'Fragrance',                 50),
  ('phones',              'Phones',                    60),
  ('computers',           'Computers',                 70),
  ('cables-power',        'Cables and power',          80),
  ('lighting',            'Lighting',                  90),
  ('batteries',           'Batteries',                100),
  ('printers-ink',        'Printers and ink',         110),
  ('printing-services',   'Printing services',        120),
  ('stationery',          'Stationery',               130),
  -- the rest of the live shop categories (client/src/data/categories.js groups), so no live category has nowhere to sell
  ('water-energy',        'Water and energy',         200),
  ('food-drink',          'Food and drink',           210),
  ('medicine-health',     'Medicine and health',      220),
  ('eyewear',             'Eyewear',                  230),
  ('beauty-personal-care','Beauty and personal care', 240),
  ('fitness',             'Fitness',                  250),
  ('farm-inputs',         'Farm inputs and vet',      260),
  ('electronics',         'Electronics and appliances',270),
  ('hardware-building',   'Hardware and building',    280),
  ('plumbing-electrical', 'Plumbing and electrical',  290),
  ('furniture',           'Furniture',                300),
  ('home-kitchen',        'Home and kitchen',         310),
  ('cleaning-laundry',    'Cleaning and laundry',     320),
  ('auto-parts',          'Auto parts and garage',    330),
  ('education',           'Education and childcare',  340),
  ('photography-events',  'Photography and events',   350)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2 + 3. Product types (contract-shaped) and restricted_to
-- ---------------------------------------------------------------------------------------------------------------------

create table if not exists public.product_types (id text primary key);
alter table public.product_types add column if not exists slug text;
alter table public.product_types add column if not exists name text;
alter table public.product_types add column if not exists kind text not null default 'good';
alter table public.product_types add column if not exists department_id text references public.departments (id);
alter table public.product_types add column if not exists category_ids text[] not null default '{}';
alter table public.product_types add column if not exists restricted_to text[] not null default '{}';
alter table public.product_types add column if not exists quantity_mode text not null default 'units';
alter table public.product_types add column if not exists axes jsonb not null default '[]'::jsonb;
alter table public.product_types add column if not exists spec_rows jsonb not null default '[]'::jsonb;
alter table public.product_types add column if not exists size_chart_id uuid;
alter table public.product_types add column if not exists active boolean not null default true;
alter table public.product_types add column if not exists created_at timestamptz not null default now();

alter table public.product_types drop constraint if exists product_types_kind_ok;
alter table public.product_types add constraint product_types_kind_ok check (kind in ('good', 'service', 'package'));
alter table public.product_types drop constraint if exists product_types_quantity_mode_ok;
alter table public.product_types add constraint product_types_quantity_mode_ok check (quantity_mode in ('units', 'measure', 'none'));
alter table public.product_types drop constraint if exists product_types_restricted_ok;
-- no empty strings, no nulls inside the list
alter table public.product_types add constraint product_types_restricted_ok check (array_position(restricted_to, null) is null and array_position(restricted_to, '') is null);
alter table public.product_types drop constraint if exists product_types_axes_max;
alter table public.product_types add constraint product_types_axes_max check (jsonb_typeof(axes) = 'array' and jsonb_array_length(axes) <= 3);
alter table public.product_types drop constraint if exists product_types_spec_rows_shape;
alter table public.product_types add constraint product_types_spec_rows_shape check (jsonb_typeof(spec_rows) = 'array');
create unique index if not exists product_types_slug_uq on public.product_types (slug) where slug is not null;

alter table public.product_types enable row level security;
drop policy if exists "product types are public" on public.product_types;
create policy "product types are public" on public.product_types for select to anon, authenticated using (active);
grant select on public.product_types to anon, authenticated;
grant all on public.product_types to service_role;

-- Seed. TODO(contract:A06): the full list is A06's. These five make restrictions testable and match shared/src/types/restrictions.js.
insert into public.product_types (id, slug, name, kind, department_id, category_ids, restricted_to, quantity_mode) values
  ('prescription-medicine', 'prescription-medicine', 'Prescription medicine', 'good', 'medicine-health', '{chemist}',  '{chemist}', 'units'),
  ('vet-medicine',          'vet-medicine',          'Veterinary medicine',   'good', 'farm-inputs',     '{agrovet}',  '{agrovet}', 'units'),
  ('agrochemicals',         'agrochemicals',         'Agrochemicals',         'good', 'farm-inputs',     '{agrovet}',  '{agrovet}', 'units'),
  ('fragrance',             'fragrance',             'Fragrance',             'good', 'fragrance',       '{salon-beauty,fashion-boutiques,tailor-boutique,supermarket-minimart}', '{}', 'units'),
  ('stationery',            'stationery',            'Stationery',            'good', 'stationery',      '{printing-stationery,electronics-computers,supermarket-minimart}',      '{}', 'units')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4 + 5. items.product_type_id and enforcement
-- ---------------------------------------------------------------------------------------------------------------------

alter table public.items add column if not exists product_type_id text references public.product_types (id);
create index if not exists items_product_type_idx on public.items (product_type_id) where product_type_id is not null;

-- May this shop sell this type? Unknown type, unknown shop, inactive type: no. Empty restricted_to: any shop.
create or replace function public.shop_can_sell_type(p_business uuid, p_type text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select cardinality(t.restricted_to) = 0 or b.category_id = any (t.restricted_to)
      from public.product_types t, public.businesses b
     where t.id = p_type and t.active and b.id = p_business), false)
$$;
revoke all on function public.shop_can_sell_type(uuid, text) from public, anon;
grant execute on function public.shop_can_sell_type(uuid, text) to authenticated, service_role;

-- The guarantee: whichever function (or import, or admin tool) writes the row, a restricted type cannot be put on a shop that may not sell it.
-- Fires only when the type is set or changed, so editing an existing item never trips it.
create or replace function public.items_product_type_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.product_type_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.product_type_id is not distinct from old.product_type_id then return new; end if;
  if not exists (select 1 from public.product_types t where t.id = new.product_type_id and t.active) then
    raise exception 'unknown_product_type' using errcode = 'P0001';
  end if;
  if not public.shop_can_sell_type(new.business_id, new.product_type_id) then
    raise exception 'type_not_allowed' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists items_product_type_guard on public.items;
create trigger items_product_type_guard before insert or update of product_type_id on public.items
  for each row execute function public.items_product_type_guard();

-- Wrap seller_save_item. The 0086 text becomes seller_save_item_base (callable only through the wrapper).
do $$ begin
  if to_regprocedure('public.seller_save_item_base(uuid, jsonb)') is null then
    alter function public.seller_save_item(uuid, jsonb) rename to seller_save_item_base;
  end if;
end $$;
revoke all on function public.seller_save_item_base(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.seller_save_item_base(uuid, jsonb) to service_role;

create or replace function public.seller_save_item(p_id uuid, p_fields jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  f jsonb := coalesce(p_fields, '{}'::jsonb);
  v_biz uuid := public.my_business_id();
  v_has boolean := f ? 'productTypeId';
  v_type text;
  v_id uuid;
begin
  perform public.assert_seller_active();
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;

  -- productTypeId: absent = leave the item's type alone; null = Other goods; text = a type this shop may sell.
  if v_has then
    if jsonb_typeof(f -> 'productTypeId') not in ('string', 'null') then raise exception 'invalid_product_type' using errcode = 'P0001'; end if;
    v_type := nullif(btrim(coalesce(f ->> 'productTypeId', '')), '');
    if v_type is not null then
      if not exists (select 1 from public.product_types t where t.id = v_type and t.active) then
        raise exception 'unknown_product_type' using errcode = 'P0001';
      end if;
      if not public.shop_can_sell_type(v_biz, v_type) then raise exception 'type_not_allowed' using errcode = 'P0001'; end if;
    end if;
  end if;

  v_id := public.seller_save_item_base(p_id, f - 'productTypeId');

  if v_has then
    update public.items set product_type_id = v_type where id = v_id and product_type_id is distinct from v_type;   -- the trigger checks again
  end if;
  return v_id;
end $$;
revoke all on function public.seller_save_item(uuid, jsonb) from public, anon;
grant execute on function public.seller_save_item(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. Missing-type requests
-- ---------------------------------------------------------------------------------------------------------------------

create table if not exists public.type_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'resolved', 'declined')),
  resolved_type_id text references public.product_types (id) on delete set null,
  admin_note text check (admin_note is null or char_length(admin_note) <= 500),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'pending') = (resolved_at is null))
);
-- One open request per shop per name (case and spacing do not matter).
create unique index if not exists type_requests_open_name_uq on public.type_requests (business_id, lower(name)) where status = 'pending';
create index if not exists type_requests_status_idx on public.type_requests (status, created_at);

alter table public.type_requests enable row level security;
drop policy if exists "seller reads own type_requests" on public.type_requests;
create policy "seller reads own type_requests" on public.type_requests for select to authenticated using (business_id = public.my_business_id());
drop policy if exists "admin reads type_requests" on public.type_requests;
create policy "admin reads type_requests" on public.type_requests for select to authenticated using (public.is_admin());
revoke all on public.type_requests from public, anon;
grant select on public.type_requests to authenticated;
grant all on public.type_requests to service_role;

create or replace function public.seller_request_type(p_name text, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_biz uuid := public.my_business_id();
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid;
begin
  perform public.assert_seller_active();
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if char_length(v_name) not between 2 and 80 then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  if char_length(coalesce(v_note, '')) > 500 then raise exception 'invalid_note' using errcode = 'P0001'; end if;

  -- asking twice for the same thing returns the open request instead of a second row
  select r.id into v_id from public.type_requests r where r.business_id = v_biz and lower(r.name) = lower(v_name) and r.status = 'pending';
  if found then return v_id; end if;

  if (select count(*) from public.type_requests r where r.business_id = v_biz and r.status = 'pending') >= 20 then
    raise exception 'too_many_type_requests' using errcode = 'P0001';
  end if;
  begin
    insert into public.type_requests (business_id, name, note) values (v_biz, v_name, v_note) returning id into v_id;
  exception when unique_violation then
    select r.id into v_id from public.type_requests r where r.business_id = v_biz and lower(r.name) = lower(v_name) and r.status = 'pending';
    return v_id;
  end;
  perform public.write_audit(v_biz, 'type_request', 'type_request', v_id::text, jsonb_build_object('name', v_name));
  return v_id;
end $$;
revoke all on function public.seller_request_type(text, text) from public, anon;
grant execute on function public.seller_request_type(text, text) to authenticated, service_role;

create or replace function public.admin_type_requests_list(p_status text default 'pending') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status is not null and p_status not in ('pending', 'resolved', 'declined', 'all') then raise exception 'invalid_status' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at, x.id)
      from (select r.id, r.name, r.note, r.status, r.created_at, r.resolved_at, r.resolved_type_id as "resolvedTypeId", r.admin_note as "adminNote",
                   b.id as "businessId", b.name as "businessName", b.seller_id as "sellerId", b.category_id as "categoryId",
                   (select count(*) from public.type_requests o
                     where o.id <> r.id and o.status = 'pending' and lower(o.name) = lower(r.name)) as "alsoAskedBy"
              from public.type_requests r join public.businesses b on b.id = r.business_id
             where coalesce(p_status, 'pending') = 'all' or r.status = coalesce(p_status, 'pending')) x), '[]'::jsonb);
end $$;
revoke all on function public.admin_type_requests_list(text) from public, anon;
grant execute on function public.admin_type_requests_list(text) to authenticated, service_role;

-- outcome 'resolved' (optionally naming the type that now covers it) or 'declined' (a note is required so the seller learns why).
create or replace function public.admin_resolve_type_request(p_id uuid, p_outcome text, p_type_id text default null, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old public.type_requests;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.has_role(array['owner', 'reviewer']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_outcome is null or p_outcome not in ('resolved', 'declined') then raise exception 'invalid_outcome' using errcode = 'P0001'; end if;
  if char_length(coalesce(v_note, '')) > 500 then raise exception 'invalid_note' using errcode = 'P0001'; end if;
  if p_outcome = 'declined' and v_note is null then raise exception 'note_required' using errcode = 'P0001'; end if;
  if p_outcome = 'declined' and p_type_id is not null then raise exception 'invalid_outcome' using errcode = 'P0001'; end if;
  if p_type_id is not null and not exists (select 1 from public.product_types t where t.id = p_type_id and t.active) then
    raise exception 'unknown_product_type' using errcode = 'P0001';
  end if;
  select * into v_old from public.type_requests where id = p_id for update;
  if not found then raise exception 'type_request_not_found' using errcode = 'P0001'; end if;
  if v_old.status <> 'pending' then raise exception 'type_request_closed' using errcode = 'P0001'; end if;
  update public.type_requests set status = p_outcome, resolved_type_id = p_type_id, admin_note = v_note, resolved_by = auth.uid(), resolved_at = now() where id = p_id;
  perform public.admin_audit_action('type_request.' || p_outcome, 'type_request', p_id::text, jsonb_build_object('status', v_old.status, 'name', v_old.name),
    jsonb_build_object('status', p_outcome, 'typeId', p_type_id), v_note, v_old.business_id);
end $$;
revoke all on function public.admin_resolve_type_request(uuid, text, text, text) from public, anon;
grant execute on function public.admin_resolve_type_request(uuid, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 7. seller_product_types: departments and the types this shop may sell (restricted types the shop may not sell are left out)
-- ---------------------------------------------------------------------------------------------------------------------

create or replace function public.seller_product_types() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_biz uuid := public.my_business_id();
begin
  perform public.assert_seller_active();   -- repo rule: every plpgsql seller_* function refuses a suspended seller (conversations.test.mjs)
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  return jsonb_build_object(
    'departments', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by d.sort, d.id) from public.departments d where d.active), '[]'::jsonb),
    'types', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', t.id, 'slug', t.slug, 'name', t.name, 'kind', t.kind, 'departmentId', t.department_id, 'categoryIds', to_jsonb(t.category_ids),
                           'quantityMode', t.quantity_mode, 'axes', t.axes, 'specRows', t.spec_rows)
          || case when cardinality(t.restricted_to) > 0 then jsonb_build_object('restrictedTo', to_jsonb(t.restricted_to)) else '{}'::jsonb end
          || case when t.size_chart_id is not null then jsonb_build_object('sizeChartId', t.size_chart_id) else '{}'::jsonb end
        order by t.name, t.id)
      from public.product_types t where t.active and public.shop_can_sell_type(v_biz, t.id)), '[]'::jsonb));
end $$;
revoke all on function public.seller_product_types() from public, anon;
grant execute on function public.seller_product_types() to authenticated, service_role;

-- ======================================================================
-- 0093_size_chart_types_shoe_conversion.sql
-- ======================================================================
-- A05: size charts attach to product types, and the shoe conversion chart becomes admin-editable data.
--
-- What A04 (0086) already gave: size_charts (library owned by admin), public_size_charts, admin_save_size_chart / admin_delete_size_chart /
-- admin_size_charts_list, items.size_chart_id and items.size_chart_override. What A08 (0091) gave: product_types with size_chart_id (the contract's
-- ProductType.sizeChartId; seller_product_types already returns it). This migration changes nothing that exists except where said:
--   * product_types.size_chart_id   gets its foreign key to size_charts (on delete restrict). A type has ONE default chart (the contract); an item can
--                                   still choose any chart (items.size_chart_id) and override its rows (items.size_chart_override).
--   * public_size_charts            gains product_type_ids (appended), worked out from product_types.size_chart_id. Existing readers are unaffected.
--   * admin_size_charts_list        gains product_type_ids the same way.
--   * admin_save_size_chart         accepts product_type_ids: it points those types at the chart (a type moves from its old chart) and releases types
--                                   that are no longer listed. An absent key changes nothing; null or [] releases every type. New error invalid_type_ids
--                                   (a type that does not exist, a repeat, or more than 20).
--   * admin_delete_size_chart       also refuses a chart that a type uses (size_chart_in_use), as it already refused one that items use.
--   * size_charts_for_type(type, category)  public read: the type's chart; when the type has none, the category's charts that no type uses.
--   * attach_default_size_charts()  points the types dress and shirt at the seeded charts when they have none (service role; safe to repeat).
--                                   Called here, and A06 calls it again after it seeds its types.
--   * shoe_conversion               ONE row, the shoe conversion chart: {adult: [{eu, uk, usM, usW, cm}], kids: [{eu, uk: null, usM: null, usW: null, cm}]}
--                                   (the shape of shared/src/scales/shoeChart.js, so A02's shoe scale reads it as it is). Only the rows are stored; the
--                                   systems and widths are fixed in code. A version number rises with every save.
--   * public_shoe_conversion        public read of the chart and its version.
--   * admin_save_shoe_conversion(chart) -> version   owner only, validated, audited. Edits do not change items: a size is stored as typed.
--   * Seeds: dress and tops (cm), shirt collar, men's shoes, women's shoes, kids clothes (age), and the default shoe conversion chart.
-- Errors (P0001): invalid_type_ids, invalid_shoe_chart, size_chart_in_use. forbidden (42501) for anyone but an owner.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Charts by product type (the link lives on product_types.size_chart_id)
-- ---------------------------------------------------------------------------------------------------------------------

alter table public.product_types drop constraint if exists product_types_size_chart_fk;
alter table public.product_types add constraint product_types_size_chart_fk foreign key (size_chart_id) references public.size_charts (id) on delete restrict;
create index if not exists product_types_size_chart_idx on public.product_types (size_chart_id) where size_chart_id is not null;

create or replace view public.public_size_charts with (security_barrier = true) as
select c.id, c.name, c.category, c.unit, c.columns, c.rows,
       coalesce((select array_agg(t.id order by t.id) from public.product_types t where t.size_chart_id = c.id and t.active), '{}'::text[]) as product_type_ids
  from public.size_charts c where c.active;
revoke all on public.public_size_charts from public;
grant select on public.public_size_charts to anon, authenticated, service_role;

create or replace function public.admin_size_charts_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.category nulls last, x.name)
    from (select c.id, c.name, c.category, c.unit, c.columns, c.rows, c.active, c.updated_at,
                 coalesce((select array_agg(t.id order by t.id) from public.product_types t where t.size_chart_id = c.id), '{}'::text[]) as product_type_ids,
                 (select count(*) from public.items i where i.size_chart_id = c.id) as items_using
            from public.size_charts c) x), '[]'::jsonb);
end $$;

create or replace function public.admin_save_size_chart(p_id uuid, p_fields jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  f jsonb := coalesce(p_fields, '{}'::jsonb);
  v_name text := btrim(coalesce(f ->> 'name', ''));
  v_category text := nullif(btrim(coalesce(f ->> 'category', '')), '');
  v_unit text := coalesce(f ->> 'unit', 'cm');
  v_active boolean := coalesce((f ->> 'active')::boolean, true);
  v_has_types boolean := f ? 'product_type_ids';
  v_types text[] := '{}';
  v_old public.size_charts;
  v_id uuid;
begin
  if not public.has_role(array['owner']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(v_name) not between 2 and 80 then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  if v_unit not in ('cm', 'in', 'mm', 'kg', 'lb', 'none') then raise exception 'invalid_unit' using errcode = 'P0001'; end if;
  if v_category is not null and not exists (select 1 from public.categories c where c.id = v_category) then raise exception 'invalid_category' using errcode = 'P0001'; end if;
  if not public.size_chart_columns_valid(f -> 'columns') or not public.size_chart_rows_valid(f -> 'rows', jsonb_array_length(f -> 'columns')) then
    raise exception 'invalid_chart' using errcode = 'P0001';
  end if;
  if v_has_types and jsonb_typeof(f -> 'product_type_ids') <> 'null' then
    if jsonb_typeof(f -> 'product_type_ids') <> 'array'
       or jsonb_array_length(f -> 'product_type_ids') > 20
       or exists (select 1 from jsonb_array_elements(f -> 'product_type_ids') e where jsonb_typeof(e) <> 'string') then
      raise exception 'invalid_type_ids' using errcode = 'P0001';
    end if;
    select coalesce(array_agg(t), '{}') into v_types from jsonb_array_elements_text(f -> 'product_type_ids') t;
    if cardinality(v_types) <> (select count(distinct t) from unnest(v_types) t)
       or exists (select 1 from unnest(v_types) t where not exists (select 1 from public.product_types pt where pt.id = t)) then
      raise exception 'invalid_type_ids' using errcode = 'P0001';
    end if;
  end if;
  begin
    if p_id is null then
      insert into public.size_charts (name, category, unit, columns, rows, active)
        values (v_name, v_category, v_unit, f -> 'columns', f -> 'rows', v_active) returning id into v_id;
      perform public.admin_audit_action('size_chart.create', 'size_chart', v_id::text, null, jsonb_build_object('name', v_name, 'category', v_category, 'product_type_ids', v_types), null, null);
    else
      select * into v_old from public.size_charts where id = p_id for update;
      if not found then raise exception 'chart_not_found' using errcode = 'P0001'; end if;
      update public.size_charts set name = v_name, category = v_category, unit = v_unit, columns = f -> 'columns', rows = f -> 'rows', active = v_active, updated_at = now() where id = p_id;
      v_id := p_id;
      perform public.admin_audit_action('size_chart.update', 'size_chart', v_id::text,
        jsonb_build_object('name', v_old.name, 'active', v_old.active),
        jsonb_build_object('name', v_name, 'active', v_active, 'product_type_ids', case when v_has_types then to_jsonb(v_types) else null end), null, null);
    end if;
  exception when unique_violation then
    raise exception 'duplicate_chart' using errcode = 'P0001';
  end;
  if v_has_types then
    update public.product_types set size_chart_id = null where size_chart_id = v_id and not (id = any (v_types));
    update public.product_types set size_chart_id = v_id where id = any (v_types) and size_chart_id is distinct from v_id;
  end if;
  return v_id;
end $$;

create or replace function public.admin_delete_size_chart(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old public.size_charts;
begin
  if not public.has_role(array['owner']) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_old from public.size_charts where id = p_id for update;
  if not found then raise exception 'chart_not_found' using errcode = 'P0001'; end if;
  if exists (select 1 from public.items i where i.size_chart_id = p_id) or exists (select 1 from public.product_types t where t.size_chart_id = p_id) then
    raise exception 'size_chart_in_use' using errcode = 'P0001';
  end if;
  delete from public.size_charts where id = p_id;
  perform public.admin_audit_action('size_chart.delete', 'size_chart', p_id::text, jsonb_build_object('name', v_old.name), null, null, null);
end $$;
revoke all on function public.admin_size_charts_list(), public.admin_save_size_chart(uuid, jsonb), public.admin_delete_size_chart(uuid) from public, anon;
grant execute on function public.admin_size_charts_list(), public.admin_save_size_chart(uuid, jsonb), public.admin_delete_size_chart(uuid) to authenticated, service_role;

-- The charts a buyer can be shown for a product type: the type's own chart. When the type has none (or the chart is switched off), the charts of the
-- shop's category that no type uses.
create or replace function public.size_charts_for_type(p_type text, p_category text default null) returns jsonb
language sql stable set search_path = public as $$
  with own as (
    select c.* from public.public_size_charts c where c.id = (select t.size_chart_id from public.product_types t where t.id = p_type and t.active)
  ), picked as (
    select * from own
    union all
    select c.* from public.public_size_charts c
     where not exists (select 1 from own) and p_category is not null and c.category = p_category and cardinality(c.product_type_ids) = 0
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'category', x.category, 'unit', x.unit, 'columns', x.columns, 'rows', x.rows, 'product_type_ids', to_jsonb(x.product_type_ids)) order by x.name), '[]'::jsonb)
    from picked x
$$;
revoke all on function public.size_charts_for_type(text, text) from public;
grant execute on function public.size_charts_for_type(text, text) to anon, authenticated, service_role;

-- Default charts for the types that have none yet. A06 calls this after it seeds its types; it is safe to call again.
create or replace function public.attach_default_size_charts() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  update public.product_types t set size_chart_id = c.id
    from (values ('dress', 'Dresses and tops (cm)'), ('shirt', 'Shirt collar')) as m (type_id, chart_name)
    join public.size_charts c on c.category is null and lower(btrim(c.name)) = lower(m.chart_name)
   where t.id = m.type_id and t.size_chart_id is null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.attach_default_size_charts() from public, anon, authenticated;
grant execute on function public.attach_default_size_charts() to service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Shoe conversion chart (one row, admin-editable)
-- ---------------------------------------------------------------------------------------------------------------------

-- Rows of one set. adult: every size is needed. kids: EU and cm are needed, the other sizes may be null.
-- EU and cm rise row to row, and so does every other size that is filled in.
create or replace function public.shoe_chart_rows_valid(p jsonb, p_adult boolean) returns boolean
language plpgsql immutable parallel safe as $$
declare
  r jsonb;
  k text;
  v numeric;
  v_last jsonb := '{}'::jsonb;
  v_n integer;
begin
  if p is null or jsonb_typeof(p) <> 'array' then return false; end if;
  v_n := jsonb_array_length(p);
  if v_n > 60 or (p_adult and v_n < 2) then return false; end if;
  for r in select jsonb_array_elements(p) loop
    if jsonb_typeof(r) <> 'object' then return false; end if;
    if exists (select 1 from jsonb_object_keys(r) key where key not in ('eu', 'uk', 'usM', 'usW', 'cm')) then return false; end if;
    foreach k in array array['eu', 'uk', 'usM', 'usW', 'cm'] loop
      if not (r ? k) or jsonb_typeof(r -> k) = 'null' then
        if p_adult or k in ('eu', 'cm') then return false; end if;
        continue;
      end if;
      if jsonb_typeof(r -> k) <> 'number' then return false; end if;
      v := (r ->> k)::numeric;
      if k = 'eu' and v not between 10 and 60 then return false; end if;
      if k = 'cm' and v not between 8 and 40 then return false; end if;
      if k in ('uk', 'usM', 'usW') and v not between 0 and 25 then return false; end if;
      if v_last ? k and v <= (v_last ->> k)::numeric then return false; end if;
      v_last := v_last || jsonb_build_object(k, v);
    end loop;
  end loop;
  return true;
end $$;

create or replace function public.shoe_chart_valid(p jsonb) returns boolean
language plpgsql immutable parallel safe as $$
declare
  v_kids_cm numeric;
  v_kids_eu numeric;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  if exists (select 1 from jsonb_object_keys(p) key where key not in ('adult', 'kids')) then return false; end if;
  if not public.shoe_chart_rows_valid(p -> 'adult', true) or not public.shoe_chart_rows_valid(coalesce(p -> 'kids', '[]'::jsonb), false) then return false; end if;
  if jsonb_array_length(coalesce(p -> 'kids', '[]'::jsonb)) > 0 then
    v_kids_cm := (p -> 'kids' -> (jsonb_array_length(p -> 'kids') - 1) ->> 'cm')::numeric;
    v_kids_eu := (p -> 'kids' -> (jsonb_array_length(p -> 'kids') - 1) ->> 'eu')::numeric;
    if v_kids_cm >= (p -> 'adult' -> 0 ->> 'cm')::numeric or v_kids_eu >= (p -> 'adult' -> 0 ->> 'eu')::numeric then return false; end if;
  end if;
  return true;
end $$;
revoke all on function public.shoe_chart_rows_valid(jsonb, boolean), public.shoe_chart_valid(jsonb) from public;
grant execute on function public.shoe_chart_rows_valid(jsonb, boolean), public.shoe_chart_valid(jsonb) to anon, authenticated, service_role;

create table if not exists public.shoe_conversion (
  id text primary key default 'default' check (id = 'default'),
  chart jsonb not null check (public.shoe_chart_valid(chart)),
  version integer not null default 1 check (version >= 1),
  updated_at timestamptz not null default now()
);
alter table public.shoe_conversion enable row level security;
drop policy if exists "admin reads shoe_conversion" on public.shoe_conversion;
create policy "admin reads shoe_conversion" on public.shoe_conversion for select to authenticated using (public.is_admin());
revoke all on public.shoe_conversion from public, anon, authenticated;
grant select on public.shoe_conversion to authenticated;
grant all on public.shoe_conversion to service_role;

create or replace view public.public_shoe_conversion with (security_barrier = true) as
select s.chart, s.version, s.updated_at from public.shoe_conversion s where s.id = 'default';
revoke all on public.public_shoe_conversion from public;
grant select on public.public_shoe_conversion to anon, authenticated, service_role;

create or replace function public.admin_save_shoe_conversion(p_chart jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_old public.shoe_conversion;
  v_version integer;
begin
  if not public.has_role(array['owner']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not public.shoe_chart_valid(p_chart) then raise exception 'invalid_shoe_chart' using errcode = 'P0001'; end if;
  select * into v_old from public.shoe_conversion where id = 'default' for update;
  if not found then
    insert into public.shoe_conversion (id, chart) values ('default', p_chart) returning version into v_version;
    perform public.admin_audit_action('shoe_conversion.create', 'shoe_conversion', 'default', null, jsonb_build_object('version', v_version), null, null);
  else
    update public.shoe_conversion set chart = p_chart, version = v_old.version + 1, updated_at = now() where id = 'default' returning version into v_version;
    perform public.admin_audit_action('shoe_conversion.update', 'shoe_conversion', 'default', jsonb_build_object('version', v_old.version), jsonb_build_object('version', v_version), null, null);
  end if;
  return v_version;
end $$;
revoke all on function public.admin_save_shoe_conversion(jsonb) from public, anon;
grant execute on function public.admin_save_shoe_conversion(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Seeds (shared/src/sizeCharts.js SEED_SIZE_CHARTS and shared/src/scales/shoeChart.js; a test keeps them equal)
-- ---------------------------------------------------------------------------------------------------------------------

insert into public.shoe_conversion (id, chart) values ('default', $j${"adult":[{"eu":35,"uk":2.5,"usM":3.5,"usW":4.5,"cm":22.1},{"eu":36,"uk":3.5,"usM":4.5,"usW":5.5,"cm":22.7},{"eu":37,"uk":4,"usM":5,"usW":6,"cm":23.4},{"eu":38,"uk":5,"usM":6,"usW":7,"cm":24.1},{"eu":39,"uk":6,"usM":7,"usW":8,"cm":24.7},{"eu":40,"uk":6.5,"usM":7.5,"usW":8.5,"cm":25.4},{"eu":41,"uk":7.5,"usM":8.5,"usW":9.5,"cm":26.1},{"eu":42,"uk":8,"usM":9,"usW":10,"cm":26.7},{"eu":43,"uk":9,"usM":10,"usW":11,"cm":27.4},{"eu":44,"uk":9.5,"usM":10.5,"usW":11.5,"cm":28.1},{"eu":45,"uk":10.5,"usM":11.5,"usW":12.5,"cm":28.7},{"eu":46,"uk":11,"usM":12,"usW":13,"cm":29.4},{"eu":47,"uk":12,"usM":13,"usW":14,"cm":30.1},{"eu":48,"uk":12.5,"usM":13.5,"usW":14.5,"cm":30.7}],"kids":[{"eu":19,"uk":null,"usM":null,"usW":null,"cm":11.4},{"eu":20,"uk":null,"usM":null,"usW":null,"cm":12.1},{"eu":21,"uk":null,"usM":null,"usW":null,"cm":12.7},{"eu":22,"uk":null,"usM":null,"usW":null,"cm":13.4},{"eu":23,"uk":null,"usM":null,"usW":null,"cm":14.1},{"eu":24,"uk":null,"usM":null,"usW":null,"cm":14.7},{"eu":25,"uk":null,"usM":null,"usW":null,"cm":15.4},{"eu":26,"uk":null,"usM":null,"usW":null,"cm":16.1},{"eu":27,"uk":null,"usM":null,"usW":null,"cm":16.7},{"eu":28,"uk":null,"usM":null,"usW":null,"cm":17.4},{"eu":29,"uk":null,"usM":null,"usW":null,"cm":18.1},{"eu":30,"uk":null,"usM":null,"usW":null,"cm":18.7},{"eu":31,"uk":null,"usM":null,"usW":null,"cm":19.4},{"eu":32,"uk":null,"usM":null,"usW":null,"cm":20.1},{"eu":33,"uk":null,"usM":null,"usW":null,"cm":20.7},{"eu":34,"uk":null,"usM":null,"usW":null,"cm":21.4}]}$j$::jsonb) on conflict do nothing;

insert into public.size_charts (name, category, unit, columns, rows)
values ('Dresses and tops (cm)', null, 'cm', $j$["Size","Bust","Waist","Hip"]$j$::jsonb, $j$[["XS","80","62","88"],["S","84","66","92"],["M","90","72","98"],["L","96","78","104"],["XL","102","84","110"]]$j$::jsonb)
on conflict do nothing;
insert into public.size_charts (name, category, unit, columns, rows)
values ('Shirt collar', null, 'in', $j$["Collar (in)","Collar (cm)","Shirt size"]$j$::jsonb, $j$[["14","35.6","S"],["14.5","36.8","S"],["15","38.1","M"],["15.5","39.4","M"],["16","40.6","L"],["16.5","41.9","L"],["17","43.2","XL"],["17.5","44.5","XL"],["18","45.7","2XL"]]$j$::jsonb)
on conflict do nothing;
insert into public.size_charts (name, category, unit, columns, rows)
values ('Men''s shoes', null, 'cm', $j$["EU","UK","US men","Foot length (cm)"]$j$::jsonb, $j$[["35","2.5","3.5","22.1"],["36","3.5","4.5","22.7"],["37","4","5","23.4"],["38","5","6","24.1"],["39","6","7","24.7"],["40","6.5","7.5","25.4"],["41","7.5","8.5","26.1"],["42","8","9","26.7"],["43","9","10","27.4"],["44","9.5","10.5","28.1"],["45","10.5","11.5","28.7"],["46","11","12","29.4"],["47","12","13","30.1"],["48","12.5","13.5","30.7"]]$j$::jsonb)
on conflict do nothing;
insert into public.size_charts (name, category, unit, columns, rows)
values ('Women''s shoes', null, 'cm', $j$["EU","UK","US women","Foot length (cm)"]$j$::jsonb, $j$[["35","2.5","4.5","22.1"],["36","3.5","5.5","22.7"],["37","4","6","23.4"],["38","5","7","24.1"],["39","6","8","24.7"],["40","6.5","8.5","25.4"],["41","7.5","9.5","26.1"],["42","8","10","26.7"],["43","9","11","27.4"],["44","9.5","11.5","28.1"],["45","10.5","12.5","28.7"],["46","11","13","29.4"],["47","12","14","30.1"],["48","12.5","14.5","30.7"]]$j$::jsonb)
on conflict do nothing;
insert into public.size_charts (name, category, unit, columns, rows)
values ('Kids clothes (age)', null, 'cm', $j$["Age","Height","Chest","Waist"]$j$::jsonb, $j$[["2-3 years","98","53","52"],["3-4 years","104","55","53"],["4-5 years","110","57","54"],["5-6 years","116","60","55"],["6-7 years","122","63","56"],["7-8 years","128","66","58"],["8-9 years","134","69","59"],["9-10 years","140","72","61"]]$j$::jsonb)
on conflict do nothing;

select public.attach_default_size_charts();

-- ======================================================================
-- 0100_admin_item_size_chart.sql
-- ======================================================================
-- Prompt 1.9 follow-up: an owner can set or clear the size chart of ONE item from admin, and see which items a chart is on.
-- Sellers already choose a chart per item through seller_save_item (0086); this is the admin side, for fixing a wrong chart without the seller.
--   * admin_set_item_size_chart(item, chart)   owner only. chart null clears it. The chart must exist and be active. A different chart drops the item's
--                                              own row overrides (they were edits of the old chart). Audited.
--   * admin_items_for_size_chart(chart, query, limit)   owner, reviewer, support: items on a chart (chart given) or items matching a name search (chart null)
--                                              with the business and chart they have now.

create or replace function public.admin_set_item_size_chart(p_item uuid, p_chart uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_old public.items;
  v_chart public.size_charts;
begin
  if not public.has_role(array['owner']) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_old from public.items where id = p_item for update;
  if not found then raise exception 'item_not_found' using errcode = 'P0001'; end if;
  if p_chart is not null then
    select * into v_chart from public.size_charts where id = p_chart;
    if not found then raise exception 'chart_not_found' using errcode = 'P0001'; end if;
    if not v_chart.active and v_old.size_chart_id is distinct from p_chart then raise exception 'chart_inactive' using errcode = 'P0001'; end if;
  end if;
  if v_old.size_chart_id is not distinct from p_chart then return true; end if; -- already so: nothing to change, nothing to audit
  update public.items
     set size_chart_id = p_chart, size_chart_override = null
   where id = p_item;
  perform public.admin_audit_action('item.size_chart', 'item', p_item::text,
    jsonb_build_object('size_chart_id', v_old.size_chart_id), jsonb_build_object('size_chart_id', p_chart), null, null);
  return true;
end $$;

create or replace function public.admin_items_for_size_chart(p_chart uuid default null, p_query text default null, p_limit integer default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if not public.has_role(array['owner', 'reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_chart is null and v_q is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.name)
    from (
      select i.id, i.name, i.product_type_id, i.size_chart_id, c.name as size_chart_name, b.name as business_name
        from public.items i
        join public.businesses b on b.id = i.business_id
        left join public.size_charts c on c.id = i.size_chart_id
       where (p_chart is null or i.size_chart_id = p_chart)
         and (v_q is null or i.name ilike '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
       order by i.name
       limit least(greatest(coalesce(p_limit, 30), 1), 100)
    ) x
  ), '[]'::jsonb);
end $$;

revoke all on function public.admin_set_item_size_chart(uuid, uuid), public.admin_items_for_size_chart(uuid, text, integer) from public, anon;
grant execute on function public.admin_set_item_size_chart(uuid, uuid), public.admin_items_for_size_chart(uuid, text, integer) to authenticated, service_role;

-- Reload the API so the new functions and views are visible straight away.
notify pgrst, 'reload schema';
