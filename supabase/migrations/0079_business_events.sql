-- 0079_business_events.sql
-- Views and contact taps, stored for real, so the seller Performance panel reads numbers that survive a restart.
--
-- Until now logContactEvent only bumped an in-memory mock. This adds:
--   business_events        short-lived raw rows, used ONLY to de-duplicate (like search_events). One row per
--                          (business, item, type, anonymous client, hour). Pruned after 2 days.
--   business_event_daily   the permanent record: one row per (business, Nairobi day, type, item) with a count.
--                          A 36-month or all-time range reads at most ~365 rows per type per business, never raw events.
--   log_business_event()   what the customer app calls. Writes the raw row and, only when it was new, adds 1 to the rollup in
--                          the same transaction, so the two can never disagree and no job is needed to keep them fresh.
--   seller_performance()   the panel's read: totals plus a gap-filled series for a range. Same for every plan (no plan gate).
--   seller_item_history()  the item History list. Everyone gets the newest 5; Premium gets all (limit key historyEntries).
--
-- Privacy: no raw IP is stored. The client hash is sha256(salt : UTC day : IP), salted per purpose so it cannot be joined to
-- search_events, and it changes every day. Rows with no IP header are dropped, as log_search does.
-- Days are Nairobi calendar days (docs/timezones.md: an analytics day bucket is a date; the zone is named, never the session's).
-- Rollup rows keep item_id as a plain uuid with no foreign key: deleting an item must not change the shop's totals.
-- Additive; safe to run again.

create table if not exists public.business_events (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  item_id uuid references public.items(id) on delete cascade,
  type text not null check (type in ('view', 'call', 'whatsapp', 'directions')),
  client_hash text not null,
  bucket bigint not null,
  created_at timestamptz not null default now()
);
create unique index if not exists business_events_dedupe_idx
  on public.business_events (business_id, coalesce(item_id, '00000000-0000-0000-0000-000000000000'::uuid), type, client_hash, bucket);
create index if not exists business_events_created_idx on public.business_events (created_at);
create index if not exists business_events_client_idx on public.business_events (client_hash, created_at desc);

create table if not exists public.business_event_daily (
  business_id uuid not null references public.businesses(id) on delete cascade,
  day date not null,
  type text not null check (type in ('view', 'call', 'whatsapp', 'directions')),
  item_id uuid,
  n integer not null default 0 check (n >= 0)
);
create unique index if not exists business_event_daily_key
  on public.business_event_daily (business_id, day, type, coalesce(item_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists business_event_daily_day_idx on public.business_event_daily (business_id, day);

alter table public.business_events enable row level security;
alter table public.business_event_daily enable row level security;
revoke all on public.business_events, public.business_event_daily from public, anon, authenticated;
grant all on public.business_events, public.business_event_daily to service_role;

create or replace function public.log_business_event(p_business_id uuid, p_type text, p_item_id uuid default null) returns void
language plpgsql volatile security definer set search_path = public, extensions set statement_timeout = '2s' as
$$
declare
  v_headers jsonb;
  v_ip text;
  v_client text;
  v_rows integer;
  c_zero constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  if p_business_id is null or p_type is null or p_type not in ('view', 'call', 'whatsapp', 'directions') then
    return;
  end if;

  v_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_ip := coalesce(nullif(btrim(v_headers ->> 'cf-connecting-ip'), ''), nullif(btrim(v_headers ->> 'x-real-ip'), ''));
  if v_ip is null then
    return;
  end if;

  if not exists (select 1 from public.businesses b where b.id = p_business_id and b.status = 'live') then
    return;
  end if;
  if p_item_id is not null and not exists (select 1 from public.items i where i.id = p_item_id and i.business_id = p_business_id) then
    return;
  end if;

  v_client := encode(digest((select salt from public.search_salt limit 1) || ':event:' || (now() at time zone 'UTC')::date::text || ':' || v_ip, 'sha256'), 'hex');

  if (select count(*) from public.business_events where client_hash = v_client and created_at > now() - interval '1 minute') >= 60 then
    return;
  end if;
  if (select count(*) from public.business_events where created_at > now() - interval '1 minute') >= 3000 then
    return;
  end if;

  insert into public.business_events (business_id, item_id, type, client_hash, bucket)
  values (p_business_id, p_item_id, p_type, v_client, floor(extract(epoch from now()) / 3600)::bigint)
  on conflict do nothing;
  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    insert into public.business_event_daily (business_id, day, type, item_id, n)
    values (p_business_id, (now() at time zone 'Africa/Nairobi')::date, p_type, p_item_id, 1)
    on conflict (business_id, day, type, (coalesce(item_id, c_zero))) do update set n = public.business_event_daily.n + 1;
  end if;

  if random() < 0.01 then
    delete from public.business_events
    where id in (select id from public.business_events where created_at < now() - interval '2 days' order by created_at limit 5000);
  end if;
exception when others then
  return;
end $$;
revoke all on function public.log_business_event(uuid, text, uuid) from public;
grant execute on function public.log_business_event(uuid, text, uuid) to anon, authenticated, service_role;

-- Ranges: 7d, 1m, 6m, 12m, 24m, 36m, all. The series is gap-filled so the chart never has to guess a missing day.
-- Grain follows the span so a long range stays a few dozen points: up to 62 days by day, up to 400 by week, longer by month.
create or replace function public.seller_performance(p_range text default '1m', p_item_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public set statement_timeout = '5s' as
$$
declare
  v_id uuid := public.my_business_id();
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_from date;
  v_grain text;
  v_first date;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;

  if p_range = '7d' then v_from := v_today - 6;
  elsif p_range = '1m' then v_from := (v_today - interval '1 month')::date + 1;
  elsif p_range = '6m' then v_from := (v_today - interval '6 months')::date + 1;
  elsif p_range = '12m' then v_from := (v_today - interval '12 months')::date + 1;
  elsif p_range = '24m' then v_from := (v_today - interval '24 months')::date + 1;
  elsif p_range = '36m' then v_from := (v_today - interval '36 months')::date + 1;
  elsif p_range = 'all' then
    select min(d.day) into v_first from public.business_event_daily d where d.business_id = v_id;
    v_from := coalesce(v_first, v_today);
  else
    raise exception 'invalid_range' using errcode = 'P0001';
  end if;

  v_grain := case when v_today - v_from <= 62 then 'day' when v_today - v_from <= 400 then 'week' else 'month' end;

  return jsonb_build_object(
    'range', p_range,
    'grain', v_grain,
    'from', v_from,
    'to', v_today,
    'totals', (
      select jsonb_build_object(
        'view', coalesce(sum(d.n) filter (where d.type = 'view'), 0),
        'whatsapp', coalesce(sum(d.n) filter (where d.type = 'whatsapp'), 0),
        'call', coalesce(sum(d.n) filter (where d.type = 'call'), 0),
        'directions', coalesce(sum(d.n) filter (where d.type = 'directions'), 0))
      from public.business_event_daily d
      where d.business_id = v_id and d.day between v_from and v_today and (p_item_id is null or d.item_id = p_item_id)
    ),
    'series', coalesce((
      select jsonb_agg(jsonb_build_object('bucket', g.b, 'view', coalesce(s.v, 0), 'whatsapp', coalesce(s.w, 0), 'call', coalesce(s.c, 0), 'directions', coalesce(s.r, 0)) order by g.b)
      from generate_series(date_trunc(v_grain, v_from::timestamp), v_today::timestamp, ('1 ' || v_grain)::interval) as g(b)
      left join (
        select date_trunc(v_grain, d.day::timestamp) as b,
          sum(d.n) filter (where d.type = 'view') as v,
          sum(d.n) filter (where d.type = 'whatsapp') as w,
          sum(d.n) filter (where d.type = 'call') as c,
          sum(d.n) filter (where d.type = 'directions') as r
        from public.business_event_daily d
        where d.business_id = v_id and d.day between v_from and v_today and (p_item_id is null or d.item_id = p_item_id)
        group by 1
      ) s on s.b = g.b
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.seller_performance(text, uuid) from public, anon;
grant execute on function public.seller_performance(text, uuid) to authenticated, service_role;

-- The History gate. Same resolution as the app's limitsFor(): the plan default (standard 5, premium all) unless global_limits
-- carries a historyEntries key for that plan, where an explicit null means "all".
create or replace function public.seller_item_history(p_item_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
declare
  v_id uuid := public.my_business_id();
  v_plan text;
  v_over jsonb;
  v_limit integer;
  v_total integer;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if not exists (select 1 from public.items i where i.id = p_item_id and i.business_id = v_id) then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;

  select b.plan_key into v_plan from public.businesses b where b.id = v_id;
  select case when v_plan = 'premium' then g.premium else g.standard end into v_over from public.global_limits g where g.id = 1;
  v_over := coalesce(v_over, '{}'::jsonb);
  v_limit := case when v_over ? 'historyEntries' then (v_over ->> 'historyEntries')::integer
                  when v_plan = 'premium' then null else 5 end;

  select count(*) into v_total from public.item_history h where h.item_id = p_item_id and h.business_id = v_id;

  return jsonb_build_object(
    'limit', v_limit,
    'total', v_total,
    'locked', v_limit is not null and v_total > v_limit,
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'field', e.field, 'old_value', e.old_value, 'new_value', e.new_value, 'actor_role', e.actor_role, 'created_at', e.created_at) order by e.created_at desc, e.id desc)
      from (
        select h.id, h.field, h.old_value, h.new_value, h.actor_role, h.created_at
        from public.item_history h
        where h.item_id = p_item_id and h.business_id = v_id
        order by h.created_at desc, h.id desc
        limit v_limit
      ) e
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.seller_item_history(uuid) from public, anon;
grant execute on function public.seller_item_history(uuid) to authenticated, service_role;

-- Deals tab: how this item did on the days each flash sale or offer ran. The rollup is per Nairobi day, so a deal is credited with
-- every view and tap the item got on any day the deal was running (a day it shared with normal trading counts in full).
-- Premium only (limit key flashAttribution). Standard gets { locked: true } and no numbers at all, never a partial answer.
create or replace function public.seller_item_deals(p_item_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public set statement_timeout = '5s' as
$$
declare
  v_id uuid := public.my_business_id();
  v_plan text;
  v_over jsonb;
  v_allowed boolean;
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if not exists (select 1 from public.items i where i.id = p_item_id and i.business_id = v_id) then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;

  select b.plan_key into v_plan from public.businesses b where b.id = v_id;
  select case when v_plan = 'premium' then g.premium else g.standard end into v_over from public.global_limits g where g.id = 1;
  v_over := coalesce(v_over, '{}'::jsonb);
  v_allowed := case when v_over ? 'flashAttribution' then coalesce((v_over ->> 'flashAttribution')::boolean, false) else v_plan = 'premium' end;
  if not v_allowed then
    return jsonb_build_object('locked', true, 'flash', '[]'::jsonb, 'offers', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'locked', false,
    'flash', coalesce((
      select jsonb_agg(row_to_json(x) order by x.starts_at desc) from (
        select f.id, f.headline, f.status, f.starts_at, f.ends_at,
          coalesce(sum(d.n) filter (where d.type = 'view'), 0)::int as view,
          coalesce(sum(d.n) filter (where d.type = 'whatsapp'), 0)::int as whatsapp,
          coalesce(sum(d.n) filter (where d.type = 'call'), 0)::int as call,
          coalesce(sum(d.n) filter (where d.type = 'directions'), 0)::int as directions
        from public.flash_sales f
        left join public.business_event_daily d on d.business_id = f.business_id and d.item_id = f.item_id
          and d.day between (f.starts_at at time zone 'Africa/Nairobi')::date and (coalesce(f.ended_at, f.ends_at) at time zone 'Africa/Nairobi')::date
        where f.item_id = p_item_id and f.business_id = v_id and f.status <> 'cancelled'
        group by f.id
        order by f.starts_at desc limit 20
      ) x), '[]'::jsonb),
    'offers', coalesce((
      select jsonb_agg(row_to_json(x) order by x.starts_at desc) from (
        select o.id, o.title, o.active, coalesce(o.starts_at, o.created_at) as starts_at, o.ends_at,
          coalesce(sum(d.n) filter (where d.type = 'view'), 0)::int as view,
          coalesce(sum(d.n) filter (where d.type = 'whatsapp'), 0)::int as whatsapp,
          coalesce(sum(d.n) filter (where d.type = 'call'), 0)::int as call,
          coalesce(sum(d.n) filter (where d.type = 'directions'), 0)::int as directions
        from public.offer_items oi
        join public.offers o on o.id = oi.offer_id and o.business_id = v_id and not o.removed_by_admin
        left join public.business_event_daily d on d.business_id = o.business_id and d.item_id = oi.item_id
          and d.day between (coalesce(o.starts_at, o.created_at) at time zone 'Africa/Nairobi')::date
            and least(v_today, (case when o.active then coalesce(o.ends_at, now()) else least(coalesce(o.ends_at, o.updated_at), o.updated_at) end at time zone 'Africa/Nairobi')::date)
        where oi.item_id = p_item_id
        group by o.id
        order by coalesce(o.starts_at, o.created_at) desc limit 20
      ) x), '[]'::jsonb)
  );
end $$;
revoke all on function public.seller_item_deals(uuid) from public, anon;
grant execute on function public.seller_item_deals(uuid) to authenticated, service_role;
