create table if not exists public.search_events (
  id bigint generated always as identity primary key,
  term text not null check (char_length(term) between 2 and 60),
  at timestamptz not null default now()
);

create index if not exists search_events_at_idx on public.search_events (at desc);
create index if not exists search_events_term_at_idx on public.search_events (term, at desc);

alter table public.search_events enable row level security;
revoke all on public.search_events from public, anon, authenticated;
grant all on public.search_events to service_role;

create or replace function public.log_search(p_term text) returns void
language plpgsql volatile security definer set search_path = public as
$$
declare
  v_term text := lower(regexp_replace(btrim(coalesce(p_term, '')), '\s+', ' ', 'g'));
begin
  if char_length(v_term) < 2 or char_length(v_term) > 60 then
    return;
  end if;
  insert into public.search_events (term) values (v_term);
  if random() < 0.01 then
    delete from public.search_events where at < now() - interval '7 days';
  end if;
end $$;
revoke all on function public.log_search(text) from public;
grant execute on function public.log_search(text) to anon, authenticated, service_role;

create or replace function public.top_searches(p_limit integer default 10)
returns table (term text, count integer, hot boolean)
language sql stable security definer set search_path = public as
$$
  select
    e.term,
    count(*)::integer as count,
    (count(*) filter (where e.at > now() - interval '3 hours') >= 3
      and count(*) filter (where e.at > now() - interval '3 hours') * 4 >= count(*)) as hot
  from public.search_events e
  where e.at > now() - interval '24 hours'
  group by e.term
  having count(*) >= 2
  order by count(*) desc, e.term
  limit greatest(1, least(coalesce(p_limit, 10), 20))
$$;
revoke all on function public.top_searches(integer) from public;
grant execute on function public.top_searches(integer) to anon, authenticated, service_role;
