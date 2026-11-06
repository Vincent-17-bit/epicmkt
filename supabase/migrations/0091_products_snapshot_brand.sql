-- 0091_products_snapshot_brand.sql
-- The home products snapshot carries each item's brand, so the buyer's Brand filter can offer one choice per brand
-- ("Samsung", "SAMSUNG" and "samsung" are one choice: the client groups by normalizeValueKey, see 0090_option_values.sql).
-- Same function as migration 004600_item_availability.sql with one extra column, `brand`, from public_items (which has had it since 0050).
-- Nothing else changes: the signature, the paging and every other column are as before.

create or replace function public.products_snapshot(p_limit int default 10000) returns jsonb
language sql stable set search_path = public as $$
  with capped as (
    select i.id, i.business_id, i.name, left(i.description, 160) as description, i.section, i.price, i.price_type,
           i.unit, i.availability, i.stock_left, i.brand, i.created_at, i.image_paths ->> 0 as image_path
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
        select k.id, k.business_id, k.name, k.description, k.section, k.price, k.price_type, k.unit, k.availability, k.stock_left, k.brand,
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
