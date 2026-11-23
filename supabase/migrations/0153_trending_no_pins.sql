-- Trending: the ranking is worked out by the system alone. No admin can pin a word to the top any more.
--
-- Before: an admin could pin up to 3 words to the top of Popular for 1 to 30 days (search_trending_pins). A pinned word was added to the
-- candidates even with no searchers and was sorted ahead of everything else (`order by pinned desc`), so it overrode the real ranking.
-- Now: Popular is ordered only by how many different people searched (ties: more people in the last 24 hours, then name), and Rising by its
-- jump. What stays: hiding a word (moderation, search_blocklist) and synonyms (merging spellings so their counts join). Neither changes the
-- order of the words that remain; they only decide what is counted and what is allowed to show.
--
-- The `pinned` column on search_trending and in the lists is kept (always false) so older readers keep working.

-- 1. the rebuild without pins ----------------------------------------------------------------------------------------------------------

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

  -- hidden words never show. Nothing is added by hand: every word in the lists got there by being searched.
  delete from t_cand c where exists (select 1 from public.search_blocklist b where position(b.term in c.label) > 0 or position(b.term in c.key) > 0);
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
  select list, scope, row_number() over (partition by list, scope order by sortv desc, recent desc, label) as rank,
         key, label, kind, name, people, ratio, hot, false, item_id, slug, image, price
  from (
    select c.list, c.scope, c.key, c.label, c.people, c.ratio, r.kind, r.name, r.item_id, r.slug, r.image, r.price,
           (c.list = 'popular' and exists (select 1 from t_cand x where x.list = 'rising' and x.scope = c.scope and x.key = c.key)) as hot,
           case when c.list = 'rising' then coalesce(c.ratio, 0) * 1000 + c.people else c.people end as sortv,
           coalesce((select x.people from t_r24 x where x.key = c.key), 0) as recent
    from (select distinct on (list, scope, key) * from t_cand order by list, scope, key, people desc) c
    join t_res r on r.key = c.key
  ) q;

  delete from public.search_trending where rank > 20;
  update public.trending_settings set last_run_at = now();
end $$;
revoke all on function public.refresh_trending() from public, anon, authenticated;
grant execute on function public.refresh_trending() to service_role;

-- 2. the admin overview and hide, without pins ---------------------------------------------------------------------------------------

create or replace function public.admin_trending_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(array['reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'status', public.trending_status(),
    'popular', coalesce((select jsonb_agg(jsonb_build_object('rank', rank, 'term', label, 'kind', kind, 'name', name, 'people', people, 'hot', hot) order by rank)
                         from public.search_trending where list = 'popular' and scope = '*'), '[]'::jsonb),
    'rising', coalesce((select jsonb_agg(jsonb_build_object('rank', rank, 'term', label, 'kind', kind, 'name', name, 'people', people, 'ratio', ratio) order by rank)
                        from public.search_trending where list = 'rising' and scope = '*'), '[]'::jsonb),
    'counties', coalesce((select jsonb_agg(distinct scope) from public.search_trending where scope <> '*'), '[]'::jsonb),
    'hidden', coalesce((select jsonb_agg(term order by term) from public.search_blocklist), '[]'::jsonb),
    'synonyms', coalesce((select jsonb_agg(jsonb_build_object('variant', variant, 'canonical', canonical) order by variant) from public.search_synonyms), '[]'::jsonb));
end $$;

-- Hiding is immediate: it goes in the blocklist and out of the stored lists (a term containing the word is hidden, as in 0039).
create or replace function public.admin_trending_hide(p_term text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_term text := lower(regexp_replace(btrim(coalesce(p_term, '')), '\s+', ' ', 'g'));
begin
  if not public.has_role(array['reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(v_term) < 2 then raise exception 'term must be at least 2 characters'; end if;
  insert into public.search_blocklist (term) values (v_term) on conflict do nothing;
  delete from public.search_trending where position(v_term in lower(label)) > 0 or position(v_term in term) > 0;
end $$;

-- 3. remove the pins -----------------------------------------------------------------------------------------------------------------

drop function if exists public.admin_trending_pin(text, integer, text);
drop function if exists public.admin_trending_unpin(text);
drop table if exists public.search_trending_pins;

-- Rebuild now so a word that was only on the list because it was pinned leaves it straight away.
select public.refresh_trending();
