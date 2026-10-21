-- 0035_public_exceptions.sql
-- Customers see opening-hours exceptions (closed days, special hours) so "open now" and "opens at" are right.
-- Only the public fields of today and upcoming dates leave the database: id, date, kind, intervals, note.
-- Past dates are dropped here as well, so an old exception never reaches a customer even if it is still stored.
-- The businesses table itself stays closed to anon; these two views are the only way in.

create or replace function public.public_exceptions(p_list jsonb) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(
    (select jsonb_agg(jsonb_build_object('id', e -> 'id', 'date', e -> 'date', 'kind', e -> 'kind', 'intervals', coalesce(e -> 'intervals', '[]'::jsonb), 'note', e -> 'note') order by e ->> 'date')
       from jsonb_array_elements(case when jsonb_typeof(p_list) = 'array' then p_list else '[]'::jsonb end) e
      where e ->> 'date' ~ '^\d{4}-\d{2}-\d{2}$'
        and (e ->> 'date')::date >= public.nairobi_day(now())),
    '[]'::jsonb);
$$;
revoke all on function public.public_exceptions(jsonb) from public;
grant execute on function public.public_exceptions(jsonb) to anon, authenticated, service_role;

-- New columns go last so the existing view definitions stay valid.
create or replace view public.public_businesses with (security_barrier = true) as
select
  b.id, b.slug, b.name, b.category_id, b.plan_key, b.verification_level, b.tagline, b.description,
  b.phone, b.whatsapp, b.socials, b.amenities, b.payment_methods, b.delivery_area,
  b.county, b.town, b.address, b.lat, b.lng, b.logo_path, b.cover_path, b.tags, b.hours, b.created_at,
  public.public_exceptions(b.exceptions) as exceptions
from public.businesses b
where public.business_is_visible(b);
revoke all on public.public_businesses from public;
grant select on public.public_businesses to anon, authenticated, service_role;

-- Flash cards show an open/closed chip from the business hours, so they need the exceptions too.
create or replace view public.public_flash_sales with (security_barrier = true) as
select
  s.id, s.business_id, s.item_id, s.headline, s.starts_at, s.ends_at,
  s.discount_type, s.discount_value, s.variant_overrides, s.quantity_note,
  i.name as item_name, i.description as item_description, i.section as item_section,
  i.price_type as item_price_type, i.unit as item_unit, i.availability as item_availability,
  (select m.path from public.item_media m where m.item_id = i.id and m.kind = 'image' order by m.sort, m.created_at limit 1) as item_image_path,
  i.price as regular_price,
  d.p as sale_price,
  i.price - d.p as savings,
  case when i.price > 0 then round((i.price - d.p) / i.price * 100) else 0 end as discount_percent,
  b.slug as business_slug, b.name as business_name, b.category_id as business_category_id,
  b.town as business_town, b.county as business_county, b.lat as business_lat, b.lng as business_lng,
  b.phone as business_phone, b.whatsapp as business_whatsapp, b.logo_path as business_logo_path,
  b.verification_level as business_verification_level, b.hours as business_hours,
  now() as server_now,
  floor(extract(epoch from (s.ends_at - now())) * 1000)::bigint as remaining_ms,
  public.public_exceptions(b.exceptions) as business_exceptions
from public.flash_sales s
join public.items i on i.id = s.item_id
join public.businesses b on b.id = s.business_id
cross join lateral (select public.flash_discounted_price(s.discount_type, s.discount_value, i.price) as p) d
where s.status in ('scheduled','live')
  and now() >= s.starts_at
  and now() < s.ends_at
  and public.business_is_visible(b)
  and i.visible and not i.hidden_by_admin and not i.removed_by_admin
  and i.availability not in ('out_of_stock','unavailable')
  and i.price is not null and i.price_type in ('fixed','from')
  and d.p > 0 and d.p < i.price;
revoke all on public.public_flash_sales from public;
grant select on public.public_flash_sales to anon, authenticated, service_role;
