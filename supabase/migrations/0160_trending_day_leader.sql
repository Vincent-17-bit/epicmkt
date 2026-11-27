-- Trending: the most searched word of the last 24 hours always leads Rising ("Fastest rising"), and fewer searches are lost.
-- Searches are summed over the 24 hours (one row per person, word and hour); the word with the most, among words enough different people searched, leads.

create or replace function public.log_search(p_term text, p_county text default null) returns void
language plpgsql volatile security definer set search_path = public, extensions set statement_timeout = '2s' set timezone = 'UTC' as
$$
declare
  v_raw text := lower(btrim(coalesce(p_term, '')));
  v_term text;
  v_headers jsonb;
  v_ip text;
  v_client text;
begin
  if v_raw ~ '@' or v_raw ~ '://' or v_raw ~ 'www\.' then
    return;
  end if;
  v_term := btrim(regexp_replace(regexp_replace(translate(v_raw, '’‘', ''''''), '[.,+/()!?":;]+', ' ', 'g'), '\s+', ' ', 'g'));
  if char_length(v_term) < 2 or char_length(v_term) > 60
    or cardinality(string_to_array(v_term, ' ')) > 6
    or v_term !~ '^[[:alnum:] ''&-]+$'
    or v_term !~ '[[:alpha:]]' then
    return;
  end if;

  v_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_ip := coalesce(nullif(btrim(v_headers ->> 'cf-connecting-ip'), ''), nullif(btrim(v_headers ->> 'x-real-ip'), ''));
  if v_ip is null then
    return;
  end if;

  v_client := encode(digest((select salt from public.search_salt limit 1) || ':' || current_date::text || ':' || v_ip, 'sha256'), 'hex');

  if (select count(*) from public.search_events where client_hash = v_client and at > now() - interval '1 minute') >= 12 then
    return;
  end if;
  if (select count(*) from public.search_events where at > now() - interval '1 minute') >= 300 then
    return;
  end if;

  insert into public.search_events (term, client_hash, bucket, county)
  values (v_term, v_client, floor(extract(epoch from now()) / 3600)::bigint, null)
  on conflict do nothing;

  if random() < 0.01 then
    delete from public.search_events
    where id in (select id from public.search_events where at < now() - interval '2 days' order by at limit 5000);
  end if;
exception when others then
  return;
end $$;
revoke all on function public.log_search(text, text) from public;
grant execute on function public.log_search(text, text) to anon, authenticated, service_role;

create or replace function public.trending_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'computedAt', s.last_run_at,
    'ageMinutes', case when s.last_run_at is null then null else floor(extract(epoch from (now() - s.last_run_at)) / 60)::integer end,
    'staleAfterHours', s.stale_hours,
    'ok', coalesce(s.last_run_at > now() - make_interval(hours => s.stale_hours), false),
    'minPeople', s.min_people,
    'lastSearchAt', (select max(at) from public.search_events),
    'searches24h', (select count(*) from public.search_events where at > now() - interval '24 hours'))
  from public.trending_settings s
$$;
revoke all on function public.trending_status() from public, anon, authenticated;
grant execute on function public.trending_status() to service_role;

create or replace function public.refresh_trending() returns void
language plpgsql volatile security definer set search_path = public, extensions set statement_timeout = '90s' as
$$
declare
  s public.trending_settings;
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_from timestamptz := (((now() at time zone 'Africa/Nairobi')::date - 2)::timestamp at time zone 'Africa/Nairobi');
  v_traffic integer;
  v_min integer;
  w1 integer;
  w2 integer;
  w3 integer;
  v_win integer;
  v_leader text;
begin
  select * into s from public.trending_settings limit 1;
  select count(distinct client_hash) into v_traffic from public.search_events where at > now() - interval '48 hours';
  v_min := least(s.min_people_cap, greatest(s.min_people, ceil(coalesce(v_traffic, 0) * s.min_people_pct)::integer));
  w3 := least(greatest(s.popular_max_days, s.popular_mid_days, s.popular_days), s.keep_days);
  w2 := least(greatest(s.popular_mid_days, s.popular_days), w3);
  w1 := least(s.popular_days, w2);

  drop table if exists t_ev, t_cand, t_res, t_r24;

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

  create temp table t_cand on commit drop as
  with pop as (
    select d.scope, d.term as key, (array_agg(d.label order by d.people desc, d.day desc))[1] as label,
           coalesce(sum(d.people) filter (where d.day > v_today - w1), 0)::integer as p1,
           coalesce(sum(d.people) filter (where d.day > v_today - w2), 0)::integer as p2,
           sum(d.people)::integer as p3,
           coalesce(sum(d.people * d.w) filter (where d.day > v_today - w1), 0) as s1,
           coalesce(sum(d.people * d.w) filter (where d.day > v_today - w2), 0) as s2,
           sum(d.people * d.w) as s3
    from (
      select t.*, case when s.popular_half_life > 0 then power(0.5::numeric, (v_today - t.day)::numeric / s.popular_half_life) else 1 end as w
      from public.search_term_daily t
      where t.scope = '*' and t.day > v_today - w3 and t.day <= v_today
    ) d
    group by d.scope, d.term
  ), r24 as (
    select scope, key, count(distinct client_hash)::integer as people, count(distinct (client_hash, bucket))::integer as searches,
           mode() within group (order by label) as label
    from (
      select '*' as scope, public.search_group_key(l.label) as key, e.client_hash, e.bucket, l.label
      from public.search_events e cross join lateral (select public.search_canon_label(e.term) as label) l
      where e.at > now() - interval '24 hours'
    ) x where key <> '' group by scope, key
  ), base as (
    select scope, term as key, sum(people)::numeric / 7.0 as per_day
    from public.search_term_daily where scope = '*' and day between v_today - 7 and v_today - 1 group by scope, term
  )
  select 'popular'::text as list, p.scope, p.key, p.label, p.p3 as people, null::numeric as ratio,
         p.p1, p.p2, p.p3, p.s1, p.s2, p.s3, null::integer as searches
  from pop p where p.p3 >= v_min
  union all
  select 'rising', r.scope, r.key, r.label, r.people, round(r.people / greatest(coalesce(b.per_day, 0), 1.0), 2),
         null::integer, null::integer, null::integer, null::numeric, null::numeric, null::numeric, r.searches
  from r24 r left join base b on b.scope = r.scope and b.key = r.key
  where r.people >= v_min;

  delete from t_cand c where exists (select 1 from public.search_blocklist b where position(b.term in c.label) > 0 or position(b.term in c.key) > 0);
  delete from t_cand where key = '';

  create temp table t_res on commit drop as
  select k.key, k.label, r.*
  from (select distinct on (key) key, label from t_cand order by key, people desc) k
  cross join lateral public.search_trending_resolve(k.label) r;

  select c.key into v_leader
  from t_cand c join t_res r on r.key = c.key
  where c.list = 'rising'
  order by c.searches desc, c.people desc, coalesce(c.ratio, 0) desc, c.label
  limit 1;

  delete from t_cand c where c.list = 'rising' and c.key is distinct from v_leader and coalesce(c.ratio, 0) < s.rising_min_ratio;

  select case when x.n1 >= s.popular_target then w1 when x.n2 >= s.popular_target then w2 else w3 end into v_win
  from (
    select count(*) filter (where c.p1 >= v_min) as n1, count(*) filter (where c.p2 >= v_min) as n2
    from (select distinct on (key) * from t_cand where list = 'popular' order by key) c
    join t_res r on r.key = c.key
  ) x;

  create temp table t_r24 on commit drop as
  select public.search_group_key(l.label) as key, count(distinct e.client_hash)::integer as people
  from public.search_events e cross join lateral (select public.search_canon_label(e.term) as label) l
  where e.at > now() - interval '24 hours'
  group by 1;

  delete from public.search_trending;

  insert into public.search_trending (list, scope, rank, term, label, kind, name, people, ratio, hot, pinned, item_id, slug, image, price, window_days)
  select list, scope, row_number() over (partition by list, scope order by sortv desc, recent desc, label) as rank,
         key, label, kind, name, people, ratio, hot, false, item_id, slug, image, price, case when list = 'popular' then v_win end
  from (
    select c.list, c.scope, c.key, c.label, r.kind, r.name, r.item_id, r.slug, r.image, r.price, c.ratio,
           case when c.list = 'popular' then case v_win when w1 then c.p1 when w2 then c.p2 else c.p3 end else c.people end as people,
           (c.list = 'popular' and exists (select 1 from t_cand x where x.list = 'rising' and x.scope = c.scope and x.key = c.key)) as hot,
           round(case
             when c.list = 'rising' and c.key = v_leader then 1000000000000::numeric
             when c.list = 'rising' then coalesce(c.ratio, 0) * 1000 + c.people
             when s.popular_half_life > 0 then case v_win when w1 then c.s1 when w2 then c.s2 else c.s3 end
             else (case v_win when w1 then c.p1 when w2 then c.p2 else c.p3 end)::numeric
           end, 6) as sortv,
           coalesce((select x.people from t_r24 x where x.key = c.key), 0) as recent
    from (select distinct on (list, scope, key) * from t_cand order by list, scope, key, people desc) c
    join t_res r on r.key = c.key
    where c.list = 'rising' or (case v_win when w1 then c.p1 when w2 then c.p2 else c.p3 end) >= v_min
  ) q;

  delete from public.search_trending where rank > 20;
  update public.trending_settings set last_run_at = now();
end $$;
revoke all on function public.refresh_trending() from public, anon, authenticated;
grant execute on function public.refresh_trending() to service_role;

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
  v_win integer;
begin
  if v_fresh then
    select last_run_at into v_at from public.trending_settings limit 1;
    select max(window_days) into v_win from public.search_trending where list = 'popular' and scope = v_scope;

    select coalesce(jsonb_agg(jsonb_build_object('rank', rank, 'term', label, 'count', people, 'hot', hot, 'pinned', pinned, 'kind', kind,
                                                 'label', name, 'itemId', item_id, 'slug', slug, 'image', image, 'price', price) order by rank), '[]'::jsonb)
      into v_pop from (select * from public.search_trending s where s.list = 'popular' and s.scope = v_scope and public.trending_row_is_live(s.kind, s.item_id, s.slug) order by s.rank limit v_limit) t;
    select coalesce(jsonb_agg(jsonb_build_object('rank', rank, 'term', label, 'count', people, 'ratio', ratio, 'hot', true, 'kind', kind,
                                                 'label', name, 'itemId', item_id, 'slug', slug, 'image', image, 'price', price) order by rank), '[]'::jsonb)
      into v_rise from (select * from public.search_trending s where s.list = 'rising' and s.scope = v_rscope and public.trending_row_is_live(s.kind, s.item_id, s.slug) order by s.rank limit v_limit) t;
  else
    v_live := true;
    v_win := 1;
    select coalesce(jsonb_agg(jsonb_build_object('rank', rn, 'term', term, 'count', count, 'hot', hot, 'pinned', false, 'kind', null) order by rn), '[]'::jsonb)
      into v_pop from (select row_number() over () as rn, * from public.top_searches(v_limit)) t;
    select coalesce(jsonb_agg(e.el || jsonb_build_object('hot', true) order by e.ord), '[]'::jsonb)
      into v_rise from jsonb_array_elements(v_pop) with ordinality as e(el, ord)
      where e.ord = 1 or coalesce((e.el ->> 'hot')::boolean, false);
  end if;

  if jsonb_array_length(v_pop) = 0 then
    v_fallback := 'categories';
    v_win := null;
    select coalesce(jsonb_agg(jsonb_build_object('rank', rn, 'term', label, 'count', 0, 'hot', false, 'pinned', false, 'kind', 'category',
                                                 'label', label, 'slug', slug) order by rn), '[]'::jsonb)
      into v_pop from (select row_number() over (order by n desc, label) as rn, label, slug
                       from (select t.label, t.ref as slug,
                                    (select count(*) from public.businesses b where b.category_id = t.ref and public.business_is_visible(b)) as n
                             from public.search_terms t where t.kind = 'category') c
                       order by n desc, label limit v_limit) t;
  end if;

  return jsonb_build_object('computedAt', v_at, 'live', v_live, 'scope', v_scope, 'fallback', v_fallback, 'windowDays', v_win,
                            'popular', v_pop, 'rising', v_rise, 'risingScope', v_rscope, 'items', v_pop);
end $$;

insert into public.search_term_daily (day, term, scope, label, people)
select e.day, e.key, '*', mode() within group (order by e.label), count(distinct e.client_hash)
from (
  select (ev.at at time zone 'Africa/Nairobi')::date as day, ev.client_hash,
         public.search_group_key(l.label) as key, l.label
  from public.search_events ev cross join lateral (select public.search_canon_label(ev.term) as label) l
) e
where e.key <> ''
group by e.day, e.key
on conflict (day, scope, term) do update
  set people = greatest(public.search_term_daily.people, excluded.people), label = excluded.label;

select public.refresh_trending();
