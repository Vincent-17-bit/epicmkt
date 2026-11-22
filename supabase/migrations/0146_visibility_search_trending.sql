-- 0146_visibility_search_trending.sql
-- One rule for "may a visitor see this shop and what it sells": business_is_visible(b) = status 'live', not deleted, and its
-- subscription active or inside its grace days (listing_state). This migration makes every public door follow it, and lets
-- shops be searched and trend like products.
--
--   1. Leaks closed. public_gallery_photos, public_staff and public_timetable (0063) only checked status = 'live', so a shop whose
--      subscription had ended (no grace left) still showed its photos, team and class timetable by shop id. They now use
--      business_is_visible(b), like public_items, public_businesses and the offer views.
--   2. Suggestions while typing re-check at read time. The dictionary is rebuilt hourly; the product cards and the store rows of
--      search_suggest are now confirmed against the shop and item as they are right now, so a shop suspended, deleted, unlisted or
--      lapsed a minute ago disappears at once (only the plain completion words of the dictionary wait for the next rebuild).
--   3. Trending shows only what can be opened.
--        - search_term_has_result(term): a visible product or a visible shop matches it. top_searches skips terms that have none,
--          so a term that only matched a suspended shop's products or name can no longer trend.
--        - search_example_item now filters shops BEFORE its 2,000-row cap (a term popular with hidden shops could previously find
--          no example although visible shops sold it).
--        - the shop-name exclusion of 0145 uses business_is_visible instead of status = 'live'.
--        - top_searches_hourly re-checks the stored example item at read time (falls back to a current one) and drops terms that
--          have nothing visible left.
--   4. Trending shops. People who search a shop by name now make it trend: top_shop_searches(limit) = visible shops searched by 3
--      or more different people, 24 hours then 48 hours then 7 days (topped up to 3 from wider windows). The hourly job stores
--      them (search_top_shops_hourly) and top_searches_hourly returns them as `stores`: [{ name, slug, count, hot }], re-checked
--      for visibility at read time.
-- Unchanged: signatures, grants of existing functions, thresholds, blocklist.
--
-- Additive and reversible. Rollback: re-run the 0063 view definitions, the 0128 search_suggest / search_example_item /
-- refresh_top_searches / top_searches_hourly, the 0145 trending_in_window / top_searches; then
--   drop function public.top_shop_searches(integer); drop function public.trending_shops_in_window(interval, integer);
--   drop function public.search_term_has_result(text); drop table public.search_top_shops_hourly;

-- 1. Views ----------------------------------------------------------------------------------------------------------------------
create or replace view public.public_gallery_photos with (security_invoker = false) as
select g.id, g.business_id, b.slug as business_slug, g.path, g.caption, g.sort, g.pair_id, g.pair_role, g.width, g.height
from public.gallery_photos g
join public.businesses b on b.id = g.business_id
where public.business_is_visible(b) and public.is_counted_gallery(g);

create or replace view public.public_staff with (security_invoker = false) as
select s.id, s.business_id, b.slug as business_slug, s.name, s.role, s.specialties, s.photo_path, s.sort,
       case when b.plan_key = 'premium'
            then coalesce((select array_agg(ss.item_id) from public.staff_services ss where ss.staff_id = s.id), '{}'::uuid[])
            else '{}'::uuid[] end as item_ids
from public.staff_members s
join public.businesses b on b.id = s.business_id
where public.business_is_visible(b) and not s.hidden_by_admin and not s.removed_by_admin and coalesce(s.admin_status, 'ok') = 'ok';

create or replace view public.public_timetable with (security_invoker = false) as
select t.id, t.business_id, b.slug as business_slug, t.day_of_week, t.start_time, t.end_time, t.class_name, t.staff_id
from public.timetable_slots t
join public.businesses b on b.id = t.business_id
where public.business_is_visible(b) and b.plan_key = 'premium' and not t.hidden_by_admin and not t.removed_by_admin
  and coalesce(t.admin_status, 'ok') = 'ok';

-- 2. Suggestions while typing ---------------------------------------------------------------------------------------------------
create or replace function public.search_suggest(p_prefix text, p_limit integer default 8) returns jsonb
language plpgsql stable security definer
set search_path = public, extensions
set statement_timeout = '2s'
set pg_trgm.similarity_threshold = '0.35' as $$
declare
  v_q text := public.search_key(left(coalesce(p_prefix, ''), 60));
  v_limit integer := least(greatest(coalesce(p_limit, 8), 1), 12);
  v_corrected text := null;
  v_fixed text;
  v_out jsonb;
begin
  if char_length(v_q) < 2 then
    return jsonb_build_object('terms', '[]'::jsonb, 'products', '[]'::jsonb, 'stores', '[]'::jsonb, 'categories', '[]'::jsonb, 'corrected', null);
  end if;
  if not exists (select 1 from public.search_terms limit 1) then
    return null;
  end if;
  if char_length(v_q) >= 3 and not exists (select 1 from public.search_terms t where t.key like v_q || '%')
     and not exists (select 1 from public.search_terms t where t.key like '%' || v_q || '%' and (' ' || t.key) like '% ' || v_q || '%') then
    v_fixed := array_to_string(public.search_correct_words(string_to_array(v_q, ' ')), ' ');
    if v_fixed is distinct from v_q then
      v_corrected := v_fixed;
      v_q := v_fixed;
    end if;
  end if;

  with starts as (
    select t.*, 3 as tier from public.search_terms t where t.key like v_q || '%'
    order by t.weight desc, char_length(t.key)
    limit 400
  ), words as (
    select t.*, 2 as tier from public.search_terms t
    where char_length(v_q) >= 3 and t.key like '%' || v_q || '%' and (' ' || t.key) like '% ' || v_q || '%' and t.key not like v_q || '%'
    order by t.weight desc
    limit 200
  ), fuzzy as (
    select t.*, 1 as tier from public.search_terms t
    where char_length(v_q) >= 4 and t.key % v_q and t.key not like '%' || v_q || '%'
    order by similarity(t.key, v_q) desc, t.weight desc
    limit 60
  ), hits as (
    select * from starts union all select * from words union all select * from fuzzy
  ), completions as (
    -- One row per text however many kinds it came from; the strongest kind decides its weight.
    select key, max(tier) as tier,
           max(weight * case kind when 'query' then 3.0 when 'section' then 1.5 when 'brand' then 1.5 else 1.0 end) as weight
    from hits where kind in ('query', 'phrase', 'brand', 'section')
    group by key
  )
  select jsonb_build_object(
    'terms', coalesce((
      select jsonb_agg(jsonb_build_object('label', c.key) order by c.tier desc, c.weight desc, char_length(c.key), c.key)
      from (select * from completions order by tier desc, weight desc, char_length(key), key limit v_limit) c
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.ref, 'name', p.label, 'slug', p.slug, 'image', p.image, 'price', p.price)
                       order by p.tier desc, (p.image is not null) desc, p.weight desc)
      from (
        select * from (
          select distinct on (h.ref) h.ref, h.label, h.slug, h.image, h.price, h.tier, h.weight
          from hits h
          where h.kind = 'phrase' and h.ref is not null and h.slug is not null
            -- read-time check: the dictionary is rebuilt hourly, a product whose shop was suspended or lapsed since must not be offered
            and exists (
              select 1 from public.items i join public.businesses b on b.id = i.business_id
              where i.id = (case when h.kind = 'phrase' then h.ref::uuid end)
                and public.business_is_visible(b)
                and public.item_is_public(i.visible, i.draft, i.hidden_by_admin, i.removed_by_admin, i.availability))
          order by h.ref, h.tier desc, h.weight desc
        ) d
        order by d.tier desc, (d.image is not null) desc, d.weight desc
        limit 4
      ) p
    ), '[]'::jsonb),
    'stores', coalesce((
      select jsonb_agg(jsonb_build_object('label', s.label, 'slug', s.ref) order by s.tier desc, s.weight desc, s.label)
      from (
        select h2.* from hits h2
        where h2.kind = 'store'
          and exists (select 1 from public.businesses b where b.slug = h2.ref and public.business_is_visible(b))
        order by h2.tier desc, h2.weight desc, h2.label limit 4
      ) s
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('label', c.label, 'id', c.ref) order by c.tier desc, c.label)
      from (select * from hits where kind = 'category' order by tier desc, label limit 3) c
    ), '[]'::jsonb),
    'corrected', v_corrected
  ) into v_out;
  return v_out;
end $$;

-- 3. Trending: only what can be opened ------------------------------------------------------------------------------------------
create or replace function public.search_example_item(p_term text)
returns table (item_id uuid, label text, slug text, image text, price numeric)
language sql stable security definer set search_path = public, extensions set statement_timeout = '2s' as $$
  with m as materialized (
    select i.id, i.name, i.business_id, b.slug, coalesce(i.price_min, i.price) as price, i.created_at
    from public.items i
    join public.businesses b on b.id = i.business_id and public.business_is_visible(b)
    where public.item_search_doc(i.name, i.brand, i.section) @@ public.search_tsquery(public.search_query_tokens(p_term))
      and public.item_is_public(i.visible, i.draft, i.hidden_by_admin, i.removed_by_admin, i.availability)
    limit 2000
  )
  select m.id, m.name, m.slug,
         (select x.path from public.item_media x where x.item_id = m.id and x.kind = 'image' order by x.sort, x.created_at, x.id limit 1),
         m.price
  from m
  order by exists (select 1 from public.item_media x where x.item_id = m.id and x.kind = 'image') desc, m.created_at desc, m.id
  limit 1
$$;

-- Can a visitor who searches this term find anything? A visible product, or a visible shop (name or tags).
create or replace function public.search_term_has_result(p_term text) returns boolean
language sql stable security definer set search_path = public, extensions set statement_timeout = '3s' as $$
  select char_length(public.search_key(p_term)) >= 2
     and (
       exists (select 1 from public.search_example_item(p_term))
       or exists (
         select 1 from public.businesses b
         where public.business_is_visible(b)
           and (public.search_key(b.name) like '%' || public.search_key(p_term) || '%'
                or public.search_key(array_to_string(b.tags, ' ')) like '%' || public.search_key(p_term) || '%')
       )
     )
$$;
revoke all on function public.search_term_has_result(text) from public, anon, authenticated;
grant execute on function public.search_term_has_result(text) to service_role;

-- 0145's window, with the shop-name exclusion on visible shops (suspended, deleted, lapsed shops are not shops anyone can open).
create or replace function public.trending_in_window(p_window interval, p_limit integer default 20)
returns table (term text, count integer, hot boolean)
language sql stable security definer set search_path = public, extensions set statement_timeout = '3s' as
$$
  with ev as (
    select e.term, e.client_hash, e.at, public.search_term_key(e.term) as k
    from public.search_events e
    where e.at > now() - p_window
      and not exists (select 1 from public.search_blocklist b where position(b.term in e.term) > 0)
  ), g as (
    select k, count(distinct client_hash) as n from ev group by k
  ), heads as (
    select k, n from g where n >= 2 order by n desc, k limit 200
  ), hop1 as (
    select g.k, coalesce((
      select h.k from heads h
      where h.k <> g.k and length(g.k) >= 5 and length(h.k) >= 5 and left(h.k, 1) = left(g.k, 1)
        and (h.n > g.n or (h.n = g.n and h.k < g.k))
        and extensions.levenshtein(g.k, h.k) <= 2 and extensions.similarity(g.k, h.k) >= 0.5
      order by h.n desc, h.k limit 1), g.k) as h1
    from g
  ), hop2 as (
    select a.k, coalesce(b.h1, a.h1) as root from hop1 a left join hop1 b on b.k = a.h1
  ), folded as (
    select m.root, ev.term, ev.client_hash, ev.at from ev join hop2 m on m.k = ev.k
  ), agg as (
    select root,
           count(distinct client_hash) as n,
           count(distinct client_hash) filter (where at > now() - interval '3 hours') as n3
    from folded group by root having count(distinct client_hash) >= 3
  ), shown as (
    select distinct on (f.root) f.root, f.term
    from (select root, term, count(distinct client_hash) as c from folded group by root, term) f
    order by f.root, f.c desc, length(f.term) desc, f.term
  )
  select s.term, a.n::integer, (a.n3 >= 3 and a.n3 * 4 >= a.n) as hot
  from agg a
  join shown s on s.root = a.root
  where not exists (
    select 1 from public.businesses b
    where public.business_is_visible(b)
      and (public.search_term_key(b.name) = a.root or extensions.similarity(lower(b.name), s.term) >= 0.6)
  )
  order by 2 desc, 1
  limit greatest(1, least(coalesce(p_limit, 20), 20))
$$;

create or replace function public.top_searches(p_limit integer default 10)
returns table (term text, count integer, hot boolean)
language plpgsql stable security definer set search_path = public, extensions set statement_timeout = '6s' as
$$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 20));
  v_min integer := least(v_limit, 5);
  v_window interval;
  v_first boolean := true;
  v_seen text[] := '{}';
  v_n integer := 0;
  r record;
  v_key text;
begin
  foreach v_window in array array[interval '24 hours', interval '48 hours', interval '7 days'] loop
    for r in select * from public.trending_in_window(v_window, 20) loop
      v_key := public.search_term_key(r.term);
      if v_key = any(v_seen) then continue; end if;
      if (v_first and v_n >= v_limit) or (not v_first and v_n >= v_min) then exit; end if;
      -- a term nobody can find anything for (its shop was suspended, lapsed or deleted) is not a trend
      if not public.search_term_has_result(r.term) then continue; end if;
      term := r.term; count := r.count; hot := r.hot;
      v_seen := v_seen || v_key;
      v_n := v_n + 1;
      return next;
    end loop;
    if v_n >= v_min then return; end if;
    if v_n > 0 then v_first := false; end if;
  end loop;
  return;
end
$$;

-- 4. Trending shops -------------------------------------------------------------------------------------------------------------
-- One window: visible shops whose name people searched (same spelling key, or trigram similarity 0.6+), at least 3 different
-- searchers per shop across all the spellings. Internal.
create or replace function public.trending_shops_in_window(p_window interval, p_limit integer default 10)
returns table (business_id uuid, count integer, hot boolean)
language sql stable security definer set search_path = public, extensions set statement_timeout = '4s' as
$$
  with ev as (
    select e.term, e.client_hash, e.at, public.search_term_key(e.term) as k
    from public.search_events e
    where e.at > now() - p_window
      and not exists (select 1 from public.search_blocklist b where position(b.term in e.term) > 0)
  ), t as (
    select term, k, count(distinct client_hash) as n from ev where length(k) >= 3 group by term, k order by n desc, term limit 150
  ), m as (
    select distinct on (t.term) t.term, b.id as business_id
    from t
    join public.businesses b
      on public.business_is_visible(b)
     and (public.search_term_key(b.name) = t.k or extensions.similarity(lower(b.name), t.term) >= 0.6)
    order by t.term, (public.search_term_key(b.name) = t.k) desc, extensions.similarity(lower(b.name), t.term) desc, b.created_at, b.id
  ), agg as (
    select m.business_id,
           count(distinct ev.client_hash) as n,
           count(distinct ev.client_hash) filter (where ev.at > now() - interval '3 hours') as n3
    from m join ev on ev.term = m.term
    group by m.business_id
    having count(distinct ev.client_hash) >= 3
  )
  select a.business_id, a.n::integer, (a.n3 >= 3 and a.n3 * 4 >= a.n)
  from agg a
  order by a.n desc, a.business_id
  limit greatest(1, least(coalesce(p_limit, 10), 20))
$$;
revoke all on function public.trending_shops_in_window(interval, integer) from public, anon, authenticated;
grant execute on function public.trending_shops_in_window(interval, integer) to service_role;

-- The ladder of top_searches (24 hours, 48 hours, 7 days; wider windows only top up to 3), for shops. Visible shops only, and a
-- shop whose state changes shows or hides at once because the shop row is read here, not stored.
create or replace function public.top_shop_searches(p_limit integer default 5)
returns table (business_id uuid, slug text, name text, count integer, hot boolean)
language plpgsql stable security definer set search_path = public, extensions set statement_timeout = '6s' as
$$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 5), 10));
  v_min integer := least(v_limit, 3);
  v_window interval;
  v_first boolean := true;
  v_seen uuid[] := '{}';
  v_n integer := 0;
  r record;
begin
  foreach v_window in array array[interval '24 hours', interval '48 hours', interval '7 days'] loop
    for r in
      select w.business_id as id, w.count as n, w.hot as h, b.slug as s, b.name as nm
      from public.trending_shops_in_window(v_window, 10) w
      join public.businesses b on b.id = w.business_id and public.business_is_visible(b)
    loop
      if r.id = any(v_seen) then continue; end if;
      if (v_first and v_n >= v_limit) or (not v_first and v_n >= v_min) then exit; end if;
      business_id := r.id; slug := r.s; name := r.nm; count := r.n; hot := r.h;
      v_seen := v_seen || r.id;
      v_n := v_n + 1;
      return next;
    end loop;
    if v_n >= v_min then return; end if;
    if v_n > 0 then v_first := false; end if;
  end loop;
  return;
end
$$;
revoke all on function public.top_shop_searches(integer) from public;
grant execute on function public.top_shop_searches(integer) to anon, authenticated, service_role;

create table if not exists public.search_top_shops_hourly (
  rank smallint primary key check (rank between 1 and 20),
  business_id uuid not null references public.businesses (id) on delete cascade,
  searches integer not null,
  hot boolean not null default false,
  computed_at timestamptz not null default now()
);
alter table public.search_top_shops_hourly enable row level security;
revoke all on public.search_top_shops_hourly from public, anon, authenticated;
grant all on public.search_top_shops_hourly to service_role;

-- 0128's job, now storing the shops too.
create or replace function public.refresh_top_searches() returns integer
language plpgsql volatile security definer set search_path = public, extensions set statement_timeout = '60s' as $$
declare
  v_rows integer;
begin
  update public.search_query_stats set score = score * 0.97 where score > 0.01;
  delete from public.search_query_stats where score <= 0.01 and last_seen < now() - interval '30 days';
  insert into public.search_query_stats as s (term, score, last_seen)
  select e.term, count(distinct e.client_hash), max(e.at)
  from public.search_events e
  where e.at > now() - interval '1 hour'
    and not exists (select 1 from public.search_blocklist b where position(b.term in e.term) > 0)
  group by e.term
  on conflict (term) do update set score = s.score + excluded.score, last_seen = greatest(s.last_seen, excluded.last_seen);

  delete from public.search_top_hourly where true;
  insert into public.search_top_hourly (rank, term, searches, hot, item_id, label, slug, image, price, computed_at)
  select t.rn, t.term, t.searches, t.hot, x.item_id, x.label, x.slug, x.image, x.price, now()
  from (
    select row_number() over (order by count desc, term)::smallint as rn, term, count as searches, hot
    from public.top_searches(20)
  ) t
  left join lateral public.search_example_item(t.term) x on true;
  get diagnostics v_rows = row_count;

  delete from public.search_top_shops_hourly where true;
  insert into public.search_top_shops_hourly (rank, business_id, searches, hot, computed_at)
  select row_number() over (order by s.count desc, s.slug)::smallint, s.business_id, s.count, s.hot, now()
  from public.top_shop_searches(10) s;
  return v_rows;
end $$;

-- The hourly list as served: the stored terms re-checked against what is visible now, plus the trending shops.
create or replace function public.top_searches_hourly(p_limit integer default 10) returns jsonb
language sql stable security definer set search_path = public, extensions set statement_timeout = '5s' as $$
  select case
    when exists (select 1 from public.search_top_hourly where computed_at > now() - interval '3 hours') then
      jsonb_build_object(
        'computedAt', (select max(computed_at) from public.search_top_hourly),
        'live', false,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object('term', f.term, 'count', f.searches, 'hot', f.hot, 'itemId', f.item_id, 'label', f.label,
                                              'slug', f.slug, 'image', f.image, 'price', f.price) order by f.rank)
          from (
            select * from (
              select t.rank, t.term, t.searches, t.hot,
                     case when v.item_id is not null then v.item_id else x.item_id end as item_id,
                     case when v.item_id is not null then v.label else x.label end as label,
                     case when v.item_id is not null then v.slug else x.slug end as slug,
                     case when v.item_id is not null then v.image else x.image end as image,
                     case when v.item_id is not null then v.price else x.price end as price
              from (select * from public.search_top_hourly order by rank limit least(greatest(coalesce(p_limit, 10), 1), 20)) t
              left join lateral (
                select t.item_id, t.label, t.slug, t.image, t.price
                where exists (
                  select 1 from public.items i join public.businesses b on b.id = i.business_id
                  where i.id = t.item_id and public.business_is_visible(b)
                    and public.item_is_public(i.visible, i.draft, i.hidden_by_admin, i.removed_by_admin, i.availability))
              ) v on true
              left join lateral (select * from public.search_example_item(t.term) where v.item_id is null) x on true
            ) y
            where y.item_id is not null or public.search_term_has_result(y.term)
          ) f
        ), '[]'::jsonb),
        'stores', coalesce((
          select jsonb_agg(jsonb_build_object('name', b.name, 'slug', b.slug, 'count', s.searches, 'hot', s.hot) order by s.rank)
          from public.search_top_shops_hourly s
          join public.businesses b on b.id = s.business_id and public.business_is_visible(b)
        ), '[]'::jsonb))
    else
      jsonb_build_object(
        'computedAt', now(),
        'live', true,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object('term', t.term, 'count', t.count, 'hot', t.hot))
          from public.top_searches(least(greatest(coalesce(p_limit, 10), 1), 20)) t
        ), '[]'::jsonb),
        'stores', coalesce((
          select jsonb_agg(jsonb_build_object('name', s.name, 'slug', s.slug, 'count', s.count, 'hot', s.hot))
          from public.top_shop_searches(5) s
        ), '[]'::jsonb))
  end
$$;
