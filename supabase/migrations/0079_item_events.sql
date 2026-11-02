create table if not exists public.item_events (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  kind text not null check (kind in ('view', 'whatsapp', 'call')),
  flash boolean not null default false,
  offer boolean not null default false,
  client_hash text not null,
  bucket bigint not null,
  at timestamptz not null default now()
);

create index if not exists item_events_item_at_idx on public.item_events (item_id, at desc);
create index if not exists item_events_client_at_idx on public.item_events (client_hash, at desc);
create unique index if not exists item_events_view_once_idx on public.item_events (item_id, client_hash, bucket) where kind = 'view';

alter table public.item_events enable row level security;
revoke all on public.item_events from public, anon, authenticated;
grant select on public.item_events to authenticated;
grant all on public.item_events to service_role;

drop policy if exists "seller reads own item_events" on public.item_events;
create policy "seller reads own item_events" on public.item_events for select to authenticated using (business_id = public.my_business_id());
drop policy if exists "admin reads item_events" on public.item_events;
create policy "admin reads item_events" on public.item_events for select to authenticated using (public.is_admin());

create or replace function public.log_item_event(p_item uuid, p_kind text, p_flash boolean default false, p_offer boolean default false) returns void
language plpgsql volatile security definer set search_path = public, extensions set statement_timeout = '2s' as
$$
declare
  v_biz uuid;
  v_headers jsonb;
  v_ip text;
  v_client text;
begin
  if p_item is null or p_kind not in ('view', 'whatsapp', 'call') then
    return;
  end if;

  select i.business_id into v_biz
  from public.items i
  join public.businesses b on b.id = i.business_id
  where i.id = p_item and i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin and b.status = 'live';
  if v_biz is null then
    return;
  end if;

  v_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_ip := coalesce(nullif(btrim(v_headers ->> 'cf-connecting-ip'), ''), nullif(btrim(v_headers ->> 'x-real-ip'), ''));
  if v_ip is null then
    return;
  end if;

  v_client := encode(digest((select salt from public.search_salt limit 1) || ':' || current_date::text || ':' || v_ip, 'sha256'), 'hex');

  if (select count(*) from public.item_events where client_hash = v_client and at > now() - interval '1 minute') >= 30 then
    return;
  end if;
  if (select count(*) from public.item_events where at > now() - interval '1 minute') >= 600 then
    return;
  end if;

  insert into public.item_events (business_id, item_id, kind, flash, offer, client_hash, bucket)
  values (v_biz, p_item, p_kind, coalesce(p_flash, false), coalesce(p_offer, false), v_client, floor(extract(epoch from now()) / 3600)::bigint)
  on conflict do nothing;

  if random() < 0.01 then
    delete from public.item_events
    where id in (select id from public.item_events where at < now() - interval '120 days' order by at limit 5000);
  end if;
exception when others then
  return;
end $$;

revoke all on function public.log_item_event(uuid, text, boolean, boolean) from public;
grant execute on function public.log_item_event(uuid, text, boolean, boolean) to anon, authenticated, service_role;
