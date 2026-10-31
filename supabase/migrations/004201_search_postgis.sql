create extension if not exists postgis with schema extensions;
create extension if not exists unaccent with schema extensions;

alter table public.businesses
  add column if not exists geo extensions.geography(Point, 4326)
  generated always as (
    case when lat between -90 and 90 and lng between -180 and 180
      then extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography
    end
  ) stored;
create index if not exists businesses_geo_idx on public.businesses using gist (geo);

create or replace function public.search_norm(p_text text) returns text
language sql stable set search_path = public, extensions as $$
  select btrim(regexp_replace(regexp_replace(lower(extensions.unaccent(coalesce(p_text, ''))), '[^a-z0-9_[:space:]]', ' ', 'g'), '[[:space:]]+', ' ', 'g'))
$$;

create or replace function public.search_tokens(p_query text) returns text[]
language sql stable set search_path = public, extensions as $$
  select coalesce((string_to_array(public.search_norm(left(coalesce(p_query, ''), 200)), ' '))[1:8], '{}'::text[])
$$;

create or replace function public.hours_interval_ok(p jsonb) returns boolean
language sql immutable as $$
  select case
    when jsonb_typeof(p) = 'array' and jsonb_array_length(p) = 2 and jsonb_typeof(p -> 0) = 'string' and jsonb_typeof(p -> 1) = 'string'
      then (p ->> 0) ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and (p ->> 1) ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    else false
  end
$$;

create or replace function public.hours_exception_on(p_exceptions jsonb, p_date date) returns jsonb
language sql immutable as $$
  select e
  from jsonb_array_elements(case when jsonb_typeof(p_exceptions) = 'array' then p_exceptions else '[]'::jsonb end) with ordinality t(e, i)
  where jsonb_typeof(e) = 'object' and e ->> 'date' = p_date::text and e ->> 'kind' in ('closed', 'special')
  order by i
  limit 1
$$;

create or replace function public.hours_intervals_on(p_hours jsonb, p_exceptions jsonb, p_date date) returns jsonb
language plpgsql immutable as $$
declare
  v_ex jsonb := public.hours_exception_on(p_exceptions, p_date);
  v_slot jsonb;
begin
  if v_ex is not null then
    if v_ex ->> 'kind' = 'special' and jsonb_typeof(v_ex -> 'intervals') = 'array' then
      return coalesce((select jsonb_agg(iv) from jsonb_array_elements(v_ex -> 'intervals') iv where public.hours_interval_ok(iv)), '[]'::jsonb);
    end if;
    return '[]'::jsonb;
  end if;
  v_slot := case when jsonb_typeof(p_hours) = 'object' then p_hours -> (array['sun','mon','tue','wed','thu','fri','sat'])[extract(dow from p_date)::int + 1] end;
  if v_slot is not null and public.hours_interval_ok(v_slot) then
    return jsonb_build_array(v_slot);
  end if;
  return '[]'::jsonb;
end $$;

create or replace function public.hours_open(p_hours jsonb, p_exceptions jsonb, p_at timestamptz default now()) returns boolean
language plpgsql immutable as $$
declare
  v_local timestamp := p_at at time zone 'Africa/Nairobi';
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

create or replace function public.search_businesses(
  p_query text default '',
  p_category text default null,
  p_county text default null,
  p_town text default null,
  p_open_now boolean default false,
  p_verified boolean default false,
  p_featured boolean default false,
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_km double precision default null,
  p_min_price numeric default null,
  p_max_price numeric default null,
  p_sort text default 'relevance',
  p_seed text default '',
  p_page integer default 1,
  p_page_size integer default 12
) returns jsonb
language plpgsql stable security definer set search_path = public, extensions set statement_timeout = '3s' as $$
declare
  v_tokens text[] := public.search_tokens(p_query);
  v_size integer := least(100, greatest(1, coalesce(p_page_size, 12)));
  v_page integer := greatest(1, coalesce(p_page, 1));
  v_sort text := case when p_sort in ('relevance', 'distance', 'newest', 'price_asc', 'price_desc') then p_sort when p_sort = 'rating' then 'newest' else 'relevance' end;
  v_origin extensions.geography := case when p_lat between -90 and 90 and p_lng between -180 and 180
    then extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography end;
  v_now timestamptz := now();
  v_seed text := left(coalesce(p_seed, ''), 40);
  v_out jsonb;
begin
  with base as (
    select
      to_jsonb(pb) as doc,
      pb.id,
      pb.created_at,
      (pb.plan_key = 'premium') as premium,
      case when v_origin is not null and b.geo is not null then extensions.st_distance(b.geo, v_origin) / 1000.0 end as dist,
      pr.from_price,
      pb.hours,
      pb.exceptions,
      n.name_text, n.tag_text, n.cat_text, n.area_text, n.body_text
    from public.public_businesses pb
    join public.businesses b on b.id = pb.id
    left join public.categories c on c.id = pb.category_id
    cross join lateral (
      select
        public.search_norm(pb.name) as name_text,
        public.search_norm(array_to_string(pb.tags, ' ')) as tag_text,
        public.search_norm(c.name) as cat_text,
        public.search_norm(coalesce(pb.town, '') || ' ' || coalesce(pb.county, '')) as area_text,
        public.search_norm(coalesce(pb.tagline, '') || ' ' || coalesce(pb.description, '')) as body_text
    ) n
    left join lateral (
      select min(i.price) as from_price
      from public.public_items i
      where i.business_id = pb.id and i.price_type in ('fixed', 'from', 'range') and i.price is not null
    ) pr on true
    where (p_category is null or pb.category_id = p_category)
      and (p_county is null or pb.county = p_county)
      and (p_town is null or replace(public.search_norm(pb.town), ' ', '-') = p_town)
      and (not coalesce(p_verified, false) or pb.verification_level = 'verified')
      and (not coalesce(p_featured, false) or pb.plan_key = 'premium')
      and (v_origin is null or p_radius_km is null or p_radius_km <= 0
           or (b.geo is not null and extensions.st_dwithin(b.geo, v_origin, p_radius_km * 1000.0)))
      and (not coalesce(p_open_now, false) or public.hours_open(pb.hours, pb.exceptions, v_now))
  ),
  scored as (
    select base.*,
      coalesce((
        select case when bool_or(w is null) then -1 else sum(w) end
        from (
          select greatest(
            case when strpos(base.name_text, t) > 0 then 5 end,
            case when strpos(base.tag_text, t) > 0 then 4 end,
            case when strpos(base.cat_text, t) > 0 then 3 end,
            case when strpos(base.area_text, t) > 0 then 2 end,
            case when strpos(base.body_text, t) > 0 then 1 end
          ) as w
          from unnest(v_tokens) t
        ) x
      ), 0) as score
    from base
  ),
  matched as (
    select * from scored
    where score >= 0
      and (p_min_price is null or (from_price is not null and from_price >= p_min_price))
      and (p_max_price is null or (from_price is not null and from_price <= p_max_price))
  ),
  ranked as (
    select m.*,
      count(*) over () as total,
      row_number() over (
        order by
          (v_sort = 'relevance' and not premium)::int,
          case when v_sort = 'relevance' then score end desc,
          case when v_sort = 'relevance' and premium then md5(v_seed || ':' || id::text) end,
          case when v_sort = 'distance' or (v_sort = 'relevance' and not premium) then dist end nulls last,
          case when v_sort = 'price_asc' then from_price end nulls last,
          case when v_sort = 'price_desc' then from_price end desc nulls last,
          created_at desc,
          id
      ) as rn
    from matched m
  )
  select jsonb_build_object(
    'total', coalesce((select max(total) from ranked), 0),
    'items', coalesce((
      select jsonb_agg(
        doc || jsonb_build_object('distance_km', dist, 'is_open', public.hours_open(hours, exceptions, v_now), 'from_price', from_price)
        order by rn
      )
      from ranked
      where rn > (v_page - 1) * v_size and rn <= v_page * v_size
    ), '[]'::jsonb)
  )
  into v_out;

  return v_out || jsonb_build_object('page', v_page, 'page_size', v_size);
end $$;

create or replace function public.search_facets(p_query text default '', p_category text default null) returns jsonb
language sql stable security definer set search_path = public, extensions set statement_timeout = '3s' as $$
  with tokens as (select public.search_tokens(p_query) as t),
  scored as (
    select pb.id, pb.category_id, pb.town, pb.county, pr.from_price,
      coalesce((
        select case when bool_or(w is null) then -1 else sum(w) end
        from (
          select greatest(
            case when strpos(public.search_norm(pb.name), t) > 0 then 5 end,
            case when strpos(public.search_norm(array_to_string(pb.tags, ' ')), t) > 0 then 4 end,
            case when strpos(public.search_norm(c.name), t) > 0 then 3 end,
            case when strpos(public.search_norm(coalesce(pb.town, '') || ' ' || coalesce(pb.county, '')), t) > 0 then 2 end,
            case when strpos(public.search_norm(coalesce(pb.tagline, '') || ' ' || coalesce(pb.description, '')), t) > 0 then 1 end
          ) as w
          from unnest((select tokens.t from tokens)) t
        ) x
      ), 0) as score
    from public.public_businesses pb
    left join public.categories c on c.id = pb.category_id
    left join lateral (
      select min(i.price) as from_price from public.public_items i
      where i.business_id = pb.id and i.price_type in ('fixed', 'from', 'range') and i.price is not null
    ) pr on true
    where p_category is null or pb.category_id = p_category
  ),
  matched as (select * from scored where score >= 0)
  select jsonb_build_object(
    'towns', coalesce((
      select jsonb_agg(jsonb_build_object('slug', slug, 'name', name, 'county', county, 'count', n) order by lower(name), slug)
      from (
        select replace(public.search_norm(town), ' ', '-') as slug, min(town) as name, min(county) as county, count(*) as n
        from matched where public.search_norm(town) <> '' group by 1
      ) tw
    ), '[]'::jsonb),
    'price', (select case when count(from_price) > 0 then jsonb_build_object('min', min(from_price), 'max', max(from_price)) end from matched),
    'category_ids', coalesce((select jsonb_agg(distinct category_id) from matched), '[]'::jsonb)
  )
$$;

create or replace function public.search_suggestions(p_prefix text, p_limit integer default 6) returns jsonb
language sql stable security definer set search_path = public, extensions set statement_timeout = '2s' as $$
  with q as (select public.search_norm(left(coalesce(p_prefix, ''), 60)) as t),
  cats as (
    select 1 as grp, 'category' as type, c.name as label, c.id as ref
    from public.categories c, q where c.active and char_length(q.t) >= 2 and strpos(public.search_norm(c.name), q.t) > 0
  ),
  biz as (
    select 2, 'business', pb.name, pb.slug
    from public.public_businesses pb, q where char_length(q.t) >= 2 and strpos(public.search_norm(pb.name), q.t) > 0
  ),
  terms as (
    select distinct on (lower(tag)) 3, 'term', tag, null::text
    from public.public_businesses pb, q, unnest(pb.tags) tag
    where char_length(q.t) >= 2 and strpos(public.search_norm(tag), q.t) > 0
    order by lower(tag), tag
  ),
  allrows as (
    select * from cats union all select * from biz union all select * from terms
  ),
  deduped as (
    select distinct on (type, lower(label)) * from allrows order by type, lower(label), ref
  ),
  ordered as (
    select * from deduped order by grp, lower(label), label limit least(20, greatest(1, coalesce(p_limit, 6)))
  )
  select coalesce(jsonb_agg(
    case type
      when 'category' then jsonb_build_object('type', type, 'label', label, 'categoryId', ref)
      when 'business' then jsonb_build_object('type', type, 'label', label, 'slug', ref)
      else jsonb_build_object('type', type, 'label', label)
    end order by grp, lower(label), label
  ), '[]'::jsonb)
  from ordered
$$;

revoke all on function public.search_businesses(text, text, text, text, boolean, boolean, boolean, double precision, double precision, double precision, numeric, numeric, text, text, integer, integer) from public;
revoke all on function public.search_facets(text, text) from public;
revoke all on function public.search_suggestions(text, integer) from public;
grant execute on function public.search_businesses(text, text, text, text, boolean, boolean, boolean, double precision, double precision, double precision, numeric, numeric, text, text, integer, integer) to anon, authenticated, service_role;
grant execute on function public.search_facets(text, text) to anon, authenticated, service_role;
grant execute on function public.search_suggestions(text, integer) to anon, authenticated, service_role;
grant execute on function public.hours_open(jsonb, jsonb, timestamptz) to anon, authenticated, service_role;
