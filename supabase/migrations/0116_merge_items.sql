-- 0116_merge_items.sql
-- Combine similar items (Bread 400g, Bread 800g) into one item with options, keep the old links working, and undo within 24 hours.
--
--   item_merges            one row per merge: the target item, the source items and a snapshot to undo from.
--   item_redirects         an old item id -> the combined item and the choice to preselect. Dropped on undo.
--   item_similar_key(text) the key two names share when they differ only by size, unit or colour (shared/src/mergeItems.js is the same rule).
--   seller_similar_item_groups()          groups of two or more of the shop's own items that share a key (and a product type), no options yet.
--   seller_merge_items(ids, spec)         the FIRST id becomes the combined item (it keeps its photos, reviews and link); every other id is hidden
--                                         and redirected. spec: { name, axes: [{ key, label, display?, labels: { <itemId>: "400 g" } }] } (1 or 2 axes).
--                                         Each item becomes one sellable combination with its own price, sale price and stock; other combinations
--                                         stay unavailable. Photos of the hidden items are not moved.
--   seller_undo_merge(merge)              restores both sides, only inside the window and only if the combined item still has the merged options.
--   seller_recent_merges()                the merges that can still be undone.
--   public_item_redirect(item)            for a hidden old id: { itemId, choice } of the combined item, null when there is none or it is not public.
-- Merges never cross shops: every id must belong to the caller's shop.

create or replace function public.item_similar_key(p_name text) returns text
language sql immutable parallel safe as $$
  select coalesce(string_agg(w, ' ' order by n), '')
  from regexp_split_to_table(
         regexp_replace(lower(coalesce(p_name, '')), '\d+([.,]\d+)?\s*(kgs?|kilograms?|grams?|gm|g|mg|ml|litres?|liters?|ltr|l|cl|oz|lb)\y', ' ', 'g'),
         '[^a-z0-9]+') with ordinality as t(w, n)
  where w <> '' and w !~ '\d'
    and w <> all (array['kg','kgs','g','gm','gram','grams','kilogram','kilograms','mg','ml','l','ltr','litre','litres','liter','liters','cl','oz','lb','x',
                        'black','white','brown','red','blue','green','yellow','pink','purple','orange','grey','gray','silver','gold','beige','navy','maroon'])
$$;

create table if not exists public.item_merges (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  target_id uuid not null references public.items (id) on delete cascade,
  source_ids uuid[] not null,
  merged_axes jsonb not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  undone_at timestamptz
);
create index if not exists item_merges_business_idx on public.item_merges (business_id, created_at desc);

create table if not exists public.item_redirects (
  old_item_id uuid primary key references public.items (id) on delete cascade,
  new_item_id uuid not null references public.items (id) on delete cascade,
  merge_id uuid not null references public.item_merges (id) on delete cascade,
  choice jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (old_item_id <> new_item_id)
);
create index if not exists item_redirects_new_idx on public.item_redirects (new_item_id);

alter table public.item_merges enable row level security;
alter table public.item_redirects enable row level security;
revoke all on public.item_merges, public.item_redirects from public, anon, authenticated;
grant all on public.item_merges, public.item_redirects to service_role;

create or replace function public.seller_similar_item_groups() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
begin
  perform public.assert_seller_active();
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('key', g.k, 'productTypeId', g.pt,
             'items', (select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'price', x.price, 'salePrice', x.sale_price, 'productTypeId', x.product_type_id) order by x.name, x.id)
                         from public.items x where x.business_id = v_id and x.id = any (g.ids))) order by g.k)
    from (
      select public.item_similar_key(i.name) as k, i.product_type_id as pt, array_agg(i.id) as ids
      from public.items i
      where i.business_id = v_id and not i.removed_by_admin and not i.draft and i.option_axes = '[]'::jsonb
        and not exists (select 1 from public.item_redirects r where r.old_item_id = i.id)
        and i.visible
      group by 1, 2
      having public.item_similar_key(i.name) <> '' and count(*) > 1
    ) g), '[]'::jsonb);
end $$;

create or replace function public.item_value_slug(p_label text) returns text
language sql immutable parallel safe as $$
  select left(trim(both '-' from regexp_replace(lower(btrim(coalesce(p_label, ''))), '[^a-z0-9]+', '-', 'g')), 40)
$$;

create or replace function public.seller_merge_items(p_ids uuid[], p_spec jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_biz uuid := public.my_business_id();
  v_name text := btrim(coalesce(p_spec ->> 'name', ''));
  v_axes_in jsonb := p_spec -> 'axes';
  v_axes jsonb := '[]'::jsonb;
  v_axis jsonb;
  v_target public.items;
  v_item public.items;
  v_id uuid;
  v_label text;
  v_vid text;
  v_values jsonb;
  v_choice jsonb;
  v_key text;
  v_keys text[] := '{}';
  v_choices jsonb := '{}'::jsonb;
  v_merge uuid := gen_random_uuid();
  v_n integer;
  v_snap jsonb;
  v_ord integer := 0;
  v_stock integer;
begin
  perform public.assert_seller_active();
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  v_n := coalesce(cardinality(p_ids), 0);
  if v_n < 2 or v_n > 12 or (select count(distinct x) from unnest(p_ids) x) <> v_n then raise exception 'invalid_items' using errcode = 'P0001'; end if;
  if char_length(v_name) not between 2 and 120 then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  if v_axes_in is null or jsonb_typeof(v_axes_in) <> 'array' or jsonb_array_length(v_axes_in) not between 1 and 2 then raise exception 'invalid_axes' using errcode = 'P0001'; end if;

  -- Every item: the caller's own, public-ready, without options, not already merged away. Locked so two merges cannot overlap.
  for v_id in select x from unnest(p_ids) x loop
    select * into v_item from public.items where id = v_id for update;
    if not found or v_item.business_id <> v_biz or v_item.removed_by_admin then raise exception 'item_not_found' using errcode = 'P0001'; end if;
    if v_item.option_axes <> '[]'::jsonb or exists (select 1 from public.item_variants where item_id = v_id) then raise exception 'has_options' using errcode = 'P0001'; end if;
    if v_item.draft then raise exception 'item_is_draft' using errcode = 'P0001'; end if;
    if v_item.price is null then raise exception 'price_required' using errcode = 'P0001'; end if;
    if exists (select 1 from public.item_redirects where old_item_id = v_id) then raise exception 'already_merged' using errcode = 'P0001'; end if;
  end loop;

  -- Axes: a value for each distinct label, in the order the items were given.
  for v_axis in select jsonb_array_elements(v_axes_in) loop
    if jsonb_typeof(v_axis) <> 'object' or not public.option_slug_ok(v_axis -> 'key', 30) or btrim(coalesce(v_axis ->> 'label', '')) = ''
       or jsonb_typeof(v_axis -> 'labels') is distinct from 'object' then raise exception 'invalid_axes' using errcode = 'P0001'; end if;
    if (v_axis ->> 'key') = any (select a ->> 'key' from jsonb_array_elements(v_axes) a) then raise exception 'invalid_axes' using errcode = 'P0001'; end if;
    v_values := '[]'::jsonb;
    foreach v_id in array p_ids loop
      v_label := btrim(coalesce(v_axis -> 'labels' ->> v_id::text, ''));
      if v_label = '' or char_length(v_label) > 40 then raise exception 'invalid_label' using errcode = 'P0001'; end if;
      v_vid := public.item_value_slug(v_label);
      if v_vid = '' then raise exception 'invalid_label' using errcode = 'P0001'; end if;
      if not exists (select 1 from jsonb_array_elements(v_values) e where e ->> 'id' = v_vid) then
        v_values := v_values || jsonb_build_array(jsonb_build_object('id', v_vid, 'label', v_label));
      end if;
    end loop;
    v_axes := v_axes || jsonb_build_array(jsonb_build_object('key', v_axis ->> 'key', 'label', btrim(v_axis ->> 'label'),
      'display', case when coalesce(v_axis ->> 'display', 'button') in ('swatch', 'image-card', 'button', 'dropdown', 'text-card') then coalesce(v_axis ->> 'display', 'button') else 'button' end,
      'values', v_values));
  end loop;

  -- One combination per item, and no two items on the same combination.
  foreach v_id in array p_ids loop
    v_choice := '{}'::jsonb;
    for v_axis in select jsonb_array_elements(v_axes_in) loop
      v_choice := v_choice || jsonb_build_object(v_axis ->> 'key', public.item_value_slug(btrim(v_axis -> 'labels' ->> v_id::text)));
    end loop;
    v_key := public.item_option_combo_key(v_axes, v_choice);
    if v_key is null or v_key = any (v_keys) then raise exception 'duplicate_combination' using errcode = 'P0001'; end if;
    v_keys := v_keys || v_key;
    v_choices := v_choices || jsonb_build_object(v_id::text, v_choice);
  end loop;

  select * into v_target from public.items where id = p_ids[1];
  v_snap := jsonb_build_object('name', v_target.name, 'optionAxes', v_target.option_axes, 'sources', (
    select jsonb_agg(jsonb_build_object('id', i.id, 'visible', i.visible)) from public.items i where i.id = any (p_ids[2:v_n])));

  insert into public.item_merges (id, business_id, target_id, source_ids, merged_axes, snapshot)
    values (v_merge, v_biz, p_ids[1], p_ids[2:v_n], v_axes, v_snap);

  foreach v_id in array p_ids loop
    select * into v_item from public.items where id = v_id;
    v_ord := v_ord + 1;
    v_choice := v_choices -> v_id::text;
    v_stock := case when v_item.track_stock then v_item.stock_count else null end;
    insert into public.item_variants (item_id, business_id, combo_key, choice, price, sale_price, stock_count, status, sort)
      values (p_ids[1], v_biz, public.item_option_combo_key(v_axes, v_choice), v_choice, v_item.price,
              case when v_item.sale_price is not null and v_item.sale_price < v_item.price then v_item.sale_price end,
              v_stock, v_item.availability, v_ord);
    if v_id <> p_ids[1] then
      update public.items set visible = false, updated_at = now() where id = v_id;
      insert into public.item_redirects (old_item_id, new_item_id, merge_id, choice) values (v_id, p_ids[1], v_merge, v_choice);
    end if;
  end loop;
  update public.items set name = v_name, option_axes = v_axes, updated_at = now() where id = p_ids[1];

  return jsonb_build_object('mergeId', v_merge, 'itemId', p_ids[1], 'expiresAt', (select expires_at from public.item_merges where id = v_merge));
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
  if now() > m.expires_at then raise exception 'merge_expired' using errcode = 'P0001'; end if;
  if (select option_axes from public.items where id = m.target_id) is distinct from m.merged_axes then raise exception 'merge_edited' using errcode = 'P0001'; end if;
  delete from public.item_variants where item_id = m.target_id;
  update public.items set name = m.snapshot ->> 'name', option_axes = m.snapshot -> 'optionAxes', updated_at = now() where id = m.target_id;
  for s in select jsonb_array_elements(m.snapshot -> 'sources') loop
    update public.items set visible = (s ->> 'visible')::boolean, updated_at = now() where id = (s ->> 'id')::uuid;
  end loop;
  delete from public.item_redirects where merge_id = m.id;
  update public.item_merges set undone_at = now() where id = m.id;
  return jsonb_build_object('itemId', m.target_id, 'restored', cardinality(m.source_ids) + 1);
end $$;

create or replace function public.seller_recent_merges() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_biz uuid := public.my_business_id();
begin
  perform public.assert_seller_active();
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', m.id, 'itemId', m.target_id, 'name', (select name from public.items where id = m.target_id),
             'count', cardinality(m.source_ids) + 1, 'createdAt', m.created_at, 'expiresAt', m.expires_at) order by m.created_at desc)
    from public.item_merges m where m.business_id = v_biz and m.undone_at is null and m.expires_at > now()), '[]'::jsonb);
end $$;

create or replace function public.public_item_redirect(p_item uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('itemId', r.new_item_id, 'choice', r.choice,
           -- The same text as the buyer's ?v= link: value ids in axis order, joined by dots ("400-g.white").
           'param', (select string_agg(r.choice ->> (a.e ->> 'key'), '.' order by a.n)
                       from public.items t, jsonb_array_elements(t.option_axes) with ordinality as a(e, n) where t.id = r.new_item_id))
  from public.item_redirects r
  where r.old_item_id = p_item and exists (select 1 from public.public_items pi where pi.id = r.new_item_id)
$$;

revoke all on function public.seller_similar_item_groups(), public.seller_merge_items(uuid[], jsonb), public.seller_undo_merge(uuid), public.seller_recent_merges() from public, anon;
grant execute on function public.seller_similar_item_groups(), public.seller_merge_items(uuid[], jsonb), public.seller_undo_merge(uuid), public.seller_recent_merges() to authenticated, service_role;
revoke all on function public.public_item_redirect(uuid) from public;
grant execute on function public.public_item_redirect(uuid) to anon, authenticated, service_role;
