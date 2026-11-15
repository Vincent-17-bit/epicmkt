-- 0115 (Prompt A22): unmet demand. When a buyer picks filters on an item page that no combination matches (Samsung, 512 GB), the page
-- can tell the seller, once per buyer per day, on a tap.
--
--   unmet_demand           one row per (item, filter set, buyer, day). The buyer is a salted hash of the network address and the date,
--                          the same way search_events does it (0039): no account, no address and no device id is stored.
--   log_unmet_demand       anyone may call it; it returns nothing and never says why it ignored a call (no oracle for abuse).
--                          Rate limits: 12 a minute per buyer, 300 a minute overall. Old rows are pruned.
--   seller_unmet_demand    the seller's own shop only: counts by item and filter for the last 7 or 30 days.
--   admin_unmet_demand     the platform view by category, product type and filter, with the shops behind each count.
--
-- A count is the number of different buyers, so one person pressing the button on ten devices still counts per hash, and one person
-- pressing it ten times counts once.

create table if not exists public.unmet_demand (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  filters jsonb not null,
  filter_key text not null check (char_length(filter_key) between 3 and 400),
  client_hash text not null,
  day date not null default current_date,
  at timestamptz not null default now(),
  constraint unmet_demand_filters_ck check (jsonb_typeof(filters) = 'object' and filters <> '{}'::jsonb and pg_column_size(filters) < 1000),
  unique (item_id, filter_key, client_hash, day)
);
create index if not exists unmet_demand_business_idx on public.unmet_demand (business_id, at desc);
create index if not exists unmet_demand_at_idx on public.unmet_demand (at desc);
create index if not exists unmet_demand_client_idx on public.unmet_demand (client_hash, at desc);

alter table public.unmet_demand enable row level security;
revoke all on public.unmet_demand from public, anon, authenticated;
grant all on public.unmet_demand to service_role;

-- {"brand": "Samsung", "storage": 512} -> a clean map and a sorted key, or null when it is not usable
create or replace function public.unmet_demand_clean(p_filters jsonb) returns jsonb
language plpgsql immutable as $$
declare
  k text; v jsonb; out jsonb := '{}'::jsonb; t text;
begin
  if p_filters is null or jsonb_typeof(p_filters) <> 'object' then return null; end if;
  for k, v in select * from jsonb_each(p_filters) loop
    if k !~ '^[a-z][a-z0-9-]{0,29}$' then return null; end if;
    if jsonb_typeof(v) = 'string' then t := lower(regexp_replace(btrim(v #>> '{}'), '\s+', ' ', 'g'));
    elsif jsonb_typeof(v) = 'number' then t := (v #>> '{}');
    else return null; end if;
    if t is null or char_length(t) = 0 or char_length(t) > 40 or t !~ '^[[:alnum:] .:/+''&-]+$' then return null; end if;
    out := out || jsonb_build_object(k, t);
  end loop;
  if (select count(*) from jsonb_object_keys(out)) not between 1 and 6 then return null; end if;
  return out;
end $$;

create or replace function public.unmet_demand_key(p_clean jsonb) returns text
language sql immutable as $$
  select string_agg(e.key || '=' || (e.value #>> '{}'), '|' order by e.key) from jsonb_each(p_clean) e
$$;

create or replace function public.log_unmet_demand(p_shop uuid, p_item uuid, p_filters jsonb) returns void
language plpgsql volatile security definer set search_path = public, extensions set statement_timeout = '2s' as $$
declare
  v_clean jsonb := public.unmet_demand_clean(p_filters);
  v_headers jsonb;
  v_ip text;
  v_client text;
begin
  if p_shop is null or p_item is null or v_clean is null then return; end if;
  if not exists (select 1 from public.public_items pi where pi.id = p_item and pi.business_id = p_shop) then return; end if;

  v_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_ip := coalesce(nullif(btrim(v_headers ->> 'cf-connecting-ip'), ''), nullif(btrim(v_headers ->> 'x-real-ip'), ''));
  if v_ip is null then return; end if;
  v_client := encode(digest((select salt from public.search_salt limit 1) || ':demand:' || current_date::text || ':' || v_ip, 'sha256'), 'hex');

  if (select count(*) from public.unmet_demand where client_hash = v_client and at > now() - interval '1 minute') >= 12 then return; end if;
  if (select count(*) from public.unmet_demand where at > now() - interval '1 minute') >= 300 then return; end if;

  insert into public.unmet_demand (business_id, item_id, filters, filter_key, client_hash)
  values (p_shop, p_item, v_clean, public.unmet_demand_key(v_clean), v_client)
  on conflict do nothing;

  if random() < 0.02 then
    delete from public.unmet_demand where id in (select id from public.unmet_demand where at < now() - interval '90 days' order by at limit 5000);
  end if;
exception when others then
  return;
end $$;
revoke all on function public.log_unmet_demand(uuid, uuid, jsonb) from public;
grant execute on function public.log_unmet_demand(uuid, uuid, jsonb) to anon, authenticated, service_role;

create or replace function public.seller_unmet_demand(p_period integer default 7) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_biz uuid := public.my_business_id();
  v_days integer := case when p_period = 30 then 30 else 7 end;
begin
  perform public.assert_seller_active();
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if p_period is not null and p_period not in (7, 30) then raise exception 'invalid_period' using errcode = 'P0001'; end if;
  return jsonb_build_object('period', v_days,
    'total', (select count(*) from public.unmet_demand d where d.business_id = v_biz and d.at > now() - make_interval(days => v_days)),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('itemId', r.item_id, 'itemName', r.name, 'filters', r.filters, 'count', r.n) order by r.n desc, r.name, r.filter_key)
      from (select d.item_id, i.name, d.filter_key, min(d.filters::text)::jsonb as filters, count(distinct d.client_hash)::integer as n
              from public.unmet_demand d join public.items i on i.id = d.item_id
             where d.business_id = v_biz and d.at > now() - make_interval(days => v_days)
             group by d.item_id, i.name, d.filter_key order by 5 desc, i.name limit 100) r), '[]'::jsonb));
end $$;
revoke all on function public.seller_unmet_demand(integer) from public, anon;
grant execute on function public.seller_unmet_demand(integer) to authenticated, service_role;

create or replace function public.admin_unmet_demand(p_period integer default 7, p_category text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_days integer := case when p_period = 30 then 30 else 7 end;
begin
  if not public.has_role(array['reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_period is not null and p_period not in (7, 30) then raise exception 'invalid_period' using errcode = 'P0001'; end if;
  return jsonb_build_object('period', v_days,
    'total', (select count(*) from public.unmet_demand d join public.businesses b on b.id = d.business_id
               where d.at > now() - make_interval(days => v_days) and (p_category is null or b.category_id = p_category)),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('categoryId', r.category_id, 'productTypeId', r.product_type_id, 'filters', r.filters, 'count', r.n, 'shops', r.shops)
             order by r.n desc, r.category_id, r.filter_key)
      from (select b.category_id, i.product_type_id, d.filter_key, min(d.filters::text)::jsonb as filters,
                   count(distinct d.client_hash)::integer as n,
                   (select jsonb_agg(jsonb_build_object('id', s.id, 'slug', s.slug, 'name', s.name, 'count', s.c) order by s.c desc, s.name)
                      from (select bb.id, bb.slug, bb.name, count(distinct dd.client_hash)::integer as c
                              from public.unmet_demand dd join public.businesses bb on bb.id = dd.business_id join public.items ii on ii.id = dd.item_id
                             where dd.filter_key = d.filter_key and bb.category_id = b.category_id and ii.product_type_id is not distinct from i.product_type_id
                               and dd.at > now() - make_interval(days => v_days)
                             group by bb.id, bb.slug, bb.name order by 4 desc limit 10) s) as shops
              from public.unmet_demand d join public.businesses b on b.id = d.business_id join public.items i on i.id = d.item_id
             where d.at > now() - make_interval(days => v_days) and (p_category is null or b.category_id = p_category)
             group by b.category_id, i.product_type_id, d.filter_key order by 5 desc limit 200) r), '[]'::jsonb));
end $$;
revoke all on function public.admin_unmet_demand(integer, text) from public, anon;
grant execute on function public.admin_unmet_demand(integer, text) to authenticated, service_role;
