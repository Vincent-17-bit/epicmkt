-- 0087: option dependencies, the seller's default variant, per-variant spec overrides, a database cap on variants, seller_check_item.
-- Builds on 0086 (item_variants, option_axes, item_options_apply, the reads). Nothing from 0086 is edited; the functions below are
-- re-created with their 0086 text plus the changes marked 0087.
--
--   1. items.default_variant_id        the seller's default combination (an item_variants row of the SAME item; cleared if that variant is removed).
--   2. item_variants.specs             spec rows that replace the item's own rows for one combination ("Compatible devices" by style).
--   3. axes: `dependsOn`               an axis may depend on an EARLIER axis; the value lists are derived from the sellable combinations in
--                                      shared/src/options/dependent.js, never stored a second time.
--   4. a trigger                       at most 200 variants per item, enforced by the database (the save function checks it first, with a name).
--   5. seller_save_item (via item_options_apply)   options.defaultChoice, variants[].specs.
--   6. reads                           public_item_options / seller_item_options add defaultVariantId, specs, dependsOn.
--   7. seller_check_item               runs the real save in a sub-transaction and rolls it back: same checks, nothing written.
--
-- Old items (no options) are untouched: the new columns default to null / [] and every read keeps its old keys.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1 + 2. Columns
-- ---------------------------------------------------------------------------------------------------------------------

-- (id, item_id) is unique so items can point at "a variant of this same item" with one composite foreign key.
alter table public.item_variants add column if not exists specs jsonb not null default '[]'::jsonb;
alter table public.item_variants drop constraint if exists item_variants_specs_shape;
alter table public.item_variants add constraint item_variants_specs_shape check (public.item_specs_valid(specs));
alter table public.item_variants drop constraint if exists item_variants_id_item_uq;
alter table public.item_variants add constraint item_variants_id_item_uq unique (id, item_id);

alter table public.items add column if not exists default_variant_id uuid;
alter table public.items drop constraint if exists items_default_variant_fk;
-- on delete set null (default_variant_id): removing the default variant clears the default and leaves item_id alone.
alter table public.items add constraint items_default_variant_fk foreign key (default_variant_id, id)
  references public.item_variants (id, item_id) on delete set null (default_variant_id);

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Axes: dependsOn
-- ---------------------------------------------------------------------------------------------------------------------

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
      if k not in ('key', 'label', 'display', 'values', 'dependsOn') then return false; end if;
    end loop;
    if not public.option_slug_ok(a -> 'key', 30) or (a ->> 'key') = any (v_keys) then return false; end if;
    -- dependsOn names an EARLIER axis (so the chain can never loop); v_keys holds only the axes before this one.
    if a ? 'dependsOn' and (not public.option_slug_ok(a -> 'dependsOn', 30) or not ((a ->> 'dependsOn') = any (v_keys))) then return false; end if;
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
    if a ? 'dependsOn' and jsonb_typeof(a -> 'dependsOn') <> 'null' then v_axis := v_axis || jsonb_build_object('dependsOn', a -> 'dependsOn'); end if;
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
        order by v.n), '[]'::jsonb)
      from jsonb_array_elements(a.e -> 'values') with ordinality as v(e, n))) || case when a.e ? 'dependsOn' then jsonb_build_object('dependsOn', a.e -> 'dependsOn') else '{}'::jsonb end
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
        order by v.n), '[]'::jsonb)
      from jsonb_array_elements(a.e -> 'values') with ordinality as v(e, n))) || case when a.e ? 'dependsOn' then jsonb_build_object('dependsOn', a.e -> 'dependsOn') else '{}'::jsonb end
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
        order by v.n), '[]'::jsonb)
      from jsonb_array_elements(a.e -> 'values') with ordinality as v(e, n))) || case when a.e ? 'dependsOn' then jsonb_build_object('dependsOn', a.e -> 'dependsOn') else '{}'::jsonb end
    order by a.n), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p, '[]'::jsonb)) with ordinality as a(e, n)
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Variant cap in the database
-- ---------------------------------------------------------------------------------------------------------------------

-- A row that only updates an existing combination (the upsert in item_options_apply) does not add one, so it is never refused.
create or replace function public.item_variants_limit() returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.item_variants v where v.item_id = new.item_id and v.combo_key = new.combo_key) then return new; end if;
  if (select count(*) from public.item_variants v where v.item_id = new.item_id) >= 200 then
    raise exception 'too_many_variants' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.item_variants_limit() from public, anon, authenticated;
drop trigger if exists item_variants_limit on public.item_variants;
create trigger item_variants_limit before insert on public.item_variants for each row execute function public.item_variants_limit();

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. Save: defaultChoice and variant specs (seller_save_item itself is unchanged; it calls this)
-- ---------------------------------------------------------------------------------------------------------------------

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
  v_specs jsonb;
  v_has_def boolean := false;
  v_def_key text;
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
        if k not in ('axes', 'variants', 'defaultChoice') then raise exception 'invalid_options' using errcode = 'P0001'; end if;
      end loop;
      v_axes := coalesce(nullif(v_opts -> 'axes', 'null'::jsonb), '[]'::jsonb);
      v_vars := coalesce(nullif(v_opts -> 'variants', 'null'::jsonb), '[]'::jsonb);
    end if;
    if jsonb_typeof(v_axes) <> 'array' or jsonb_typeof(v_vars) <> 'array' then raise exception 'invalid_options' using errcode = 'P0001'; end if;
    v_axes := public.item_option_axes_clean(v_axes);
    if not public.item_option_axes_valid(v_axes) then raise exception 'invalid_options' using errcode = 'P0001'; end if;
    if jsonb_array_length(v_vars) > 200 then raise exception 'too_many_variants' using errcode = 'P0001'; end if;
    if jsonb_array_length(v_axes) = 0 and jsonb_array_length(v_vars) > 0 then raise exception 'invalid_options' using errcode = 'P0001'; end if;
    -- The seller's default combination; checked against the saved variants once they are collected. null clears it.
    if jsonb_typeof(v_opts) = 'object' and v_opts ? 'defaultChoice' then
      v_has_def := true;
      if jsonb_typeof(v_opts -> 'defaultChoice') <> 'null' then
        v_def_key := public.item_option_combo_key(v_axes, v_opts -> 'defaultChoice');
        if v_def_key is null then raise exception 'invalid_default' using errcode = 'P0001'; end if;
      end if;
    end if;

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
        if k not in ('id', 'choice', 'price', 'salePrice', 'stock', 'status', 'sku', 'mediaIds', 'specs') then raise exception 'invalid_variant' using errcode = 'P0001'; end if;
      end loop;
      v_key := public.item_option_combo_key(v_axes, e -> 'choice');
      if v_key is null then raise exception 'invalid_variant' using errcode = 'P0001'; end if;
      if v_key = any (v_keys) then raise exception 'duplicate_variant' using errcode = 'P0001'; end if;
      v_keys := v_keys || v_key;

      v_price := null; v_sale := null; v_stock := null; v_sku := null; v_media := '{}'; v_specs := '[]'::jsonb;
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
      -- Spec rows that replace the item's own rows for this combination (same shape and limits as items.specs); trimmed like the JS mirror.
      if e ? 'specs' and jsonb_typeof(e -> 'specs') <> 'null' then
        if jsonb_typeof(e -> 'specs') <> 'array' or jsonb_array_length(e -> 'specs') > 20 then raise exception 'invalid_variant' using errcode = 'P0001'; end if;
        select coalesce(jsonb_agg(case when jsonb_typeof(r.e) = 'object' then r.e
                 || case when jsonb_typeof(r.e -> 'label') = 'string' then jsonb_build_object('label', btrim(r.e ->> 'label')) else '{}'::jsonb end
                 || case when jsonb_typeof(r.e -> 'value') = 'string' then jsonb_build_object('value', btrim(r.e ->> 'value')) else '{}'::jsonb end
               else r.e end order by r.n), '[]'::jsonb)
          into v_specs from jsonb_array_elements(e -> 'specs') with ordinality as r(e, n);
        if not public.item_specs_valid(v_specs) then raise exception 'invalid_variant' using errcode = 'P0001'; end if;
      end if;
      v_rows := v_rows || jsonb_build_array(jsonb_build_object('ord', n, 'combo_key', v_key, 'choice', e -> 'choice', 'price', v_price, 'sale_price', v_sale,
                                                               'stock_count', v_stock, 'status', v_status, 'sku', v_sku, 'media_ids', to_jsonb(v_media), 'specs', v_specs));
    end loop;

    if v_def_key is not null and not (v_def_key = any (v_keys)) then raise exception 'invalid_default' using errcode = 'P0001'; end if;

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
    insert into public.item_variants (item_id, business_id, combo_key, choice, price, sale_price, stock_count, status, sku, media_ids, copy_media_ids, sort, specs)
    select p_item, p_business, t.combo_key, t.choice, t.price, t.sale_price, t.stock_count, t.status, t.sku,
           array(select jsonb_array_elements_text(t.media_ids)::uuid), '{}', t.ord - 1, t.specs
      from jsonb_to_recordset(v_rows) as t(ord integer, combo_key text, choice jsonb, price numeric, sale_price numeric, stock_count integer, status text, sku text, media_ids jsonb, specs jsonb)
    on conflict (item_id, combo_key) do update set
      choice = excluded.choice, price = excluded.price, sale_price = excluded.sale_price, stock_count = excluded.stock_count, status = excluded.status,
      sku = excluded.sku, media_ids = excluded.media_ids, copy_media_ids = '{}', sort = excluded.sort, specs = excluded.specs, updated_at = now();
    -- Real options supersede the old single-list variants (still written by the old editor); leaving both would show two lists.
    update public.items set option_axes = v_axes, variants = case when jsonb_array_length(v_axes) > 0 then '[]'::jsonb else variants end where id = p_item;
    -- The default: left alone when the save does not mention it (a removed variant clears it by itself, see the foreign key), set or cleared when it does.
    if v_has_def then
      update public.items set default_variant_id = (select iv.id from public.item_variants iv where iv.item_id = p_item and iv.combo_key = v_def_key) where id = p_item;
    end if;
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
-- 6. Reads and duplicate
-- ---------------------------------------------------------------------------------------------------------------------

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
        'price', s.price, 'salePrice', s.sale_price, 'stock', s.stock_count, 'status', s.status, 'sku', s.sku, 'mediaIds', to_jsonb(s.media_ids), 'specs', s.specs) order by s.sort, s.id)
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
        'status', x.e -> 'status', 'sku', x.e -> 'sku', 'mediaIds', x.e -> 'mediaIds', 'specs', coalesce(x.e -> 'specs', '[]'::jsonb),
        'stockLeft', case when i.show_stock_count and x.e ->> 'status' = 'limited_stock' and (x.e ->> 'stock')::integer > 0 then x.e -> 'stock' end) order by x.n)
      from jsonb_array_elements(src -> 'variants') with ordinality as x(e, n)), '[]'::jsonb),
    'optionAvailability', public.item_options_matrix(src -> 'axes', (
      select coalesce(jsonb_agg(jsonb_build_object('id', x.e -> 'id', 'key', x.e -> 'key', 'choice', x.e -> 'choice', 'status', x.e -> 'status') order by x.n), '[]'::jsonb)
      from jsonb_array_elements(src -> 'variants') with ordinality as x(e, n))),
    'defaultVariantId', i.default_variant_id,
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
                                          'status', x.e -> 'status', 'sku', x.e -> 'sku', 'mediaIds', x.e -> 'mediaIds', 'specs', coalesce(x.e -> 'specs', '[]'::jsonb)) order by x.n)
      from jsonb_array_elements(src -> 'variants') with ordinality as x(e, n)), '[]'::jsonb),
    'optionAvailability', public.item_options_matrix(src -> 'axes', (
      select coalesce(jsonb_agg(jsonb_build_object('id', x.e -> 'id', 'key', x.e -> 'key', 'choice', x.e -> 'choice', 'status', x.e -> 'status') order by x.n), '[]'::jsonb)
      from jsonb_array_elements(src -> 'variants') with ordinality as x(e, n))),
    'defaultVariantId', i.default_variant_id,
    'sizeChartId', i.size_chart_id,
    'sizeChartOverride', i.size_chart_override);
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
  insert into public.item_variants (item_id, business_id, combo_key, choice, price, sale_price, stock_count, status, sku, media_ids, copy_media_ids, sort, specs)
  select v_new, v_id, s.combo_key, s.choice, s.price, s.sale_price, s.stock_count, s.status, s.sku, '{}', case when cardinality(s.media_ids) > 0 then s.media_ids else s.copy_media_ids end, s.sort, s.specs
    from public.item_variants s where s.item_id = p_id;
  -- 0087: the copy keeps the same default combination (its variants have new ids, so look it up by combination).
  if v_src.default_variant_id is not null then
    update public.items set default_variant_id = (select n.id from public.item_variants n join public.item_variants o on o.combo_key = n.combo_key
                                                   where n.item_id = v_new and o.id = v_src.default_variant_id) where id = v_new;
  end if;
  return v_new;
end $$;

revoke all on function public.public_item_options(uuid), public.seller_item_options(uuid) from public, anon;
grant execute on function public.public_item_options(uuid) to anon, authenticated, service_role;
grant execute on function public.seller_item_options(uuid) to authenticated, service_role;
revoke all on function public.seller_duplicate_item(uuid) from public, anon;
grant execute on function public.seller_duplicate_item(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 7. seller_check_item: the issues a save would raise, without saving
-- ---------------------------------------------------------------------------------------------------------------------

-- Same arguments as seller_save_item (p_id null checks a new item). It runs the real save inside a sub-transaction and always rolls it
-- back, so the checks cannot drift from the save. Returns { ok: true } or { ok: false, issues: [{ code }] } (the save's error name).
-- The save stops at the first problem, so there is at most one issue; the shared validator (shared/src/seller/options.js) lists them all
-- for the form. Any error that is not one of the save's own is reported as invalid_item rather than leaking the database's text.
create or replace function public.seller_check_item(p_id uuid, p_fields jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_state text;
  v_msg text;
begin
  perform public.assert_seller_active();
  if public.my_business_id() is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  begin
    perform public.seller_save_item(p_id, p_fields);
    raise exception 'check_done' using errcode = 'P0002';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    if v_state = 'P0002' and v_msg = 'check_done' then
      return jsonb_build_object('ok', true, 'issues', '[]'::jsonb);
    elsif v_state = '42501' then
      raise;
    elsif v_state = 'P0001' then
      return jsonb_build_object('ok', false, 'issues', jsonb_build_array(jsonb_build_object('code', v_msg)));
    end if;
    return jsonb_build_object('ok', false, 'issues', jsonb_build_array(jsonb_build_object('code', 'invalid_item')));
  end;
end $$;
revoke all on function public.seller_check_item(uuid, jsonb) from public, anon;
grant execute on function public.seller_check_item(uuid, jsonb) to authenticated, service_role;
