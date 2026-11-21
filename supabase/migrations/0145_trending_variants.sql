-- 0145_trending_variants.sql
-- Trending searches that read like a person would: variants of one search count as one, shop names are not product trends, and a
-- list that qualified with one or two terms is topped up from the wider windows of 0144.
--
--   1. Variants. "red bull", "redbull" and "red bulls" are one search; so are "cake" and "cakes", and a typo of a popular term
--      ("brread" for "bread"). Each person still counts once across all the variants they typed. The list shows the variant most
--      people typed (the spaced one on a tie).
--        - spelling key: lower case, letters and digits only, a plural "s" removed (not "ss"): search_term_key()
--        - typos: a term of 5 or more letters joins the more popular term (2 or more searchers) that starts with the same letter, is
--          within 2 edits and has trigram similarity of 0.5 or more. "shirt" and "skirt" (similarity 0.33) stay apart.
--          Two hops at most, so a variant of a variant still lands on the most popular term.
--   2. Shop names. A term that is the name of a live shop (same spelling key, or trigram similarity of 0.6 or more) is someone
--      looking for the shop, not a product: it does not count as trending. A shop name never takes the window's place: a window
--      whose only qualifying terms are shop names counts as empty and the next window is tried.
--   3. Top-up. The list is decided by the first window that has a qualifying term (24 hours, then 48 hours, then 7 days: 0144).
--      When that window gives fewer than 5 terms (or fewer than the limit, when the limit is smaller), terms from the wider windows are
--      appended after them, most searched first, never above them, never twice, and never beyond 5. A full list is not padded.
-- Unchanged: at least 3 different searchers, the blocklist, the limit (1 to 20), the output (term, count, hot), the grants, `hot`.
-- refresh_top_searches (0128) and top_searches_hourly read top_searches, so the hourly list gets all of this.
--
-- Additive and reversible. Rollback: run the top_searches definition of 0144 again, then
--   drop function public.trending_in_window(interval, integer); drop function public.search_term_key(text);

create or replace function public.search_term_key(p_term text) returns text
language sql immutable parallel safe as
$$
  select regexp_replace(regexp_replace(lower(coalesce(p_term, '')), '[^a-z0-9]', '', 'g'), '([^s])s$', '\1')
$$;

-- One window: the qualifying terms, variants folded, shop names left out. Internal: the browser roles call top_searches, not this.
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
    where b.status = 'live'
      and (public.search_term_key(b.name) = a.root or extensions.similarity(lower(b.name), s.term) >= 0.6)
  )
  order by 2 desc, 1
  limit greatest(1, least(coalesce(p_limit, 20), 20))
$$;
revoke all on function public.trending_in_window(interval, integer) from public, anon, authenticated;
grant execute on function public.trending_in_window(interval, integer) to service_role;

create or replace function public.top_searches(p_limit integer default 10)
returns table (term text, count integer, hot boolean)
language plpgsql stable security definer set search_path = public, extensions set statement_timeout = '3s' as
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
      -- the deciding window may fill the whole limit; wider windows only top up to the minimum
      if (v_first and v_n >= v_limit) or (not v_first and v_n >= v_min) then exit; end if;
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
revoke all on function public.top_searches(integer) from public;
grant execute on function public.top_searches(integer) to anon, authenticated, service_role;
