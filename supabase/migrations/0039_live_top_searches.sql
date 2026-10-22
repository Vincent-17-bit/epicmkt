create table if not exists public.search_salt (
  id boolean primary key default true check (id),
  salt text not null default gen_random_uuid()::text
);
insert into public.search_salt (id) values (true) on conflict do nothing;

create table if not exists public.search_blocklist (
  term text primary key check (term = lower(btrim(term)) and char_length(term) >= 2)
);

create table if not exists public.search_events (
  id bigint generated always as identity primary key,
  term text not null check (char_length(term) between 2 and 60),
  client_hash text not null,
  bucket bigint not null,
  at timestamptz not null default now(),
  unique (term, client_hash, bucket)
);

create index if not exists search_events_at_idx on public.search_events (at desc);
create index if not exists search_events_client_at_idx on public.search_events (client_hash, at desc);

alter table public.search_salt enable row level security;
alter table public.search_blocklist enable row level security;
alter table public.search_events enable row level security;
revoke all on public.search_salt, public.search_blocklist, public.search_events from public, anon, authenticated;
grant all on public.search_salt, public.search_blocklist, public.search_events to service_role;

create or replace function public.log_search(p_term text) returns void
language plpgsql volatile security definer set search_path = public, extensions set statement_timeout = '2s' as
$$
declare
  v_term text := lower(regexp_replace(btrim(coalesce(p_term, '')), '\s+', ' ', 'g'));
  v_headers jsonb;
  v_ip text;
  v_client text;
begin
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

  insert into public.search_events (term, client_hash, bucket)
  values (v_term, v_client, floor(extract(epoch from now()) / 3600)::bigint)
  on conflict do nothing;

  if random() < 0.01 then
    delete from public.search_events
    where id in (select id from public.search_events where at < now() - interval '2 days' order by at limit 5000);
  end if;
exception when others then
  return;
end $$;
revoke all on function public.log_search(text) from public;
grant execute on function public.log_search(text) to anon, authenticated, service_role;

create or replace function public.top_searches(p_limit integer default 10)
returns table (term text, count integer, hot boolean)
language sql stable security definer set search_path = public set statement_timeout = '3s' as
$$
  select
    e.term,
    count(distinct e.client_hash)::integer as count,
    (count(distinct e.client_hash) filter (where e.at > now() - interval '3 hours') >= 3
      and count(distinct e.client_hash) filter (where e.at > now() - interval '3 hours') * 4 >= count(distinct e.client_hash)) as hot
  from public.search_events e
  where e.at > now() - interval '24 hours'
    and not exists (select 1 from public.search_blocklist b where position(b.term in e.term) > 0)
  group by e.term
  having count(distinct e.client_hash) >= 3
  order by 2 desc, e.term
  limit greatest(1, least(coalesce(p_limit, 10), 20))
$$;
revoke all on function public.top_searches(integer) from public;
grant execute on function public.top_searches(integer) to anon, authenticated, service_role;
