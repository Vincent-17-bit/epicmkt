-- 0041_browse_snapshot.sql
-- The browse endpoint (client/api/browse.js) needs the whole public catalog once, not once per visitor.
-- Before this, building that snapshot meant paging through public_businesses (select *), public_items, public_flash_sales
-- and public_offers, up to 20 requests of 1,000 rows each. This function returns the same information in ONE round trip
-- and only the columns browsing uses: the heavy ones (socials, amenities, payment methods, delivery area, address) stay out,
-- and the per-item rows collapse into one lowest price per business.
--
-- It reads only the public views, as the caller (anon), so it can show nothing a visitor could not already read.
-- Nothing is written. The endpoint falls back to paging the views if this function is missing or too slow.

create or replace function public.browse_snapshot() returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'businesses', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.id)
      from (
        select id, slug, name, category_id, plan_key, verification_level, tagline, description,
               phone, whatsapp, county, town, lat, lng, logo_path, cover_path, tags, hours, created_at, exceptions
        from public.public_businesses
      ) x), '[]'::jsonb),
    'prices', coalesce((
      select jsonb_object_agg(q.business_id, q.lowest)
      from (
        select business_id, min(price) as lowest
        from public.public_items
        where price is not null and price_type in ('fixed', 'from', 'range')
        group by business_id
      ) q), '{}'::jsonb),
    'flash', coalesce((
      select jsonb_object_agg(q.business_id, q.ends)
      from (select business_id, jsonb_agg(ends_at) as ends from public.public_flash_sales group by business_id) q), '{}'::jsonb),
    -- An offer with no end date runs until the seller turns it off: its end is null here.
    'offers', coalesce((
      select jsonb_object_agg(q.business_id, q.ends)
      from (select business_id, jsonb_agg(ends_at) as ends from public.public_offers group by business_id) q), '{}'::jsonb),
    'categories', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.sort)
      from (select id, name, icon, sort, active from public.categories where active) c), '[]'::jsonb)
  );
$$;

revoke all on function public.browse_snapshot() from public;
grant execute on function public.browse_snapshot() to anon, authenticated, service_role;
