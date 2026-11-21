-- 0144_trending_fallback.sql
-- "Trending searches" never go blank just because the last 24 hours were quiet.
--
-- Before: top_searches listed terms that at least 3 different searchers used in the last 24 hours, and nothing otherwise, so a quiet day gave an
-- empty list.
-- Now: the same rule, tried over wider windows until one has a result:
--     1. the last 24 hours                       (as before; the common case, and the only window read when it has a result)
--     2. the last 48 hours (the previous day too)
--     3. the last 7 days
-- The first window that has at least one qualifying term decides the whole list, so a busy day is never mixed with older searches.
-- Unchanged: at least 3 different searchers (count(distinct client_hash)), the blocklist, the limit (1 to 20, default 10), the output columns
-- (term, count, hot), the grants. `hot` still means "3 or more searchers in the last 3 hours AND a quarter or more of the window's searchers",
-- so a term shown only because the list was widened is never marked hot.
-- refresh_top_searches (0128) and top_searches_hourly read top_searches, so the hourly list and the live fallback both get this.
--
-- Additive and reversible: same signature, create or replace. Rollback: run the top_searches definition of 0039 again.

create or replace function public.top_searches(p_limit integer default 10)
returns table (term text, count integer, hot boolean)
language plpgsql stable security definer set search_path = public set statement_timeout = '3s' as
$$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 20));
  v_window interval;
begin
  foreach v_window in array array[interval '24 hours', interval '48 hours', interval '7 days'] loop
    return query
      select
        e.term,
        count(distinct e.client_hash)::integer as count,
        (count(distinct e.client_hash) filter (where e.at > now() - interval '3 hours') >= 3
          and count(distinct e.client_hash) filter (where e.at > now() - interval '3 hours') * 4 >= count(distinct e.client_hash)) as hot
      from public.search_events e
      where e.at > now() - v_window
        and not exists (select 1 from public.search_blocklist b where position(b.term in e.term) > 0)
      group by e.term
      having count(distinct e.client_hash) >= 3
      order by 2 desc, e.term
      limit v_limit;
    if found then return; end if;
  end loop;
  return;
end
$$;
revoke all on function public.top_searches(integer) from public;
grant execute on function public.top_searches(integer) to anon, authenticated, service_role;
