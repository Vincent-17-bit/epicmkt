-- 0109: merge similar items, redirects, undo

create table if not exists public.item_merges (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  new_item_id uuid references public.items(id) on delete set null,
  sources jsonb not null check (jsonb_typeof(sources) = 'array'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  undone_at timestamptz
);
create index if not exists item_merges_business_idx on public.item_merges (business_id, created_at desc);

create table if not exists public.item_redirects (
  old_item_id uuid primary key references public.items(id) on delete cascade,
  new_item_id uuid not null references public.items(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  merge_id uuid not null references public.item_merges(id) on delete cascade,
  choice jsonb not null check (jsonb_typeof(choice) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists item_redirects_new_idx on public.item_redirects (new_item_id);

alter table public.item_merges enable row level security;
alter table public.item_redirects enable row level security;
drop policy if exists "seller reads own merges" on public.item_merges;
create policy "seller reads own merges" on public.item_merges for select to authenticated using (business_id = public.my_business_id());
drop policy if exists "seller reads own redirects" on public.item_redirects;
create policy "seller reads own redirects" on public.item_redirects for select to authenticated using (business_id = public.my_business_id());
revoke all on public.item_merges, public.item_redirects from public, anon, authenticated;
grant select on public.item_merges, public.item_redirects to authenticated;
grant all on public.item_merges, public.item_redirects to service_role;

create or replace function public.item_similar_parts(p_name text) returns jsonb
language plpgsql immutable parallel safe as $$
declare
  c_units constant text[] := array['g', 'kg', 'mg', 'gram', 'grams', 'kilogram', 'kilograms', 'ml', 'cl', 'l', 'ltr', 'ltrs', 'litre', 'litres', 'liter', 'liters',
                                   'oz', 'lb', 'lbs', 'cm', 'mm', 'inch', 'inches', 'pc', 'pcs', 'piece', 'pieces', 'pack', 'packs'];
  c_colours constant text[] := array['red', 'blue', 'green', 'black', 'white', 'brown', 'yellow', 'orange', 'pink', 'purple', 'grey', 'gray', 'silver', 'gold',
                                     'beige', 'navy', 'cream', 'maroon'];
  w text;
  v_word text;
  v_key text[] := '{}';
  v_kept text[] := '{}';
  v_vary text[] := '{}';
begin
  for w in select unnest(regexp_split_to_array(btrim(coalesce(p_name, '')), '\s+')) loop
    v_word := lower(regexp_replace(w, '[^[:alnum:]]', '', 'g'));
    if v_word = '' then continue; end if;
    if v_word ~ '\d' or v_word = any (c_units) or v_word = any (c_colours) then
      v_vary := v_vary || regexp_replace(w, '^[^[:alnum:]]+|[^[:alnum:]]+$', '', 'g');
    else
      v_key := v_key || v_word;
      v_kept := v_kept || regexp_replace(w, '^[^[:alnum:]]+|[^[:alnum:]]+$', '', 'g');
    end if;
  end loop;
  return jsonb_build_object('key', nullif(array_to_string(v_key, ' '), ''), 'name', nullif(array_to_string(v_kept, ' '), ''), 'varies', array_to_string(v_vary, ' '));
end $$;

create or replace function public.seller_similar_item_groups() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_biz uuid := public.my_business_id();
begin
  perform public.assert_seller_active();
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  return coalesce((
    with c as (
      select i.id, i.name, i.price, i.sale_price, i.stock_count, i.track_stock, i.visible, i.draft, i.sort, i.brand, i.product_type_id,
             public.item_similar_parts(i.name) as p
        from public.items i
       where i.business_id = v_biz and not i.removed_by_admin
         and i.price is not null and i.price_type = 'fixed'
         and coalesce(i.option_axes, '[]'::jsonb) = '[]'::jsonb
         and not exists (select 1 from public.item_redirects r where r.old_item_id = i.id)
    ), g as (
      select p ->> 'key' as k, lower(coalesce(brand, '')) as b, coalesce(product_type_id, '') as t,
             jsonb_agg(jsonb_build_object('id', id, 'name', name, 'price', price, 'salePrice', sale_price, 'stock', case when track_stock then stock_count end,
                                          'varies', p ->> 'varies', 'visible', visible, 'draft', draft) order by sort, name, id) as items,
             (array_agg(p ->> 'name' order by sort, name, id))[1] as suggested
        from c
       where p ->> 'key' is not null
       group by 1, 2, 3
      having count(*) >= 2
    )
    select jsonb_agg(jsonb_build_object('key', k, 'name', suggested, 'brand', nullif(b, ''), 'productTypeId', nullif(t, ''), 'items', items) order by k, b, t) from g
  ), '[]'::jsonb);
end $$;

create or replace function public.seller_merge_items(p_ids uuid[], p_plan jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_biz uuid := public.my_business_id();
  v_name text;
  v_axes jsonb;
  v_choices jsonb;
  v_first public.items;
  v_src public.items;
  v_new uuid;
  v_merge uuid := gen_random_uuid();
  v_id uuid;
  v_vars jsonb := '[]'::jsonb;
  v_snap jsonb := '[]'::jsonb;
  v_keys text[] := '{}';
  v_key text;
  v_media uuid[];
  v_all_media uuid[];
  v_live boolean := true;
  v_min numeric;
  v_max numeric;
  v_status text;
  v_expires timestamptz;
  k text;
begin
  perform public.assert_seller_active();
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if p_ids is null or cardinality(p_ids) not between 2 and 40 or cardinality(p_ids) <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception 'invalid_merge' using errcode = 'P0001';
  end if;
  if p_plan is null or jsonb_typeof(p_plan) <> 'object' or jsonb_typeof(p_plan -> 'choices') is distinct from 'object' then
    raise exception 'invalid_merge' using errcode = 'P0001';
  end if;
  for k in select jsonb_object_keys(p_plan) loop
    if k not in ('name', 'axes', 'choices') then raise exception 'invalid_merge' using errcode = 'P0001'; end if;
  end loop;
  v_name := btrim(coalesce(p_plan ->> 'name', ''));
  if char_length(v_name) not between 2 and 120 then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  v_axes := public.item_option_axes_clean(p_plan -> 'axes');
  v_choices := p_plan -> 'choices';
  if jsonb_typeof(v_axes) is distinct from 'array' or jsonb_array_length(v_axes) = 0 or not public.item_option_axes_valid(v_axes) then
    raise exception 'invalid_options' using errcode = 'P0001';
  end if;

  perform 1 from public.items where id = any (p_ids) order by id for update;
  if (select count(*) from public.items where id = any (p_ids) and business_id = v_biz and not removed_by_admin) <> cardinality(p_ids) then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.item_redirects where old_item_id = any (p_ids)) then raise exception 'already_merged' using errcode = 'P0001'; end if;
  if exists (select 1 from public.flash_sales where item_id = any (p_ids) and status in ('scheduled', 'live')) then raise exception 'item_in_flash_sale' using errcode = 'P0001'; end if;

  select * into v_first from public.items where id = p_ids[1];
  insert into public.items (business_id, name, description, section, price, price_type, unit, availability, track_stock, low_stock_threshold, show_stock_count,
    season, tags, badge, variants, visible, draft, sort, brand, short_description, highlights, specs, includes, terms, pack_size, product_type_id,
    size_chart_id, size_chart_override)
  values (v_biz, v_name, v_first.description, v_first.section, v_first.price, 'from', v_first.unit, 'available', false, v_first.low_stock_threshold, false,
    v_first.season, v_first.tags, v_first.badge, '[]'::jsonb, false, true, (select min(sort) from public.items where id = any (p_ids)),
    v_first.brand, v_first.short_description, v_first.highlights, v_first.specs, v_first.includes, v_first.terms, v_first.pack_size, v_first.product_type_id,
    v_first.size_chart_id, v_first.size_chart_override)
  returning id into v_new;

  foreach v_id in array p_ids loop
    select * into v_src from public.items where id = v_id;
    if coalesce(v_src.option_axes, '[]'::jsonb) <> '[]'::jsonb then raise exception 'has_options' using errcode = 'P0001'; end if;
    if v_src.price is null or v_src.price_type <> 'fixed' then raise exception 'needs_price' using errcode = 'P0001'; end if;
    v_key := public.item_option_combo_key(v_axes, v_choices -> v_id::text);
    if v_key is null then raise exception 'invalid_choice' using errcode = 'P0001'; end if;
    if v_key = any (v_keys) then raise exception 'duplicate_variant' using errcode = 'P0001'; end if;
    v_keys := v_keys || v_key;
    v_live := v_live and v_src.visible and not v_src.draft;

    select coalesce(array_agg(id order by sort, created_at, id), '{}') into v_all_media from public.item_media where item_id = v_id;
    update public.item_media set item_id = v_new where item_id = v_id;
    v_media := v_all_media[1:10];
    v_status := case when v_src.availability in ('available', 'limited_stock', 'out_of_stock', 'unavailable') then v_src.availability else 'available' end;
    v_vars := v_vars || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'choice', v_choices -> v_id::text,
      'price', v_src.price,
      'salePrice', case when v_src.sale_price is not null and v_src.sale_price < v_src.price then v_src.sale_price end,
      'stock', case when v_src.track_stock then v_src.stock_count end,
      'status', v_status,
      'mediaIds', to_jsonb(v_media))));
    v_snap := v_snap || jsonb_build_array(jsonb_build_object('id', v_id, 'visible', v_src.visible, 'draft', v_src.draft, 'mediaIds', to_jsonb(v_all_media), 'choice', v_choices -> v_id::text));
  end loop;

  perform public.item_options_apply(v_new, v_biz, jsonb_build_object('options', jsonb_build_object('axes', v_axes, 'variants', v_vars)));
  select min((x ->> 'price')::numeric), max((x ->> 'price')::numeric) into v_min, v_max from jsonb_array_elements(v_vars) x;
  update public.items set price = v_min, price_type = case when v_min = v_max then 'fixed' else 'from' end where id = v_new;

  insert into public.item_merges (id, business_id, new_item_id, sources) values (v_merge, v_biz, v_new, v_snap) returning expires_at into v_expires;
  insert into public.item_redirects (old_item_id, new_item_id, business_id, merge_id, choice)
  select (s ->> 'id')::uuid, v_new, v_biz, v_merge, s -> 'choice' from jsonb_array_elements(v_snap) s;
  update public.items set visible = false, updated_at = now() where id = any (p_ids);
  if v_live then update public.items set draft = false, visible = true where id = v_new; end if;

  return jsonb_build_object('itemId', v_new, 'mergeId', v_merge, 'expiresAt', v_expires, 'published', v_live);
end $$;

create or replace function public.seller_undo_merge(p_merge uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_biz uuid := public.my_business_id();
  m public.item_merges;
  s jsonb;
begin
  perform public.assert_seller_active();
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select * into m from public.item_merges where id = p_merge and business_id = v_biz for update;
  if not found then raise exception 'merge_not_found' using errcode = 'P0001'; end if;
  if m.undone_at is not null then raise exception 'already_undone' using errcode = 'P0001'; end if;
  if now() > m.expires_at then raise exception 'undo_window_closed' using errcode = 'P0001'; end if;

  for s in select jsonb_array_elements(m.sources) loop
    update public.item_media set item_id = (s ->> 'id')::uuid
      where item_id = m.new_item_id and id = any (array(select jsonb_array_elements_text(s -> 'mediaIds')::uuid));
    update public.items set visible = (s ->> 'visible')::boolean, draft = (s ->> 'draft')::boolean, updated_at = now() where id = (s ->> 'id')::uuid;
  end loop;
  delete from public.item_redirects where merge_id = m.id;
  delete from public.items where id = m.new_item_id;
  update public.item_merges set undone_at = now() where id = m.id;
  return jsonb_build_object('mergeId', m.id, 'restored', jsonb_array_length(m.sources));
end $$;

create or replace function public.public_item_redirect(p_old uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('itemId', r.new_item_id, 'choice', r.choice)
    from public.item_redirects r
    join public.public_items pi on pi.id = r.new_item_id
   where r.old_item_id = p_old
$$;

revoke all on function public.item_similar_parts(text), public.seller_similar_item_groups(), public.seller_merge_items(uuid[], jsonb),
  public.seller_undo_merge(uuid), public.public_item_redirect(uuid) from public, anon, authenticated;
grant execute on function public.item_similar_parts(text) to authenticated, service_role;
grant execute on function public.seller_similar_item_groups(), public.seller_merge_items(uuid[], jsonb), public.seller_undo_merge(uuid) to authenticated, service_role;
grant execute on function public.public_item_redirect(uuid) to anon, authenticated, service_role;
