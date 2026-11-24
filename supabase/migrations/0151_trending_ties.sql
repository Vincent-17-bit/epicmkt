-- Trending ties: two terms with the same number of searchers are ordered by who was searched by more people in the last 24 hours, then by name.

create or replace function public.refresh_trending() returns void
language plpgsql volatile security definer set search_path = public, extensions set statement_timeout = '90s' as
$$
declare
  s public.trending_settings;
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_from timestamptz := (((now() at time zone 'Africa/Nairobi')::date - 1)::timestamp at time zone 'Africa/Nairobi');
  v_traffic integer;
  v_min integer;
begin
  select * into s from public.trending_settings limit 1;
  select count(distinct client_hash) into v_traffic from public.search_events where at > now() - interval '48 hours';
  v_min := least(s.min_people_cap, greatest(s.min_people, ceil(coalesce(v_traffic, 0) * s.min_people_pct)::integer));

  drop table if exists t_ev, t_cand, t_res;

  -- a) the daily summary: today and yesterday are always complete in search_events (kept 2 days); a count never goes down.
  create temp table t_ev on commit drop as
    select (e.at at time zone 'Africa/Nairobi')::date as day, e.client_hash,
           public.search_group_key(l.label) as key, l.label
    from public.search_events e
    cross join lateral (select public.search_canon_label(e.term) as label) l
    where e.at >= v_from;
  delete from t_ev where key = '';

  insert into public.search_term_daily (day, term, scope, label, people)
  select day, key, '*', mode() within group (order by label), count(distinct client_hash) from t_ev group by day, key
  on conflict (day, scope, term) do update
    set people = greatest(public.search_term_daily.people, excluded.people), label = excluded.label;

  delete from public.search_term_daily where day < v_today - s.keep_days;

  -- b) candidates: popular (the window's people) and rising (last 24 h against the term's own average of the 7 days before today).
  create temp table t_cand on commit drop as
  with pop as (
    select d.scope, d.term as key, sum(d.people)::integer as people,
           (array_agg(d.label order by d.people desc, d.day desc))[1] as label
    from public.search_term_daily d
    where d.scope = '*' and d.day between v_today - (s.popular_days - 1) and v_today
    group by d.scope, d.term
  ), r24 as (
    select scope, key, count(distinct client_hash)::integer as people, mode() within group (order by label) as label
    from (
      select '*' as scope, public.search_group_key(l.label) as key, e.client_hash, l.label
      from public.search_events e cross join lateral (select public.search_canon_label(e.term) as label) l
      where e.at > now() - interval '24 hours'
    ) x where key <> '' group by scope, key
  ), base as (
    select scope, term as key, sum(people)::numeric / 7.0 as per_day
    from public.search_term_daily where scope = '*' and day between v_today - 7 and v_today - 1 group by scope, term
  )
  select 'popular'::text as list, p.scope, p.key, p.label, p.people, null::numeric as ratio
  from pop p where p.people >= v_min
  union all
  select 'rising', r.scope, r.key, r.label, r.people, round(r.people / greatest(coalesce(b.per_day, 0), 1.0), 2)
  from r24 r left join base b on b.scope = r.scope and b.key = r.key
  where r.people >= v_min and r.people / greatest(coalesce(b.per_day, 0), 1.0) >= s.rising_min_ratio;

  -- hidden words never show; pins are added to the popular list.
  delete from t_cand c where exists (select 1 from public.search_blocklist b where position(b.term in c.label) > 0 or position(b.term in c.key) > 0);

  insert into t_cand (list, scope, key, label, people, ratio)
  select 'popular', sc.scope, public.search_group_key(public.search_canon_label(p.term)), public.search_canon_label(p.term), 0, null
  from public.search_trending_pins p
  cross join (select '*' as scope) sc
  where p.expires_at > now()
    and not exists (select 1 from public.search_blocklist b where position(b.term in p.term) > 0);
  delete from t_cand where key = '';

  -- c) resolve each distinct term once: only what a shopper can reach right now survives.
  create temp table t_res on commit drop as
  select k.key, k.label, r.*
  from (select distinct on (key) key, label from t_cand order by key, people desc) k
  cross join lateral public.search_trending_resolve(k.label) r;

  -- d) store the lists. A tie in people is settled by who was searched by more people in the last 24 hours, then by name.
  create temp table t_r24 on commit drop as
  select public.search_group_key(l.label) as key, count(distinct e.client_hash)::integer as people
  from public.search_events e cross join lateral (select public.search_canon_label(e.term) as label) l
  where e.at > now() - interval '24 hours'
  group by 1;

  delete from public.search_trending;

  insert into public.search_trending (list, scope, rank, term, label, kind, name, people, ratio, hot, pinned, item_id, slug, image, price)
  select list, scope, row_number() over (partition by list, scope order by pinned desc, sortv desc, recent desc, label) as rank,
         key, label, kind, name, people, ratio, hot, pinned, item_id, slug, image, price
  from (
    select c.list, c.scope, c.key, c.label, c.people, c.ratio, r.kind, r.name, r.item_id, r.slug, r.image, r.price,
           (c.list = 'popular' and exists (select 1 from t_cand x where x.list = 'rising' and x.scope = c.scope and x.key = c.key)) as hot,
           (c.list = 'popular' and exists (select 1 from public.search_trending_pins p
                                           where p.expires_at > now() and public.search_group_key(public.search_canon_label(p.term)) = c.key)) as pinned,
           case when c.list = 'rising' then coalesce(c.ratio, 0) * 1000 + c.people else c.people end as sortv,
           coalesce((select x.people from t_r24 x where x.key = c.key), 0) as recent
    from (select distinct on (list, scope, key) * from t_cand order by list, scope, key, people desc) c
    join t_res r on r.key = c.key
  ) q;

  delete from public.search_trending where rank > 20;
  update public.trending_settings set last_run_at = now();
end $$;


create or replace function public.trending_lists(p_county text default null, p_limit integer default 10) returns jsonb
language plpgsql stable security definer set search_path = public set statement_timeout = '3s' as
$$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 20);
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
    select last_run_at into v_at from public.trending_settings limit 1;

    select coalesce(jsonb_agg(jsonb_build_object('rank', rank, 'term', label, 'count', people, 'hot', hot, 'pinned', pinned, 'kind', kind,
                                                 'label', name, 'itemId', item_id, 'slug', slug, 'image', image, 'price', price) order by rank), '[]'::jsonb)
      into v_pop from (select * from public.search_trending where list = 'popular' and scope = v_scope order by rank limit v_limit) t;
    select coalesce(jsonb_agg(jsonb_build_object('rank', rank, 'term', label, 'count', people, 'ratio', ratio, 'hot', true, 'kind', kind,
                                                 'label', name, 'itemId', item_id, 'slug', slug, 'image', image, 'price', price) order by rank), '[]'::jsonb)
      into v_rise from (select * from public.search_trending where list = 'rising' and scope = v_rscope order by rank limit v_limit) t;
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

  return jsonb_build_object('computedAt', v_at, 'live', v_live, 'scope', v_scope, 'fallback', v_fallback,
                            'popular', v_pop, 'rising', v_rise, 'risingScope', v_rscope, 'items', v_pop);
end $$;
revoke all on function public.refresh_trending() from public, anon, authenticated;
grant execute on function public.refresh_trending() to service_role;

select public.refresh_trending();
