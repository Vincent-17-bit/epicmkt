-- 0147_visibility_everywhere.sql
-- One rule for "may a visitor see this shop and what it sells": business_is_visible(b) = status 'live', not deleted, and its
-- subscription active or inside its grace days (listing_state, per-shop grace honoured). This migration makes every remaining public
-- door follow it, on top of trending v2 (0146), which already ranks stores, products, flash sales and categories together.
--
--   1. Leaks closed. public_gallery_photos, public_staff and public_timetable (0063) only checked status = 'live', so a shop whose
--      subscription had ended (no grace left) still showed its photos, team and class timetable by shop id. They now use
--      business_is_visible(b), like public_items, public_businesses and the offer views.
--   2. Suggestions while typing re-check at read time. The dictionary is rebuilt hourly; the product cards and the store rows of
--      search_suggest are now confirmed against the shop and item as they are right now, so a shop suspended, deleted, unlisted or
--      lapsed a minute ago disappears at once (only the plain completion words of the dictionary wait for the next rebuild).
--   3. Trending shows only what can be opened, at the moment it is read.
--        - trending_lists (0146) re-checks every stored store / product / flash row against the shop and item as they are now,
--          instead of trusting the hourly rebuild: a shop that lapses vanishes from "Popular" and "Rising" at once.
--        - search_example_item (used by the rebuild to resolve a product word) filters shops BEFORE its 2,000-row cap: a word that
--          hidden shops sell most could previously find no example although visible shops sold it.
--        - search_term_has_result(term) + the older list top_searches (0145, still the live fallback and for older clients):
--          a term nobody can find anything for is skipped, and the shop-name exclusion uses business_is_visible.
--        - top_searches_hourly (older clients) re-checks the stored example item at read time.
-- Unchanged: signatures, grants of existing functions, thresholds, blocklist.
--
-- Additive and reversible. Rollback: re-run the 0063 view definitions, the 0128 search_suggest / search_example_item /
-- top_searches_hourly, the 0145 trending_in_window / top_searches and the 0146 trending_lists; then
--   drop function public.trending_row_is_live(text, uuid, text); drop function public.search_term_has_result(text);

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

-- The hourly list as served: the stored terms re-checked against what is visible now.
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
        ), '[]'::jsonb))
    else
      jsonb_build_object(
        'computedAt', now(),
        'live', true,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object('term', t.term, 'count', t.count, 'hot', t.hot))
          from public.top_searches(least(greatest(coalesce(p_limit, 10), 1), 20)) t
        ), '[]'::jsonb))
  end
$$;

-- Is what a stored trending row points at still something a visitor can open? A store: its shop is visible now. A product or a
-- flash-sale item: the item is public and its shop visible now. A category (or a row of unknown kind) has nothing to lose.
create or replace function public.trending_row_is_live(p_kind text, p_item uuid, p_slug text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_kind = 'store' then exists (select 1 from public.businesses b where b.slug = p_slug and public.business_is_visible(b))
    when p_kind in ('product', 'flash') then exists (
      select 1 from public.items i join public.businesses b on b.id = i.business_id
      where i.id = p_item and public.business_is_visible(b)
        and public.item_is_public(i.visible, i.draft, i.hidden_by_admin, i.removed_by_admin, i.availability))
    else true
  end
$$;
revoke all on function public.trending_row_is_live(text, uuid, text) from public, anon, authenticated;
grant execute on function public.trending_row_is_live(text, uuid, text) to service_role;

-- trending v2's reader, with every stored row re-checked at read time.
create or replace function public.trending_lists(p_county text default null, p_limit integer default 10) returns jsonb
language plpgsql stable security definer set search_path = public set statement_timeout = '3s' as
$$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 20);
  v_county text := nullif(lower(regexp_replace(btrim(coalesce(p_county, '')), '\s+', ' ', 'g')), '');
  v_fresh boolean := coalesce((select last_run_at > now() - make_interval(hours => stale_hours) from public.trending_settings limit 1), false);
  v_scope text := '*';
  v_rscope text := '*';
  v_fallback text := 'none';
  v_pop jsonb := '[]'::jsonb;
  v_rise jsonb := '[]'::jsonb;
  v_at timestamptz := now();
  v_live boolean := false;
begin
  if v_fresh then
    if v_county is not null then
      if exists (select 1 from public.search_trending where scope = v_county and list = 'popular') then v_scope := v_county; else v_fallback := 'national'; end if;
      if exists (select 1 from public.search_trending where scope = v_county and list = 'rising') then v_rscope := v_county; end if;
    end if;
    select last_run_at into v_at from public.trending_settings limit 1;

    select coalesce(jsonb_agg(jsonb_build_object('rank', rank, 'term', label, 'count', people, 'hot', hot, 'pinned', pinned, 'kind', kind,
                                                 'label', name, 'itemId', item_id, 'slug', slug, 'image', image, 'price', price) order by rank), '[]'::jsonb)
      into v_pop from (select * from public.search_trending s where s.list = 'popular' and s.scope = v_scope and public.trending_row_is_live(s.kind, s.item_id, s.slug) order by s.rank limit v_limit) t;
    select coalesce(jsonb_agg(jsonb_build_object('rank', rank, 'term', label, 'count', people, 'ratio', ratio, 'hot', true, 'kind', kind,
                                                 'label', name, 'itemId', item_id, 'slug', slug, 'image', image, 'price', price) order by rank), '[]'::jsonb)
      into v_rise from (select * from public.search_trending s where s.list = 'rising' and s.scope = v_rscope and public.trending_row_is_live(s.kind, s.item_id, s.slug) order by s.rank limit v_limit) t;
  else
    -- the stored list is missing or older than stale_hours: the live count (0039) of the last 24 hours, kind unknown
    v_live := true;
    select coalesce(jsonb_agg(jsonb_build_object('rank', rn, 'term', term, 'count', count, 'hot', hot, 'pinned', false, 'kind', null) order by rn), '[]'::jsonb)
      into v_pop from (select row_number() over () as rn, * from public.top_searches(v_limit)) t;
  end if;

  if jsonb_array_length(v_pop) = 0 then
    -- a young site: nothing has been searched enough yet, so show the busiest categories
    v_fallback := 'categories';
    select coalesce(jsonb_agg(jsonb_build_object('rank', rn, 'term', label, 'count', 0, 'hot', false, 'pinned', false, 'kind', 'category',
                                                 'label', label, 'slug', slug) order by rn), '[]'::jsonb)
      into v_pop from (select row_number() over (order by weight desc, label) as rn, label, ref as slug
                       from public.search_terms where kind = 'category' order by weight desc, label limit v_limit) t;
  end if;

  return jsonb_build_object('computedAt', v_at, 'live', v_live, 'scope', v_scope, 'county', v_county, 'fallback', v_fallback,
                            'popular', v_pop, 'rising', v_rise, 'risingScope', v_rscope, 'items', v_pop);
end $$;
revoke all on function public.trending_lists(text, integer) from public;
grant execute on function public.trending_lists(text, integer) to anon, authenticated, service_role;

