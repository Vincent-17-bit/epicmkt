-- Denormalised price range and list fields on items. price_min is the lowest price a buyer pays for one unit now, price_high the highest.
-- (items.price_max already exists: it is the seller's "range" top, so the new top is price_high; payloads call it priceMax.)
-- Follows the pricing core (shared/src/pricing.js priceBounds): over the combinations the shop sells (own price, not unavailable), the
-- in-stock ones (available, limited_stock) when there are any, else all of them; each at its price for quantity 1: the first quantity tier
-- if it has tiers, then the lower of the sale price and a live flash sale. Offers are not included. Prices are whole amounts (rounded).
-- An item with no combinations is priced from itself; a "range" item's top is its price_max. Other price types, or no price, are null.
-- Kept by triggers on items, item_variants, flash_sales and product_types, so seller_save_item, bulk edits, the flash sweep and admin
-- changes all keep it right. A flash that starts or ends by the clock shows here when the sweep next runs (within a minute).
-- has_options: the item has option axes (or the older variants list). department_id: the product type's department, null with no type.
-- has_3d: nothing stores a 3D view yet, so it stays false until a later migration sets it.
-- Payloads: public_items gets the columns; products_snapshot gets price_min, price_max, has_price_range, has_options, department_id,
-- product_type_id, has_3d; search_businesses and search_facets filter and sort on the lowest price_min.

alter table public.items add column if not exists price_min numeric(12, 2);
alter table public.items add column if not exists price_high numeric(12, 2);
alter table public.items add column if not exists has_options boolean not null default false;
alter table public.items add column if not exists department_id text;
alter table public.items add column if not exists has_3d boolean not null default false;
alter table public.items drop constraint if exists items_price_range_ck;
alter table public.items add constraint items_price_range_ck check (price_min is null or (price_high is not null and price_min <= price_high));
create index if not exists items_price_min_idx on public.items (price_min) where price_min is not null;
create index if not exists items_department_idx on public.items (department_id) where department_id is not null;

create or replace function public.item_denorm(it public.items) returns table (price_min numeric, price_high numeric, has_options boolean, department_id text)
language plpgsql stable security definer set search_path = public as $$
declare
  f public.flash_sales;
  r record;
  v_has boolean;
  v_listed numeric;
  v_now numeric;
  v_fl numeric;
  v_all numeric[] := '{}';
  v_stocked numeric[] := '{}';
  v_low numeric;
  v_high numeric;
begin
  select * into f from public.flash_sales s
    where s.item_id = it.id and s.status = 'live' and now() >= s.starts_at and now() < s.ends_at
    order by s.starts_at desc limit 1;
  v_has := exists (select 1 from public.item_variants v where v.item_id = it.id);

  if it.price_type in ('fixed', 'from', 'range') then
    for r in
      select round(v.price) as regular, round(v.sale_price) as sale, coalesce(v.price_tiers, it.price_tiers) as tiers, v.combo_key as combo,
             v.status in ('available', 'limited_stock') as stocked
        from public.item_variants v
       where v.item_id = it.id and v.status <> 'unavailable' and v.price is not null
      union all
      select round(it.price), round(it.sale_price), it.price_tiers, null::text, it.availability <> 'out_of_stock'
       where not v_has and it.price is not null
    loop
      v_listed := case when r.tiers is not null then round((r.tiers -> 0 ->> 'unitPrice')::numeric) else r.regular end;
      v_now := v_listed;
      if r.sale is not null and r.sale < v_now then v_now := r.sale; end if;
      if f.id is not null then
        v_fl := public.flash_combo_price(f, r.combo, v_listed);
        if v_fl is not null and v_fl < v_now then v_now := v_fl; end if;
      end if;
      v_all := v_all || v_now;
      if r.stocked then v_stocked := v_stocked || v_now; end if;
    end loop;
    select min(x), max(x) into v_low, v_high from unnest(case when cardinality(v_stocked) > 0 then v_stocked else v_all end) x;
    if v_low is not null and not v_has and it.price_type = 'range' and it.price_max is not null then v_high := greatest(v_high, it.price_max); end if;
  end if;

  return query select
    v_low,
    v_high,
    (jsonb_typeof(it.option_axes) = 'array' and jsonb_array_length(it.option_axes) > 0) or (jsonb_typeof(it.variants) = 'array' and jsonb_array_length(it.variants) > 0),
    (select t.department_id from public.product_types t where t.id = it.product_type_id);
end $$;

create or replace function public.items_denorm_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare d record;
begin
  select * into d from public.item_denorm(new);
  new.price_min := d.price_min;
  new.price_high := d.price_high;
  new.has_options := d.has_options;
  new.department_id := d.department_id;
  return new;
end $$;
drop trigger if exists t_items_denorm on public.items;
create trigger t_items_denorm before insert or update on public.items for each row execute function public.items_denorm_before();

create or replace function public.items_refresh_denorm(p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  it public.items;
  d record;
begin
  for it in select * from public.items where id = any (p_ids) loop
    select * into d from public.item_denorm(it);
    update public.items set price_min = d.price_min, price_high = d.price_high, has_options = d.has_options, department_id = d.department_id
      where id = it.id and (price_min, price_high, has_options, department_id) is distinct from (d.price_min, d.price_high, d.has_options, d.department_id);
  end loop;
end $$;

create or replace function public.item_variants_denorm_ins() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.items_refresh_denorm(array(select distinct n.item_id from new_rows n)); return null; end $$;
create or replace function public.item_variants_denorm_upd() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.items_refresh_denorm(array(select distinct n.item_id from new_rows n)); return null; end $$;
create or replace function public.item_variants_denorm_del() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.items_refresh_denorm(array(select distinct o.item_id from old_rows o)); return null; end $$;
drop trigger if exists t_item_variants_denorm_ins on public.item_variants;
create trigger t_item_variants_denorm_ins after insert on public.item_variants referencing new table as new_rows for each statement execute function public.item_variants_denorm_ins();
drop trigger if exists t_item_variants_denorm_upd on public.item_variants;
create trigger t_item_variants_denorm_upd after update on public.item_variants referencing new table as new_rows for each statement execute function public.item_variants_denorm_upd();
drop trigger if exists t_item_variants_denorm_del on public.item_variants;
create trigger t_item_variants_denorm_del after delete on public.item_variants referencing old table as old_rows for each statement execute function public.item_variants_denorm_del();

create or replace function public.flash_sales_denorm() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.items_refresh_denorm(array[coalesce(new.item_id, old.item_id)]);
  return null;
end $$;
drop trigger if exists t_flash_sales_denorm on public.flash_sales;
create trigger t_flash_sales_denorm after insert or update or delete on public.flash_sales for each row execute function public.flash_sales_denorm();

create or replace function public.product_types_denorm() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.items set department_id = new.department_id where product_type_id = new.id and department_id is distinct from new.department_id;
  return null;
end $$;
drop trigger if exists t_product_types_denorm on public.product_types;
create trigger t_product_types_denorm after update of department_id on public.product_types for each row execute function public.product_types_denorm();

do $$
declare
  it public.items;
  d record;
begin
  for it in select * from public.items loop
    select * into d from public.item_denorm(it);
    update public.items set price_min = d.price_min, price_high = d.price_high, has_options = d.has_options, department_id = d.department_id where id = it.id;
  end loop;
end $$;

revoke all on function public.item_denorm(public.items), public.items_refresh_denorm(uuid[]) from public, anon, authenticated;
grant execute on function public.item_denorm(public.items), public.items_refresh_denorm(uuid[]) to service_role;

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
    where coalesce(x.e ->> 'stock', '') <> '0'), '[]'::jsonb) as variants,
  i.price_min, i.price_high, i.has_options, i.department_id, i.product_type_id, i.has_3d
from public.items i
join public.businesses b on b.id = i.business_id
where public.business_is_visible(b) and i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin
  and public.item_is_listed(i.availability);
revoke all on public.public_items from public;
grant select on public.public_items to anon, authenticated, service_role;

do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'products_snapshot';
  if position('i.price_min' in v_def) = 0 then
    v_new := replace(v_def, 'i.brand, nullif(i.video_paths', 'i.brand, i.price_min, i.price_high, i.has_options, i.department_id, i.product_type_id, i.has_3d, nullif(i.video_paths');
    if v_new = v_def then raise exception 'products_snapshot: capped column list not found'; end if;
    v_def := v_new;
    v_new := replace(v_def, 'k.image_path, k.brand, k.video_paths,', 'k.image_path, k.brand, k.video_paths, k.price_min, k.price_high as price_max, k.price_min < k.price_high as has_price_range, k.has_options, k.department_id, k.product_type_id, k.has_3d,');
    if v_new = v_def then raise exception 'products_snapshot: item column list not found'; end if;
    execute v_new;
  end if;

  select pg_get_functiondef(p.oid) into strict v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'search_businesses';
  if position('min(i.price) as from_price' in v_def) > 0 then
    execute replace(v_def, 'min(i.price) as from_price', 'min(coalesce(i.price_min, i.price)) as from_price');
  end if;

  select pg_get_functiondef(p.oid) into strict v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'search_facets';
  if position('min(i.price) as from_price' in v_def) > 0 then
    execute replace(v_def, 'min(i.price) as from_price', 'min(coalesce(i.price_min, i.price)) as from_price');
  end if;
end $$;
