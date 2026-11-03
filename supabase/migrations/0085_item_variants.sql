update public.items set variants = '[]'::jsonb where jsonb_typeof(variants) is distinct from 'array';
alter table public.items alter column variants set default '[]'::jsonb;

create or replace function public.item_variants_valid(p_variants jsonb) returns boolean
language plpgsql immutable as
$$
declare
  v_e jsonb;
  v_ids text[] := '{}';
  v_labels text[] := '{}';
  v_label text;
begin
  if p_variants is null or jsonb_typeof(p_variants) <> 'array' or jsonb_array_length(p_variants) > 10 then return false; end if;
  for v_e in select e from jsonb_array_elements(p_variants) as t(e) loop
    if jsonb_typeof(v_e) <> 'object' or exists (select 1 from jsonb_object_keys(v_e) k where k not in ('id', 'label', 'price', 'stock')) then return false; end if;
    if jsonb_typeof(v_e -> 'id') <> 'string' or (v_e ->> 'id') !~ '^[a-z0-9_-]{1,20}$' or (v_e ->> 'id') = any (v_ids) then return false; end if;
    v_label := lower(btrim(coalesce(v_e ->> 'label', '')));
    if jsonb_typeof(v_e -> 'label') <> 'string' or char_length(v_label) < 1 or char_length(v_label) > 40 or v_label = any (v_labels) then return false; end if;
    if jsonb_typeof(v_e -> 'price') <> 'number' or (v_e ->> 'price') !~ '^\d{1,10}(\.\d{1,2})?$' then return false; end if;
    if coalesce(v_e ->> 'stock', '') <> '' and ((v_e ->> 'stock') !~ '^\d{1,6}$') then return false; end if;
    v_ids := v_ids || (v_e ->> 'id');
    v_labels := v_labels || v_label;
  end loop;
  return true;
end $$;

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
  return p_id;
end $$;

create or replace view public.public_items with (security_barrier = true) as
select
  i.id, i.business_id, i.name, i.description, i.section, i.price, i.price_max, i.price_type, i.unit,
  i.availability, i.sort, i.created_at,
  coalesce((select jsonb_agg(m.path order by m.sort, m.created_at, m.id) from public.item_media m where m.item_id = i.id and m.kind = 'image'), '[]'::jsonb) as image_paths,
  coalesce((select jsonb_agg(m.path order by m.sort, m.created_at, m.id) from public.item_media m where m.item_id = i.id and m.kind = 'video'), '[]'::jsonb) as video_paths,
  case when i.track_stock and i.show_stock_count and i.availability = 'limited_stock' and i.stock_count > 0 then i.stock_count end as stock_left,
  i.brand, i.short_description, i.highlights, i.specs, i.includes, i.terms, i.pack_size,
  coalesce((select jsonb_agg(jsonb_build_object('path', m.path, 'kind', m.kind, 'duration', m.duration_sec) order by m.sort, m.created_at, m.id) from public.item_media m where m.item_id = i.id), '[]'::jsonb) as media,
  coalesce((select jsonb_agg(jsonb_build_object('id', x.e ->> 'id', 'label', x.e ->> 'label', 'price', (x.e ->> 'price')::numeric) order by x.n)
    from jsonb_array_elements(case when jsonb_typeof(i.variants) = 'array' then i.variants else '[]'::jsonb end) with ordinality as x(e, n)
    where coalesce(x.e ->> 'stock', '') <> '0'), '[]'::jsonb) as variants
from public.items i
join public.businesses b on b.id = i.business_id
where public.business_is_visible(b) and i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin
  and public.item_is_listed(i.availability);

revoke all on public.public_items from public;
grant select on public.public_items to anon, authenticated, service_role;

