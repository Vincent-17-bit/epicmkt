-- Each shop keeps its opening hours in its own time zone (an IANA name such as Asia/Kolkata). Until now every shop was
-- read as Africa/Nairobi. Existing shops keep that value, so nothing changes for them.
--
--   * businesses.timezone: validated against the database's own zone list on every insert or change of the value.
--   * hours_open_in(hours, exceptions, at, tz): hours_open for any zone. hours_open stays and means Africa/Nairobi.
--   * public_businesses exposes timezone (last column, so the view can be replaced in place).
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
