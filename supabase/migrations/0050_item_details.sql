create or replace function public.item_detail_text_ok(p jsonb, p_max integer) returns boolean
language sql immutable parallel safe as
$$ select coalesce(jsonb_typeof(p) = 'string' and btrim(p #>> '{}') <> '' and char_length(p #>> '{}') <= p_max, false) $$;

create or replace function public.item_highlights_valid(p jsonb) returns boolean
language plpgsql immutable parallel safe as $$
declare
  e jsonb;
  k text;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 8 then return false; end if;
  for e in select jsonb_array_elements(p) loop
    if jsonb_typeof(e) <> 'object' then return false; end if;
    for k in select jsonb_object_keys(e) loop
      if k not in ('title', 'text') then return false; end if;
    end loop;
    if not public.item_detail_text_ok(e -> 'text', 200) then return false; end if;
    if e ? 'title' and not public.item_detail_text_ok(e -> 'title', 40) then return false; end if;
  end loop;
  return true;
end $$;

create or replace function public.item_specs_valid(p jsonb) returns boolean
language plpgsql immutable parallel safe as $$
declare
  e jsonb;
  k text;
  c_groups constant text[] := array['Features & Specs', 'Measurements', 'Additional details', 'User guide', 'Item details'];
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 20 then return false; end if;
  for e in select jsonb_array_elements(p) loop
    if jsonb_typeof(e) <> 'object' then return false; end if;
    for k in select jsonb_object_keys(e) loop
      if k not in ('group', 'label', 'value') then return false; end if;
    end loop;
    if jsonb_typeof(e -> 'group') is distinct from 'string' or (e ->> 'group') <> all (c_groups) then return false; end if;
    if not public.item_detail_text_ok(e -> 'label', 40) or not public.item_detail_text_ok(e -> 'value', 120) then return false; end if;
  end loop;
  return true;
end $$;

create or replace function public.item_includes_valid(p text[]) returns boolean
language plpgsql immutable parallel safe as $$
declare
  t text;
begin
  if p is null or cardinality(p) > 10 or coalesce(array_ndims(p), 1) <> 1 then return false; end if;
  foreach t in array p loop
    if t is null or btrim(t) = '' or char_length(t) > 80 then return false; end if;
  end loop;
  return true;
end $$;

revoke all on function public.item_detail_text_ok(jsonb, integer), public.item_highlights_valid(jsonb), public.item_specs_valid(jsonb), public.item_includes_valid(text[]) from public;
grant execute on function public.item_detail_text_ok(jsonb, integer), public.item_highlights_valid(jsonb), public.item_specs_valid(jsonb), public.item_includes_valid(text[]) to anon, authenticated, service_role;

alter table public.items
  add column if not exists brand text,
  add column if not exists short_description text,
  add column if not exists highlights jsonb not null default '[]'::jsonb,
  add column if not exists specs jsonb not null default '[]'::jsonb,
  add column if not exists includes text[] not null default '{}',
  add column if not exists terms text,
  add column if not exists pack_size text;

alter table public.items
  drop constraint if exists items_brand_len,
  drop constraint if exists items_short_description_len,
  drop constraint if exists items_highlights_shape,
  drop constraint if exists items_specs_shape,
  drop constraint if exists items_includes_shape,
  drop constraint if exists items_terms_len,
  drop constraint if exists items_pack_size_len,
  add constraint items_brand_len check (char_length(brand) <= 60),
  add constraint items_short_description_len check (char_length(short_description) <= 140),
  add constraint items_highlights_shape check (public.item_highlights_valid(highlights)),
  add constraint items_specs_shape check (public.item_specs_valid(specs)),
  add constraint items_includes_shape check (public.item_includes_valid(includes)),
  add constraint items_terms_len check (char_length(terms) <= 500),
  add constraint items_pack_size_len check (char_length(pack_size) <= 40);

-- New columns go last so the existing view definitions stay valid.
create or replace view public.public_items with (security_barrier = true) as
select
  i.id, i.business_id, i.name, i.description, i.section, i.price, i.price_max, i.price_type, i.unit,
  i.availability, i.sort, i.created_at,
  coalesce((select jsonb_agg(m.path order by m.sort, m.created_at) from public.item_media m where m.item_id = i.id and m.kind = 'image'), '[]'::jsonb) as image_paths,
  coalesce((select jsonb_agg(m.path order by m.sort, m.created_at) from public.item_media m where m.item_id = i.id and m.kind = 'video'), '[]'::jsonb) as video_paths,
  case when i.track_stock and i.show_stock_count and i.availability = 'limited_stock' and i.stock_count > 0 then i.stock_count end as stock_left,
  i.brand, i.short_description, i.highlights, i.specs, i.includes, i.terms, i.pack_size
from public.items i
join public.businesses b on b.id = i.business_id
where public.business_is_visible(b) and i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin
  and public.item_is_listed(i.availability);
revoke all on public.public_items from public;
grant select on public.public_items to anon, authenticated, service_role;

create or replace view public.public_businesses with (security_barrier = true) as
select
  b.id, b.slug, b.name, b.category_id, b.plan_key, b.verification_level, b.tagline, b.description,
  b.phone, b.whatsapp, b.socials, b.amenities, b.payment_methods, b.delivery_area,
  b.county, b.town, b.address, b.lat, b.lng, b.logo_path, b.cover_path, b.tags, b.hours, b.created_at,
  public.public_exceptions(b.exceptions) as exceptions,
  (select count(*)::integer from public.items i
    where i.business_id = b.id and i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin
      and public.item_is_listed(i.availability)) as product_count
from public.businesses b
where public.business_is_visible(b);
revoke all on public.public_businesses from public;
grant select on public.public_businesses to anon, authenticated, service_role;

create or replace function public.log_item_changes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
  f text;
begin
  foreach f in array array['name','price','price_max','price_type','unit','sale_price','availability','stock_count','visible','hidden_by_admin',
                           'brand','short_description','highlights','specs','includes','terms','pack_size'] loop
    if o -> f is distinct from n -> f then
      insert into public.item_history (item_id, business_id, field, old_value, new_value, changed_by, actor_role)
      values (new.id, new.business_id, f, o ->> f, n ->> f, auth.uid(), public.actor_role());
    end if;
  end loop;
  return null;
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
    brand, short_description, highlights, specs, includes, terms, pack_size)
  values (v_id, left(v_src.name, 111) || ' (copy)', v_src.description, v_src.section, v_src.price, v_src.price_max, v_src.price_type, v_src.unit,
    v_src.sale_price, v_src.availability, v_src.stock_count, v_src.track_stock, v_src.low_stock_threshold, v_src.show_stock_count, v_src.season,
    v_src.tags, v_src.badge, v_src.variants, false, true, v_src.sort + 1,
    v_src.brand, v_src.short_description, v_src.highlights, v_src.specs, v_src.includes, v_src.terms, v_src.pack_size)
  returning id into v_new;
  return v_new;
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
  return p_id;
end $$;
