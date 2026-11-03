create table if not exists public.item_events (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  kind text not null check (kind in ('view', 'whatsapp', 'call')),
  client_hash text not null,
  day date not null,
  at timestamptz not null default now(),
  unique (item_id, kind, client_hash, day)
);

create index if not exists item_events_item_day_idx on public.item_events (item_id, day desc);
create index if not exists item_events_client_at_idx on public.item_events (client_hash, at desc);
create index if not exists item_events_at_idx on public.item_events (at desc);

alter table public.item_events enable row level security;
revoke all on public.item_events from public, anon, authenticated;
grant all on public.item_events to service_role;

create or replace function public.log_item_event(p_item_id uuid, p_kind text) returns void
language plpgsql volatile security definer set search_path = public, extensions set statement_timeout = '2s' as
$$
declare
  v_business uuid;
  v_headers jsonb;
  v_ip text;
  v_client text;
begin
  if p_item_id is null or p_kind is null or p_kind not in ('view', 'whatsapp', 'call') then
    return;
  end if;

  select pi.business_id into v_business from public.public_items pi where pi.id = p_item_id;
  if v_business is null then
    return;
  end if;

  v_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_ip := coalesce(nullif(btrim(v_headers ->> 'cf-connecting-ip'), ''), nullif(btrim(v_headers ->> 'x-real-ip'), ''));
  if v_ip is null then
    return;
  end if;

  v_client := encode(digest((select salt from public.search_salt limit 1) || ':item:' || current_date::text || ':' || v_ip, 'sha256'), 'hex');

  if (select count(*) from public.item_events where client_hash = v_client and at > now() - interval '1 minute') >= 60 then
    return;
  end if;
  if (select count(*) from public.item_events where at > now() - interval '1 minute') >= 3000 then
    return;
  end if;

  insert into public.item_events (business_id, item_id, kind, client_hash, day)
  values (v_business, p_item_id, p_kind, v_client, (now() at time zone 'Africa/Nairobi')::date)
  on conflict do nothing;

  if random() < 0.01 then
    delete from public.item_events
    where id in (select id from public.item_events where at < now() - interval '120 days' order by at limit 5000);
  end if;
exception when others then
  return;
end $$;
revoke all on function public.log_item_event(uuid, text) from public;
grant execute on function public.log_item_event(uuid, text) to anon, authenticated, service_role;

create or replace function public.seller_item_stats(p_item_id uuid, p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = public set statement_timeout = '5s' as
$$
declare
  v_id uuid := public.my_business_id();
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_start date;
  v_prev date;
  v_daily jsonb;
  v_now jsonb;
  v_before jsonb;
begin
  perform public.assert_seller_active();
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if p_days is null or p_days not in (7, 30, 90) then raise exception 'invalid_days' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.items i where i.id = p_item_id and i.business_id = v_id and not i.removed_by_admin) then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;

  v_start := v_today - (p_days - 1);
  v_prev := v_start - p_days;

  select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'views', coalesce(e.views, 0), 'whatsapp', coalesce(e.whatsapp, 0), 'call', coalesce(e.calls, 0)) order by d.day), '[]'::jsonb)
    into v_daily
    from generate_series(v_start, v_today, interval '1 day') as g(day)
    cross join lateral (select g.day::date as day) d
    left join (
      select ev.day,
             count(*) filter (where ev.kind = 'view')::integer as views,
             count(*) filter (where ev.kind = 'whatsapp')::integer as whatsapp,
             count(*) filter (where ev.kind = 'call')::integer as calls
        from public.item_events ev
       where ev.item_id = p_item_id and ev.day >= v_start and ev.day <= v_today
       group by ev.day
    ) e on e.day = d.day;

  select jsonb_build_object(
           'views', count(*) filter (where ev.kind = 'view'),
           'whatsapp', count(*) filter (where ev.kind = 'whatsapp'),
           'call', count(*) filter (where ev.kind = 'call'))
    into v_now
    from public.item_events ev
   where ev.item_id = p_item_id and ev.day >= v_start and ev.day <= v_today;

  select jsonb_build_object(
           'views', count(*) filter (where ev.kind = 'view'),
           'whatsapp', count(*) filter (where ev.kind = 'whatsapp'),
           'call', count(*) filter (where ev.kind = 'call'))
    into v_before
    from public.item_events ev
   where ev.item_id = p_item_id and ev.day >= v_prev and ev.day < v_start;

  return jsonb_build_object('days', p_days, 'totals', v_now, 'previous', v_before, 'daily', v_daily);
end $$;
revoke all on function public.seller_item_stats(uuid, integer) from public, anon;
grant execute on function public.seller_item_stats(uuid, integer) to authenticated, service_role;
