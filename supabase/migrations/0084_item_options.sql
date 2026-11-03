-- 0084_item_options.sql
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

-- Old entries look like {id, label, price}. They become one axis (key 'option', label 'Option', buttons) and one variant row per entry,
-- so the buyer sees the same labels and prices. Entries without a label are skipped. Returns true when the item was converted.
create or replace function public.item_options_convert_legacy(p_item uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  r public.items;
  e jsonb;
  n integer := 0;
  v_slug text;
  v_used text[] := '{}';
  v_vals jsonb := '[]'::jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_price numeric;
  v_i integer := 0;
begin
  select * into r from public.items where id = p_item for update;
  if not found or r.option_axes <> '[]'::jsonb or jsonb_typeof(r.variants) <> 'array' or jsonb_array_length(r.variants) = 0 then return false; end if;
  for e in select jsonb_array_elements(r.variants) loop
    v_i := v_i + 1;
    exit when n >= 40;
    if jsonb_typeof(e) <> 'object' or not public.item_detail_text_ok(to_jsonb(btrim(coalesce(e ->> 'label', ''))), 40) then continue; end if;
    v_slug := regexp_replace(lower(coalesce(nullif(btrim(e ->> 'id'), ''), btrim(e ->> 'label'))), '[^a-z0-9_-]+', '-', 'g');
    v_slug := left(regexp_replace(v_slug, '^[^a-z0-9]+', ''), 40);
    if v_slug = '' then v_slug := 'option-' || v_i; end if;
    if v_slug = any (v_used) then v_slug := left(v_slug, 36) || '-' || v_i; end if;
    if v_slug = any (v_used) then continue; end if;
    v_used := v_used || v_slug;
    n := n + 1;
    v_price := case when coalesce(e ->> 'price', '') ~ '^\d{1,10}(\.\d{1,2})?$' then (e ->> 'price')::numeric end;
    v_vals := v_vals || jsonb_build_array(jsonb_build_object('id', v_slug, 'label', btrim(e ->> 'label')));
    v_rows := v_rows || jsonb_build_array(jsonb_build_object('slug', v_slug, 'price', v_price));
  end loop;
  if n = 0 then return false; end if;
  update public.items set option_axes = jsonb_build_array(jsonb_build_object('key', 'option', 'label', 'Option', 'display', 'button', 'values', v_vals)) where id = p_item;
  insert into public.item_variants (item_id, business_id, combo_key, choice, price, status, sort)
  select p_item, r.business_id, 'option=' || (x.e ->> 'slug'), jsonb_build_object('option', x.e ->> 'slug'), (x.e ->> 'price')::numeric, 'available', (x.n - 1)::integer
    from jsonb_array_elements(v_rows) with ordinality as x(e, n);
  return true;
end $$;
revoke all on function public.item_options_convert_legacy(uuid) from public, anon, authenticated;
grant execute on function public.item_options_convert_legacy(uuid) to service_role;

do $$
declare v_id uuid;
begin
  for v_id in select id from public.items where jsonb_typeof(variants) = 'array' and jsonb_array_length(variants) > 0 and option_axes = '[]'::jsonb loop
    begin
      perform public.item_options_convert_legacy(v_id);
    exception when others then
      raise notice 'legacy variants of item % not converted: %', v_id, sqlerrm;
    end;
  end loop;
end $$;

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

    -- Check every variant first, then write.
    create temp table if not exists _opt_variants (
      ord integer, combo_key text, choice jsonb, price numeric, sale_price numeric, stock_count integer, status text, sku text, media_ids uuid[]
    ) on commit drop;
    truncate _opt_variants;

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
      insert into _opt_variants values (n, v_key, e -> 'choice', v_price, v_sale, v_stock, v_status, v_sku, v_media);
    end loop;

    -- The flash guard of seller_save_item covers variant prices too: they cannot change while the item is in a scheduled or live sale.
    if exists (select 1 from public.flash_sales s where s.item_id = p_item and s.status in ('scheduled', 'live')) then
      select exists (
        select 1 from _opt_variants t full join public.item_variants o on o.item_id = p_item and o.combo_key = t.combo_key
        where (t.combo_key is null or o.combo_key is null) and coalesce(t.price, o.price) is not null
           or (t.combo_key is not null and o.combo_key is not null and (t.price, t.sale_price) is distinct from (o.price, o.sale_price))
      ) into v_changed;
      if v_changed then raise exception 'item_in_flash_sale' using errcode = 'P0001'; end if;
    end if;

    delete from public.item_variants where item_id = p_item and not (combo_key = any (v_keys));
    update public.item_variants set sku = null where item_id = p_item;   -- a SKU may move between combinations in one save
    insert into public.item_variants (item_id, business_id, combo_key, choice, price, sale_price, stock_count, status, sku, media_ids, copy_media_ids, sort)
    select p_item, p_business, t.combo_key, t.choice, t.price, t.sale_price, t.stock_count, t.status, t.sku, t.media_ids, '{}', t.ord - 1 from _opt_variants t
    on conflict (item_id, combo_key) do update set
      choice = excluded.choice, price = excluded.price, sale_price = excluded.sale_price, stock_count = excluded.stock_count, status = excluded.status,
      sku = excluded.sku, media_ids = excluded.media_ids, copy_media_ids = '{}', sort = excluded.sort, updated_at = now();
    update public.items set option_axes = v_axes where id = p_item;
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
-- A combination with no cell is unavailable; `missing` says so. `values` gives every option value its best status across the cells
-- that contain it, so a picker can grey out a value without enumerating combinations.
create or replace function public.item_options_matrix(p_item uuid, p_axes jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
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
      select s.status into v_best from public.item_variants s
        where s.item_id = p_item and s.choice ->> (a ->> 'key') = v ->> 'id'
        order by public.option_status_rank(s.status) desc limit 1;
      v_axis := v_axis || jsonb_build_object(v ->> 'id', coalesce(v_best, 'unavailable'));
    end loop;
    v_values := v_values || jsonb_build_object(a ->> 'key', v_axis);
  end loop;
  return jsonb_build_object(
    'axes', coalesce((select jsonb_agg(x ->> 'key') from jsonb_array_elements(coalesce(p_axes, '[]'::jsonb)) x), '[]'::jsonb),
    'missing', 'unavailable',
    'cells', coalesce((select jsonb_agg(jsonb_build_object('key', s.combo_key, 'choice', s.choice, 'status', s.status, 'variantId', s.id) order by s.sort, s.id)
                       from public.item_variants s where s.item_id = p_item), '[]'::jsonb),
    'values', v_values);
end $$;
revoke all on function public.item_options_matrix(uuid, jsonb), public.option_status_rank(text) from public;
grant execute on function public.item_options_matrix(uuid, jsonb), public.option_status_rank(text) to service_role;

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

-- "Red / S": the chosen values' labels in axis order. Every public variant carries it, so the payload stays a superset of the old
-- {id, label, price} entries that pages already read.
create or replace function public.item_variant_label(p_axes jsonb, p_choice jsonb) returns text
language sql immutable parallel safe as $$
  select string_agg(v.e ->> 'label', ' / ' order by a.n)
  from jsonb_array_elements(coalesce(p_axes, '[]'::jsonb)) with ordinality as a(e, n)
  join lateral jsonb_array_elements(a.e -> 'values') as v(e) on v.e ->> 'id' = p_choice ->> (a.e ->> 'key')
$$;
revoke all on function public.item_variant_label(jsonb, jsonb) from public;
grant execute on function public.item_variant_label(jsonb, jsonb) to anon, authenticated, service_role;

-- The public read. null when the item is not public (hidden, draft, removed, sold out, shop not visible).
-- The matrix is `optionAvailability` because the item already has an `availability` field (its own status string, which pages read).
create or replace function public.public_item_options(p_item uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  i public.items;
begin
  if not exists (select 1 from public.public_items pi where pi.id = p_item) then return null; end if;
  select * into i from public.items where id = p_item;
  return jsonb_build_object(
    'options', public.item_option_axes_public(i.option_axes),
    'variants', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id, 'label', public.item_variant_label(i.option_axes, s.choice), 'choice', s.choice,
          'price', coalesce(s.price, i.price),
          'salePrice', case when s.price is null then i.sale_price else s.sale_price end,
          'status', s.status, 'sku', s.sku, 'mediaIds', to_jsonb(s.media_ids),
          'stockLeft', case when i.show_stock_count and s.status = 'limited_stock' and s.stock_count > 0 then s.stock_count end)
        order by s.sort, s.id)
      from public.item_variants s where s.item_id = p_item), '[]'::jsonb),
    'optionAvailability', public.item_options_matrix(p_item, i.option_axes),
    'sizeChart', public.item_size_chart_payload(i));
end $$;

create or replace function public.seller_item_options(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  i public.items;
begin
  perform public.assert_seller_active();
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select * into i from public.items where id = p_id and business_id = v_id and not removed_by_admin;
  if not found then raise exception 'item_not_found' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'axes', public.item_option_axes_public(i.option_axes),
    'variants', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'choice', s.choice, 'price', s.price, 'salePrice', s.sale_price, 'stock', s.stock_count,
                                          'status', s.status, 'sku', s.sku, 'mediaIds', to_jsonb(s.media_ids)) order by s.sort, s.id)
      from public.item_variants s where s.item_id = p_id), '[]'::jsonb),
    'optionAvailability', public.item_options_matrix(p_id, i.option_axes),
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
-- 7. seller_save_item, seller_duplicate_item, seller_bulk_items (latest definitions: 0050, 0050, 004600; changes marked "0084")
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
     or (f ? 'includes' and jsonb_typeof(f -> 'includes') not in ('array', 'null')) then
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
      brand, short_description, highlights, specs, includes, terms, pack_size)
    values (v_id, v_name, v_desc, v_section, v_type, v_price, v_max, v_sale, v_unit, v_avail, v_track, v_count, v_low, v_show, false, true, v_sort,
      v_brand, v_short, v_hl, v_specs, v_inc, v_terms, v_pack)
    returning id into v_new;
    perform public.item_options_apply(v_new, v_id, f);   -- 0084
    return v_new;
  end if;

  select * into v_old from public.items i where i.id = p_id and i.business_id = v_id and not i.removed_by_admin for update;
  if not found then raise exception 'item_not_found' using errcode = 'P0001'; end if;

  if (v_old.price, v_old.price_max, v_old.price_type, v_old.sale_price) is distinct from (v_price, v_max, v_type, v_sale)
     and exists (select 1 from public.flash_sales s where s.item_id = p_id and s.status in ('scheduled','live')) then
    raise exception 'item_in_flash_sale' using errcode = 'P0001';
  end if;

  update public.items set
    name = v_name, description = v_desc, section = v_section, price_type = v_type, price = v_price, price_max = v_max,
    sale_price = v_sale, unit = v_unit, availability = v_avail,
    track_stock = v_track, stock_count = v_count, low_stock_threshold = v_low, show_stock_count = v_show,
    brand = v_brand, short_description = v_short, highlights = v_hl, specs = v_specs, includes = v_inc, terms = v_terms, pack_size = v_pack
  where id = p_id;
  perform public.item_options_apply(p_id, v_id, f);   -- 0084
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
    public.item_option_axes_for_copy(v_src.option_axes), v_src.size_chart_id, v_src.size_chart_override)   -- 0084
  returning id into v_new;
  -- 0084: variants are copied with their media ids parked in copy_media_ids; item_remap_copied_media resolves them after the files are copied.
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
    -- 0084: variant prices follow the item's percent change, for the same items.
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
                  and not exists (select 1 from public.flash_sales s where s.item_id = i.id and s.status in ('scheduled','live')));   -- 0084
  else
    update public.items set price_confirmed_at = now() where id = any (v_ids);
    get diagnostics v_n = row_count;
  end if;

  perform public.write_audit(v_id, 'items_bulk_' || p_action, 'item', null, jsonb_build_object('count', v_n, 'skipped', v_skipped, 'args', coalesce(p_args, '{}')));
  return jsonb_build_object('affected', v_n, 'skipped', v_skipped);
end $$;

revoke all on function public.seller_save_item(uuid, jsonb), public.seller_duplicate_item(uuid), public.seller_bulk_items(text, uuid[], jsonb) from public, anon;
grant execute on function public.seller_save_item(uuid, jsonb), public.seller_duplicate_item(uuid), public.seller_bulk_items(text, uuid[], jsonb) to authenticated, service_role;
