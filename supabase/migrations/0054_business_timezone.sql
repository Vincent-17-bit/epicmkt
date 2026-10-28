-- Each shop keeps its opening hours in its own time zone (an IANA name such as Asia/Kolkata). Until now every shop was
-- read as Africa/Nairobi. Existing shops keep that value, so nothing changes for them.
--
--   * businesses.timezone: validated against the database's own zone list on every insert or change of the value.
--   * hours_open_in(hours, exceptions, at, tz): hours_open for any zone. hours_open stays and means Africa/Nairobi.
--   * public_businesses exposes timezone (last column, so the view can be replaced in place).
--   * public_flash_sales, browse_snapshot and products_snapshot carry the shop's timezone next to its hours.
--   * search_businesses reads "open now" and "is_open" in each shop's zone instead of Nairobi's.

alter table public.businesses add column if not exists timezone text not null default 'Africa/Nairobi';

create or replace function public.businesses_check_timezone() returns trigger
language plpgsql as $$
begin
  if new.timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'unknown time zone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists businesses_check_timezone on public.businesses;
create trigger businesses_check_timezone before insert or update of timezone on public.businesses
  for each row execute function public.businesses_check_timezone();

create or replace function public.hours_open_in(p_hours jsonb, p_exceptions jsonb, p_at timestamptz, p_tz text) returns boolean
language plpgsql stable as $$
declare
  v_local timestamp := p_at at time zone coalesce(nullif(p_tz, ''), 'Africa/Nairobi');
  v_date date := v_local::date;
  v_min integer := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
  v_iv jsonb;
  v_start integer;
  v_end integer;
begin
  for v_iv in select jsonb_array_elements(public.hours_intervals_on(p_hours, p_exceptions, v_date)) loop
    v_start := split_part(v_iv ->> 0, ':', 1)::int * 60 + split_part(v_iv ->> 0, ':', 2)::int;
    v_end := split_part(v_iv ->> 1, ':', 1)::int * 60 + split_part(v_iv ->> 1, ':', 2)::int;
    if v_end > v_start then
      if v_min >= v_start and v_min < v_end then return true; end if;
    elsif v_min >= v_start then
      return true;
    end if;
  end loop;
  if coalesce(public.hours_exception_on(p_exceptions, v_date) ->> 'kind', '') <> 'closed' then
    for v_iv in select jsonb_array_elements(public.hours_intervals_on(p_hours, p_exceptions, v_date - 1)) loop
      v_start := split_part(v_iv ->> 0, ':', 1)::int * 60 + split_part(v_iv ->> 0, ':', 2)::int;
      v_end := split_part(v_iv ->> 1, ':', 1)::int * 60 + split_part(v_iv ->> 1, ':', 2)::int;
      if v_end <= v_start and v_end > 0 and v_min < v_end then return true; end if;
    end loop;
  end if;
  return false;
end $$;

grant execute on function public.hours_open_in(jsonb, jsonb, timestamptz, text) to anon, authenticated, service_role;

create or replace view public.public_businesses with (security_barrier = true) as
select
  b.id, b.slug, b.name, b.category_id, b.plan_key, b.verification_level, b.tagline, b.description,
  b.phone, b.whatsapp, b.socials, b.amenities, b.payment_methods, b.delivery_area,
  b.county, b.town, b.address, b.lat, b.lng, b.logo_path, b.cover_path, b.tags, b.hours, b.created_at,
  public.public_exceptions(b.exceptions) as exceptions,
  (select count(*)::integer from public.items i
    where i.business_id = b.id and i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin
      and public.item_is_listed(i.availability)) as product_count,
  b.timezone
from public.businesses b
where public.business_is_visible(b);
revoke all on public.public_businesses from public;
grant select on public.public_businesses to anon, authenticated, service_role;

-- Patch search_businesses in place: two literal replacements, and the migration fails loudly if either text is not found
-- (rather than silently leaving Nairobi's clock in the search).
do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into strict v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'search_businesses';
  v_def := pg_get_functiondef(v_oid);
  if position('hours_open_in(' in v_def) > 0 then return; end if; -- already patched: the migration can be re-run
  v_new := replace(v_def,
    'public.hours_open(pb.hours, pb.exceptions, v_now)',
    'public.hours_open_in(pb.hours, pb.exceptions, v_now, b.timezone)');
  if v_new = v_def then raise exception 'search_businesses: open-now clause not found'; end if;
  v_def := v_new;
  v_new := replace(v_def,
    'public.hours_open(hours, exceptions, v_now)',
    'public.hours_open_in(hours, exceptions, v_now, (select bb.timezone from public.businesses bb where bb.id = ranked.id))');
  if v_new = v_def then raise exception 'search_businesses: is_open clause not found'; end if;
  execute v_new;
end $$;

-- Flash sale cards show an open/closed chip from the shop's hours, so the view carries the shop's zone too (last column).
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
  public.public_exceptions(b.exceptions) as business_exceptions,
  b.timezone as business_timezone
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

-- The two snapshot functions list the business columns they return. Add timezone by literal replacement; fail loudly
-- if the text is not found, so a snapshot can never silently go without it.
do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'browse_snapshot';
  if position('exceptions, timezone' in v_def) = 0 then
    v_new := replace(v_def, 'tags, hours, created_at, exceptions', 'tags, hours, created_at, exceptions, timezone');
    if v_new = v_def then raise exception 'browse_snapshot: business column list not found'; end if;
    execute v_new;
  end if;

  select pg_get_functiondef(p.oid) into strict v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'products_snapshot';
  if position('exceptions, timezone' in v_def) = 0 then
    v_new := replace(v_def, 'category_id, town, county, hours, exceptions', 'category_id, town, county, hours, exceptions, timezone');
    if v_new = v_def then raise exception 'products_snapshot: business column list not found'; end if;
    execute v_new;
  end if;
end $$;

-- A seller sets the zone their shop's clock is in. Hours and exceptions are wall-clock times in this zone, so changing it
-- moves them with the shop; it is audited like any profile change.
create or replace function public.seller_set_timezone(p_timezone text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_tz text := btrim(coalesce(p_timezone, ''));
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  perform public.assert_seller_active();
  if v_tz = '' or not exists (select 1 from pg_catalog.pg_timezone_names where name = v_tz) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;
  update public.businesses set timezone = v_tz where id = v_id;
  perform public.write_audit(v_id, 'timezone_changed', 'business', v_id::text, jsonb_build_object('timezone', v_tz));
  return v_tz;
end $$;
revoke all on function public.seller_set_timezone(text) from public, anon;
grant execute on function public.seller_set_timezone(text) to authenticated, service_role;
