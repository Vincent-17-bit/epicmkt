-- 0041_browse_search.sql
-- Search and browse run in Postgres. The browser asks for one page and gets one page.
-- Matching: every word must appear in the name, tags, category name, town/county or tagline/description,
-- with weights 5/4/3/2/1 (best field per word, summed). Trigram GIN indexes serve the substring matches.
-- Distance: PostGIS geography with a GIST index. Paging: ORDER BY with a unique tie-break, LIMIT/OFFSET, plus the total.
-- Every function applies the same visibility rule as public_businesses (business_is_visible).

create extension if not exists pg_trgm with schema extensions;
create extension if not exists postgis with schema extensions;

create or replace function public.search_norm(p_text text) returns text
language sql immutable parallel safe as $$
  select btrim(regexp_replace(regexp_replace(normalize(lower(coalesce(p_text, '')), NFKD), '[^a-z0-9_\s]', ' ', 'g'), '\s+', ' ', 'g'))
$$;

create or replace function public.search_slug(p_text text) returns text
language sql immutable parallel safe as $$ select replace(public.search_norm(p_text), ' ', '-') $$;

create or replace function public.search_join(p_list text[]) returns text
language sql immutable parallel safe as $$ select coalesce(array_to_string(p_list, ' '), '') $$;

create or replace function public.search_like(p_text text) returns text
language sql immutable parallel safe as $$ select '%' || replace(replace(p_text, '\', '\\'), '_', '\_') || '%' $$;

alter table public.businesses add column if not exists geo extensions.geography(Point, 4326)
  generated always as (
    case when lat between -90 and 90 and lng between -180 and 180
      then extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography
    end
  ) stored;

create index if not exists businesses_geo_idx on public.businesses using gist (geo);
create index if not exists businesses_s_name_trgm on public.businesses using gin (public.search_norm(name) extensions.gin_trgm_ops);
create index if not exists businesses_s_tags_trgm on public.businesses using gin (public.search_norm(public.search_join(tags)) extensions.gin_trgm_ops);
create index if not exists businesses_s_area_trgm on public.businesses using gin (public.search_norm(coalesce(town, '') || ' ' || coalesce(county, '')) extensions.gin_trgm_ops);
create index if not exists businesses_s_text_trgm on public.businesses using gin (public.search_norm(coalesce(tagline, '') || ' ' || coalesce(description, '')) extensions.gin_trgm_ops);
create index if not exists businesses_live_town_idx on public.businesses (public.search_slug(town)) where status = 'live' and deleted_at is null;
create index if not exists businesses_live_county_idx on public.businesses (county) where status = 'live' and deleted_at is null;
create index if not exists businesses_live_created_idx on public.businesses (created_at desc, id) where status = 'live' and deleted_at is null;
create index if not exists items_priced_idx on public.items (business_id, price)
  where visible and not draft and not hidden_by_admin and not removed_by_admin and price is not null and price_type in ('fixed', 'from', 'range');

create or replace function public.is_open_now(p_hours jsonb, p_at timestamptz default now()) returns boolean
language plpgsql stable set search_path = public as $$
declare
  v_local timestamp := p_at at time zone 'Africa/Nairobi';
  v_slot jsonb;
  v_start integer;
  v_end integer;
  v_now integer := extract(hour from v_local)::integer * 60 + extract(minute from v_local)::integer;
begin
  if p_hours is null or jsonb_typeof(p_hours) <> 'object' then return false; end if;
  v_slot := p_hours -> (array['sun','mon','tue','wed','thu','fri','sat'])[extract(dow from v_local)::integer + 1];
  if v_slot is null or jsonb_typeof(v_slot) <> 'array' or jsonb_array_length(v_slot) <> 2 then return false; end if;
  if jsonb_typeof(v_slot -> 0) <> 'string' or jsonb_typeof(v_slot -> 1) <> 'string' then return false; end if;
  if (v_slot ->> 0) !~ '^\d{1,2}:\d{2}$' or (v_slot ->> 1) !~ '^\d{1,2}:\d{2}$' then return false; end if;
  v_start := split_part(v_slot ->> 0, ':', 1)::integer * 60 + split_part(v_slot ->> 0, ':', 2)::integer;
  v_end := split_part(v_slot ->> 1, ':', 1)::integer * 60 + split_part(v_slot ->> 1, ':', 2)::integer;
  if v_end > v_start then return v_now >= v_start and v_now < v_end; end if;
  return v_now >= v_start or v_now < v_end;
end $$;

create or replace function public.browse_tokens(p_query text) returns text[]
language sql immutable parallel safe set search_path = public as $$
  select coalesce(array(
    select u.t from unnest(string_to_array(public.search_norm(left(coalesce(p_query, ''), 200)), ' ')) with ordinality as u(t, n)
    where u.t <> '' order by u.n limit 8
  ), '{}'::text[])
$$;

create or replace function public.browse_match_sql(p_tokens text[]) returns text
language plpgsql stable set search_path = public as $$
declare
  v_parts text[] := '{}';
  v_token text;
  v_pat text;
  v_cats text[];
begin
  foreach v_token in array p_tokens loop
    v_pat := public.search_like(v_token);
    select coalesce(array_agg(c.id), '{}') into v_cats from public.categories c where c.active and public.search_norm(c.name) like v_pat;
    v_parts := v_parts || format(
      '(public.search_norm(b.name) like %1$L or public.search_norm(public.search_join(b.tags)) like %1$L or b.category_id = any(%2$L::text[]) or public.search_norm(coalesce(b.town, '''') || '' '' || coalesce(b.county, '''')) like %1$L or public.search_norm(coalesce(b.tagline, '''') || '' '' || coalesce(b.description, '''')) like %1$L)',
      v_pat, v_cats);
  end loop;
  return case when cardinality(v_parts) = 0 then 'true' else array_to_string(v_parts, ' and ') end;
end $$;

create or replace function public.browse_score_sql(p_tokens text[]) returns text
language plpgsql stable set search_path = public as $$
declare
  v_parts text[] := '{}';
  v_token text;
  v_pat text;
  v_cats text[];
begin
  foreach v_token in array p_tokens loop
    v_pat := public.search_like(v_token);
    select coalesce(array_agg(c.id), '{}') into v_cats from public.categories c where c.active and public.search_norm(c.name) like v_pat;
    v_parts := v_parts || format(
      '(case when public.search_norm(b.name) like %1$L then 5 when public.search_norm(public.search_join(b.tags)) like %1$L then 4 when b.category_id = any(%2$L::text[]) then 3 when public.search_norm(coalesce(b.town, '''') || '' '' || coalesce(b.county, '''')) like %1$L then 2 else 1 end)',
      v_pat, v_cats);
  end loop;
  return case when cardinality(v_parts) = 0 then '0' else array_to_string(v_parts, ' + ') end;
end $$;

create or replace function public.browse_card(b public.businesses, p_origin extensions.geography default null) returns jsonb
language sql stable set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', b.id,
    'slug', b.slug,
    'name', b.name,
    'tagline', coalesce(b.tagline, ''),
    'categoryId', b.category_id,
    'county', coalesce(b.county, ''),
    'town', coalesce(b.town, ''),
    'plan', b.plan_key,
    'verified', b.verification_level = 'verified',
    'coverPath', b.cover_path,
    'logoPath', b.logo_path,
    'fromPriceKes', (
      select min(i.price) from public.items i
      where i.business_id = b.id and i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin
        and i.price is not null and i.price_type in ('fixed', 'from', 'range')),
    'phone', b.phone,
    'whatsapp', b.whatsapp,
    'lat', b.lat,
    'lng', b.lng,
    'isOpen', public.is_open_now(b.hours),
    'distanceKm', case when p_origin is not null and b.geo is not null then extensions.st_distance(b.geo, p_origin, false) / 1000 end,
    'promo', jsonb_build_object(
      'flash', (select count(*) from public.public_flash_sales s where s.business_id = b.id),
      'offers', (select count(*) from public.public_offers o where o.business_id = b.id))
  )
$$;

create or replace function public.browse_cards(p_ids uuid[], p_origin extensions.geography default null) returns jsonb
language sql stable set search_path = public, extensions as $$
  select coalesce(jsonb_agg(public.browse_card(b, p_origin) order by u.ord), '[]'::jsonb)
  from unnest(coalesce(p_ids, '{}'::uuid[])) with ordinality as u(id, ord)
  join public.businesses b on b.id = u.id
$$;

create or replace function public.browse_search(
  p_query text default '',
  p_category text default null,
  p_county text default null,
  p_town text default null,
  p_open_now boolean default false,
  p_verified boolean default false,
  p_featured boolean default false,
  p_radius_km double precision default null,
  p_min_price numeric default null,
  p_max_price numeric default null,
  p_min_rating numeric default 0,
  p_sort text default 'relevance',
  p_seed text default '0',
  p_lat double precision default null,
  p_lng double precision default null,
  p_page integer default 1,
  p_page_size integer default 12
) returns jsonb
language plpgsql stable security definer set search_path = public, extensions set statement_timeout = '8s' as $$
declare
  v_tokens text[] := public.browse_tokens(p_query);
  v_origin extensions.geography;
  v_size integer := greatest(1, least(coalesce(p_page_size, 12), 100));
  v_page integer := greatest(1, least(coalesce(p_page, 1), 10000));
  v_category text := nullif(p_category, '');
  v_county text := nullif(p_county, '');
  v_town text := nullif(p_town, '');
  v_sort text := case when p_sort in ('relevance', 'distance', 'rating', 'newest', 'price_asc', 'price_desc') then p_sort else 'relevance' end;
  v_radius_m double precision := case when p_radius_km > 0 then p_radius_km * 1000 end;
  v_need_price boolean := p_min_price is not null or p_max_price is not null or p_sort in ('price_asc', 'price_desc');
  v_where text[] := array['public.business_is_visible(b)', public.browse_match_sql(v_tokens)];
  v_join text := '';
  v_price text := 'null::numeric';
  v_order text;
  v_m text;
  v_row record;
  v_ids uuid[] := '{}';
  v_total bigint;
begin
  if p_lat between -90 and 90 and p_lng between -180 and 180 then
    v_origin := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  end if;

  if v_category is not null then v_where := array_append(v_where, 'b.category_id = $2'); end if;
  if v_county is not null then v_where := array_append(v_where, 'b.county = $3'); end if;
  if v_town is not null then v_where := array_append(v_where, 'public.search_slug(b.town) = $4'); end if;
  if coalesce(p_min_rating, 0) > 0 then v_where := array_append(v_where, 'false'); end if;
  if coalesce(p_open_now, false) then v_where := array_append(v_where, 'public.is_open_now(b.hours)'); end if;
  if coalesce(p_verified, false) then v_where := array_append(v_where, 'b.verification_level = ''verified'''); end if;
  if coalesce(p_featured, false) then v_where := array_append(v_where, 'b.plan_key = ''premium'''); end if;
  if v_origin is not null and v_radius_m is not null then v_where := array_append(v_where, 'extensions.st_dwithin(b.geo, $1, $7, false)'); end if;

  if v_need_price then
    v_join := 'left join lateral (select min(i.price) as p from public.items i where i.business_id = b.id and i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin and i.price is not null and i.price_type in (''fixed'', ''from'', ''range'')) fp on true';
    v_price := 'fp.p';
    if p_min_price is not null then v_where := array_append(v_where, 'fp.p >= $5'); end if;
    if p_max_price is not null then v_where := array_append(v_where, 'fp.p <= $6'); end if;
  end if;

  v_m := format(
    'select b.id, %s as score, case when $1 is not null then extensions.st_distance(b.geo, $1, false) end as dist, %s as price, b.created_at, b.plan_key = ''premium'' as premium, case when b.plan_key = ''premium'' then md5($8 || '':'' || b.id::text) end as shuffle from public.businesses b %s where %s',
    public.browse_score_sql(v_tokens), v_price, v_join, array_to_string(v_where, ' and '));

  v_order := case v_sort
    when 'distance' then 'dist asc nulls last, created_at desc, id'
    when 'rating' then 'created_at desc, id'
    when 'newest' then 'created_at desc, id'
    when 'price_asc' then 'price asc nulls last, created_at desc, id'
    when 'price_desc' then 'price desc nulls last, created_at desc, id'
    else 'premium desc, score desc, shuffle asc nulls last, dist asc nulls last, created_at desc, id'
  end;

  for v_row in execute format('with m as (%s) select m.id, count(*) over () as total from m order by %s limit $9 offset $10', v_m, v_order)
    using v_origin, v_category, v_county, v_town, p_min_price, p_max_price, v_radius_m, coalesce(p_seed, '0'), v_size, (v_page - 1) * v_size
  loop
    v_ids := array_append(v_ids, v_row.id);
    v_total := v_row.total;
  end loop;

  if v_total is null then
    execute format('with m as (%s) select count(*) from m', v_m)
      into v_total
      using v_origin, v_category, v_county, v_town, p_min_price, p_max_price, v_radius_m, coalesce(p_seed, '0'), v_size, (v_page - 1) * v_size;
  end if;

  return jsonb_build_object('total', v_total, 'page', v_page, 'pageSize', v_size, 'items', public.browse_cards(v_ids, v_origin));
end $$;

create or replace function public.browse_facets(p_query text default '', p_category text default null) returns jsonb
language plpgsql stable security definer set search_path = public, extensions set statement_timeout = '8s' as $$
declare
  v_tokens text[] := public.browse_tokens(p_query);
  v_category text := nullif(p_category, '');
  v_where text := 'public.business_is_visible(b) and ' || public.browse_match_sql(v_tokens) || case when v_category is not null then ' and b.category_id = $1' else '' end;
  v_out jsonb;
begin
  execute format($q$
    with m as (select b.id, b.category_id, b.town, b.county from public.businesses b where %s),
    towns as (
      select public.search_slug(town) as slug, (array_agg(town order by id))[1] as name, (array_agg(coalesce(county, '') order by id))[1] as county, count(*) as n
      from m where public.search_slug(town) <> '' group by 1
    ),
    prices as (
      select min(fp.p) as lo, max(fp.p) as hi
      from m cross join lateral (
        select min(i.price) as p from public.items i
        where i.business_id = m.id and i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin
          and i.price is not null and i.price_type in ('fixed', 'from', 'range')
      ) fp
    )
    select jsonb_build_object(
      'towns', coalesce((select jsonb_agg(jsonb_build_object('slug', slug, 'name', name, 'county', county, 'count', n) order by lower(name), name) from towns), '[]'::jsonb),
      'priceMin', (select lo from prices),
      'priceMax', (select hi from prices),
      'categoryId', case when $1 is not null then $1 when (select count(distinct category_id) from m) = 1 then (select min(category_id) from m) end
    )
  $q$, v_where) into v_out using v_category;
  return v_out;
end $$;

create or replace function public.browse_suggestions(p_prefix text, p_limit integer default 6) returns jsonb
language plpgsql stable security definer set search_path = public, extensions set statement_timeout = '4s' as $$
declare
  v_q text := public.search_norm(left(coalesce(p_prefix, ''), 100));
  v_limit integer := greatest(1, least(coalesce(p_limit, 6), 20));
  v_pat text;
begin
  if char_length(v_q) < 2 then return '[]'::jsonb; end if;
  v_pat := public.search_like(v_q);
  return coalesce((
    select jsonb_agg(s.j order by s.grp, s.ord)
    from (
      select * from (
        select 1 as grp, row_number() over (order by c.sort, c.id) as ord,
          jsonb_build_object('type', 'category', 'label', c.name, 'categoryId', c.id) as j
        from public.categories c where c.active and public.search_norm(c.name) like v_pat
        union all
        select 2, row_number() over (order by lower(d.name), d.name, d.id), jsonb_build_object('type', 'business', 'label', d.name, 'slug', d.slug)
        from (
          select distinct on (lower(b.name)) b.id, b.name, b.slug from public.businesses b
          where public.business_is_visible(b) and public.search_norm(b.name) like v_pat
          order by lower(b.name), b.name, b.id
        ) d
        union all
        select 3, row_number() over (order by lower(t.tag), t.tag, t.id, t.pos), jsonb_build_object('type', 'term', 'label', t.tag)
        from (
          select distinct on (lower(x.tag)) x.id, x.pos, x.tag
          from (
            select b.id, u.pos, u.tag
            from public.businesses b, unnest(b.tags) with ordinality as u(tag, pos)
            where public.business_is_visible(b) and public.search_norm(public.search_join(b.tags)) like v_pat and public.search_norm(u.tag) like v_pat
          ) x
          order by lower(x.tag), x.tag, x.id, x.pos
        ) t
      ) u
      order by grp, ord
      limit v_limit
    ) s
  ), '[]'::jsonb);
end $$;

create or replace function public.browse_featured(
  p_category text default null,
  p_limit integer default 6,
  p_lat double precision default null,
  p_lng double precision default null,
  p_seed text default null
) returns jsonb
language plpgsql stable security definer set search_path = public, extensions set statement_timeout = '5s' as $$
declare
  v_origin extensions.geography;
  v_ids uuid[];
begin
  if p_lat between -90 and 90 and p_lng between -180 and 180 then
    v_origin := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  end if;
  select coalesce(array_agg(x.id order by x.rn), '{}') into v_ids from (
    select b.id, row_number() over (
      order by case when p_seed is null then null else md5(p_seed || ':' || b.id::text) end, b.created_at desc, b.id) as rn
    from public.businesses b
    where public.business_is_visible(b) and b.plan_key = 'premium' and (nullif(p_category, '') is null or b.category_id = p_category)
    order by rn
    limit greatest(1, least(coalesce(p_limit, 6), 50))
  ) x;
  return public.browse_cards(v_ids, v_origin);
end $$;

create or replace function public.browse_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 10,
  p_category text default null,
  p_limit integer default 8
) returns jsonb
language plpgsql stable security definer set search_path = public, extensions set statement_timeout = '5s' as $$
declare
  v_origin extensions.geography;
  v_ids uuid[];
begin
  if not (p_lat between -90 and 90 and p_lng between -180 and 180) then return '[]'::jsonb; end if;
  v_origin := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  select coalesce(array_agg(x.id order by x.rn), '{}') into v_ids from (
    select b.id, row_number() over (order by extensions.st_distance(b.geo, v_origin, false), b.id) as rn
    from public.businesses b
    where public.business_is_visible(b)
      and extensions.st_dwithin(b.geo, v_origin, greatest(coalesce(p_radius_km, 10), 0) * 1000, false)
      and (nullif(p_category, '') is null or b.category_id = p_category)
    order by rn
    limit greatest(1, least(coalesce(p_limit, 8), 50))
  ) x;
  return public.browse_cards(v_ids, v_origin);
end $$;

create or replace function public.browse_similar(p_ref text, p_limit integer default 4) returns jsonb
language plpgsql stable security definer set search_path = public, extensions set statement_timeout = '5s' as $$
declare
  v_base public.businesses;
  v_ids uuid[];
begin
  select * into v_base from public.businesses b
  where public.business_is_visible(b) and (b.id::text = p_ref or b.slug = p_ref)
  order by (b.id::text = p_ref) desc limit 1;
  if not found then raise exception 'business_not_found' using errcode = 'P0002'; end if;
  select coalesce(array_agg(x.id order by x.rn), '{}') into v_ids from (
    select b.id, row_number() over (
      order by (coalesce(b.county, '') = coalesce(v_base.county, '')) desc,
        case when v_base.geo is not null and b.geo is not null then extensions.st_distance(b.geo, v_base.geo, false) end asc nulls last,
        b.id) as rn
    from public.businesses b
    where public.business_is_visible(b) and b.id <> v_base.id and b.category_id = v_base.category_id
    order by rn
    limit greatest(1, least(coalesce(p_limit, 4), 50))
  ) x;
  return public.browse_cards(v_ids, null);
end $$;

create or replace function public.browse_category_counts() returns jsonb
language sql stable security definer set search_path = public set statement_timeout = '5s' as $$
  select coalesce(jsonb_agg(jsonb_build_object('categoryId', q.category_id, 'count', q.n)), '[]'::jsonb)
  from (select b.category_id, count(*) as n from public.businesses b where public.business_is_visible(b) group by 1) q
$$;

create or replace function public.browse_towns() returns jsonb
language sql stable security definer set search_path = public set statement_timeout = '5s' as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', t.slug, 'name', t.name, 'county', t.county, 'count', t.n) order by lower(t.name), t.name), '[]'::jsonb)
  from (
    select public.search_slug(b.town) as slug, (array_agg(b.town order by b.id))[1] as name,
      (array_agg(coalesce(b.county, '') order by b.id))[1] as county, count(*) as n
    from public.businesses b
    where public.business_is_visible(b) and public.search_slug(b.town) <> ''
    group by 1
  ) t
$$;

create or replace function public.browse_counties() returns jsonb
language sql stable security definer set search_path = public set statement_timeout = '5s' as $$
  select coalesce(jsonb_agg(q.county order by q.county collate "C"), '[]'::jsonb)
  from (select distinct b.county from public.businesses b where public.business_is_visible(b) and coalesce(b.county, '') <> '') q
$$;

revoke all on function public.search_norm(text), public.search_slug(text), public.search_join(text[]), public.search_like(text) from public;
revoke all on function public.is_open_now(jsonb, timestamptz) from public;
revoke all on function public.browse_tokens(text), public.browse_match_sql(text[]), public.browse_score_sql(text[]) from public;
revoke all on function public.browse_card(public.businesses, extensions.geography), public.browse_cards(uuid[], extensions.geography) from public;
revoke all on function
  public.browse_search(text, text, text, text, boolean, boolean, boolean, double precision, numeric, numeric, numeric, text, text, double precision, double precision, integer, integer),
  public.browse_facets(text, text),
  public.browse_suggestions(text, integer),
  public.browse_featured(text, integer, double precision, double precision, text),
  public.browse_nearby(double precision, double precision, double precision, text, integer),
  public.browse_similar(text, integer),
  public.browse_category_counts(),
  public.browse_towns(),
  public.browse_counties()
from public;

grant execute on function public.search_norm(text), public.search_slug(text), public.search_join(text[]), public.search_like(text) to anon, authenticated, service_role;
grant execute on function public.is_open_now(jsonb, timestamptz) to anon, authenticated, service_role;
grant execute on function public.browse_tokens(text), public.browse_match_sql(text[]), public.browse_score_sql(text[]) to service_role;
grant execute on function public.browse_card(public.businesses, extensions.geography), public.browse_cards(uuid[], extensions.geography) to service_role;
grant execute on function
  public.browse_search(text, text, text, text, boolean, boolean, boolean, double precision, numeric, numeric, numeric, text, text, double precision, double precision, integer, integer),
  public.browse_facets(text, text),
  public.browse_suggestions(text, integer),
  public.browse_featured(text, integer, double precision, double precision, text),
  public.browse_nearby(double precision, double precision, double precision, text, integer),
  public.browse_similar(text, integer),
  public.browse_category_counts(),
  public.browse_towns(),
  public.browse_counties()
to anon, authenticated, service_role;
