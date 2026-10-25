-- 0043_products_snapshot.sql
-- The home page "all products" grid (client/api/products.js) needs the public product list once per cache window, not
-- once per visitor. Before this, every visitor's browser paged through public_items with select * (up to 20 requests of
-- 1,000 rows, with every image path and video path of every item) plus public_businesses.
--
-- This function returns the same information in ONE round trip and only what the grid and its filters use:
--   * per item: id, store, name, a 160 character description (search only), section, price, price type, unit,
--     availability, created_at, the FIRST image path, and the running flash sale (if any), already priced by the database;
--   * per store: only the columns the card, the filters and the open/closed status need.
-- Items are newest first and capped, so one runaway seller can never make the snapshot unbounded. 'truncated' says so.
--
-- It reads only the public views as the caller (anon): it can show nothing a visitor could not already read.
-- Nothing is written. The endpoint falls back to paging the views if this function is missing or too slow.

create or replace function public.products_snapshot(p_limit int default 10000) returns jsonb
language sql stable set search_path = public as $$
  with capped as (
    select i.id, i.business_id, i.name, left(i.description, 160) as description, i.section, i.price, i.price_type,
           i.unit, i.availability, i.created_at, i.image_paths ->> 0 as image_path
    from public.public_items i
    order by i.created_at desc, i.id
    limit least(greatest(coalesce(p_limit, 10000), 1), 50000) + 1
  ), kept as (
    select * from capped order by created_at desc, id limit least(greatest(coalesce(p_limit, 10000), 1), 50000)
  )
  select jsonb_build_object(
    'truncated', (select count(*) from capped) > least(greatest(coalesce(p_limit, 10000), 1), 50000),
    'items', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id)
      from (
        select k.id, k.business_id, k.name, k.description, k.section, k.price, k.price_type, k.unit, k.availability,
               k.created_at, k.image_path,
               f.id as sale_id, f.sale_price, f.starts_at as sale_starts_at, f.ends_at as sale_ends_at, f.headline as sale_headline
        from kept k
        left join lateral (
          select s.id, s.sale_price, s.starts_at, s.ends_at, s.headline
          from public.public_flash_sales s
          where s.item_id = k.id
          order by s.sale_price asc, s.id
          limit 1
        ) f on true
      ) x), '[]'::jsonb),
    'businesses', coalesce((
      select jsonb_agg(to_jsonb(b))
      from (
        select id, slug, name, plan_key, verification_level, category_id, town, county, hours, exceptions
        from public.public_businesses
        where id in (select business_id from kept)
      ) b), '[]'::jsonb)
  );
$$;

revoke all on function public.products_snapshot(int) from public;
grant execute on function public.products_snapshot(int) to anon, authenticated, service_role;

-- Supports the newest-first scan above on the table behind the public view.
create index if not exists items_created_at_id_idx on public.items (created_at desc, id);
