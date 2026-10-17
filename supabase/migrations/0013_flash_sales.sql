alter table public.items add column if not exists unlist_reason text;

create table if not exists public.flash_sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  headline text check (headline is null or char_length(headline) between 3 and 80),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  discount_type text not null check (discount_type in ('percent','amount_off','sale_price')),
  discount_value numeric(12,2) not null,
  variant_overrides jsonb not null default '[]' check (jsonb_typeof(variant_overrides) = 'array'),
  quantity_note text check (quantity_note is null or char_length(quantity_note) between 2 and 80),
  after_end text not null default 'keep' check (after_end in ('keep','unlist')),
  status text not null default 'scheduled' check (status in ('scheduled','live','ended','cancelled')),
  ended_at timestamptz,
  ended_reason text check (ended_reason in ('time','seller','admin','item_removed','subscription')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flash_sales_window check (ends_at > starts_at),
  constraint flash_sales_duration check (ends_at - starts_at <= interval '7 days'),
  constraint flash_sales_value check (
    (discount_type = 'percent' and discount_value >= 1 and discount_value <= 99)
    or (discount_type = 'amount_off' and discount_value > 0)
    or (discount_type = 'sale_price' and discount_value > 0)
  ),
  constraint flash_sales_closed check ((status in ('ended','cancelled')) = (ended_at is not null and ended_reason is not null))
);
create index if not exists flash_sales_status_ends_idx on public.flash_sales (status, ends_at);
create index if not exists flash_sales_business_idx on public.flash_sales (business_id, starts_at desc);
create index if not exists flash_sales_item_idx on public.flash_sales (item_id, status);

drop trigger if exists t_flash_sales_touch on public.flash_sales;
create trigger t_flash_sales_touch before update on public.flash_sales for each row execute function public.touch_updated_at();

alter table public.flash_sales enable row level security;

drop policy if exists "admin all flash_sales" on public.flash_sales;
create policy "admin all flash_sales" on public.flash_sales for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "seller reads own flash_sales" on public.flash_sales;
create policy "seller reads own flash_sales" on public.flash_sales for select to authenticated using (business_id = public.my_business_id());
drop policy if exists "seller inserts own flash_sales" on public.flash_sales;
create policy "seller inserts own flash_sales" on public.flash_sales for insert to authenticated with check (business_id = public.my_business_id());
drop policy if exists "seller updates own flash_sales" on public.flash_sales;
create policy "seller updates own flash_sales" on public.flash_sales for update to authenticated using (business_id = public.my_business_id()) with check (business_id = public.my_business_id());

revoke all on public.flash_sales from public, anon;
grant select, insert, update, delete on public.flash_sales to authenticated;
grant all on public.flash_sales to service_role;

create or replace function public.get_server_time() returns timestamptz
language plpgsql volatile set search_path = public as
$$
begin
  begin
    perform set_config('response.headers', '[{"Cache-Control": "no-store"}]', true);
  exception when others then null;
  end;
  return clock_timestamp();
end $$;
grant execute on function public.get_server_time() to anon, authenticated, service_role;

create or replace function public.flash_discounted_price(p_type text, p_value numeric, p_regular numeric) returns numeric
language sql immutable as
$$ select greatest(0, round(case p_type
     when 'percent' then p_regular * (1 - p_value / 100)
     when 'amount_off' then p_regular - p_value
     else p_value end)) $$;
grant execute on function public.flash_discounted_price(text, numeric, numeric) to anon, authenticated, service_role;

create or replace function public.flash_broadcast(p_event text, p_id uuid) returns void
language plpgsql security definer set search_path = public as
$$
begin
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
    execute 'select realtime.send($1, $2, $3, false)' using jsonb_build_object('id', p_id), p_event, 'flash-sales';
  end if;
exception when others then null;
end $$;
revoke all on function public.flash_broadcast(text, uuid) from public, anon, authenticated;
grant execute on function public.flash_broadcast(text, uuid) to service_role;

create or replace function public.flash_check_rules() returns trigger
language plpgsql set search_path = public as
$$
declare
  v_item public.items%rowtype;
  v_biz public.businesses%rowtype;
  v_client boolean := current_user in ('authenticated', 'anon');
  v_role text := public.actor_role();
  v_limit integer;
  v_count integer;
  v_started boolean;
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.business_id is distinct from old.business_id
       or new.item_id is distinct from old.item_id or new.created_at is distinct from old.created_at then
      raise exception 'flash_immutable' using errcode = '42501';
    end if;
    if v_client then
      if old.status in ('ended','cancelled') or old.ends_at <= now() then raise exception 'flash_closed' using errcode = 'P0001'; end if;
      if (new.status, new.ended_at, new.ended_reason) is distinct from (old.status, old.ended_at, old.ended_reason) then
        raise exception 'flash_status_protected' using errcode = '42501';
      end if;
      v_started := old.starts_at <= now();
      if v_started and (new.starts_at, new.ends_at, new.discount_type, new.discount_value, new.variant_overrides, new.after_end)
         is distinct from (old.starts_at, old.ends_at, old.discount_type, old.discount_value, old.variant_overrides, old.after_end) then
        raise exception 'flash_locked' using errcode = 'P0001';
      end if;
    end if;
    if new.status in ('ended','cancelled') then return new; end if;
    if (new.starts_at, new.ends_at, new.discount_type, new.discount_value, new.after_end)
       is not distinct from (old.starts_at, old.ends_at, old.discount_type, old.discount_value, old.after_end) then
      new.headline := nullif(btrim(new.headline), '');
      new.quantity_note := nullif(btrim(new.quantity_note), '');
      return new;
    end if;
  end if;

  new.headline := nullif(btrim(new.headline), '');
  new.quantity_note := nullif(btrim(new.quantity_note), '');
  if tg_op = 'INSERT' then
    new.starts_at := greatest(coalesce(new.starts_at, now()), now());
    new.status := case when new.starts_at <= now() then 'live' else 'scheduled' end;
    new.ended_at := null;
    new.ended_reason := null;
  elsif old.starts_at > now() then
    new.starts_at := greatest(new.starts_at, now());
    new.status := case when new.starts_at <= now() then 'live' else 'scheduled' end;
  end if;

  if new.ends_at <= new.starts_at then raise exception 'invalid_window' using errcode = 'P0001'; end if;
  if new.ends_at <= now() then raise exception 'ends_in_past' using errcode = 'P0001'; end if;
  if new.ends_at - new.starts_at > interval '7 days' then raise exception 'duration_too_long' using errcode = 'P0001'; end if;

  select * into v_item from public.items where id = new.item_id;
  if not found or v_item.business_id <> new.business_id then raise exception 'item_not_found' using errcode = 'P0001'; end if;
  select * into v_biz from public.businesses where id = new.business_id;
  if not found or not public.business_is_visible(v_biz) then raise exception 'business_not_active' using errcode = 'P0001'; end if;
  if not v_item.visible or v_item.hidden_by_admin or v_item.removed_by_admin or v_item.availability in ('out_of_stock','unavailable') then
    raise exception 'item_unavailable' using errcode = 'P0001';
  end if;
  if v_item.price is null or v_item.price_type not in ('fixed','from') then raise exception 'item_not_discountable' using errcode = 'P0001'; end if;
  if public.flash_discounted_price(new.discount_type, new.discount_value, v_item.price) >= v_item.price then
    raise exception 'sale_price_not_lower' using errcode = 'P0001';
  end if;
  if public.flash_discounted_price(new.discount_type, new.discount_value, v_item.price) <= 0 then
    raise exception 'discount_too_large' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('flash:' || new.business_id::text));
  if exists (
    select 1 from public.flash_sales s
     where s.item_id = new.item_id and s.id <> new.id and s.status in ('scheduled','live') and s.ends_at > now()
       and tstzrange(s.starts_at, s.ends_at) && tstzrange(new.starts_at, new.ends_at)
  ) then
    raise exception 'item_has_sale' using errcode = 'P0001';
  end if;

  if v_role = 'seller' then
    select (case v_biz.plan_key when 'premium' then g.premium else g.standard end ->> 'flashSalesConcurrent')::integer into v_limit
      from public.global_limits g where g.id = 1;
    if v_limit is not null then
      select count(*) into v_count from public.flash_sales s
       where s.business_id = new.business_id and s.id <> new.id and s.status in ('scheduled','live') and s.ends_at > now()
         and tstzrange(s.starts_at, s.ends_at) && tstzrange(new.starts_at, new.ends_at);
      if v_count >= v_limit then raise exception 'limit_reached:flash_concurrent' using errcode = 'P0001'; end if;
    end if;
    select (case v_biz.plan_key when 'premium' then g.premium else g.standard end ->> 'flashSalesPerMonth')::integer into v_limit
      from public.global_limits g where g.id = 1;
    if v_limit is not null then
      select count(*) into v_count from public.flash_sales s
       where s.business_id = new.business_id and s.id <> new.id and s.status <> 'cancelled'
         and date_trunc('month', public.nairobi_day(s.starts_at)) = date_trunc('month', public.nairobi_day(new.starts_at));
      if v_count >= v_limit then raise exception 'limit_reached:flash_per_month' using errcode = 'P0001'; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists t_flash_sales_rules on public.flash_sales;
create trigger t_flash_sales_rules before insert or update on public.flash_sales for each row execute function public.flash_check_rules();

create or replace function public.flash_sales_after_change() returns trigger
language plpgsql security definer set search_path = public as
$$
declare
  v_reason text := nullif(current_setting('epicmkt.flash_reason', true), '');
  v_row public.flash_sales := case when tg_op = 'DELETE' then old else new end;
begin
  if tg_op = 'INSERT' then
    perform public.write_audit(v_row.business_id, 'flash_sale.created', 'flash_sale', v_row.id::text,
      jsonb_build_object('item_id', v_row.item_id, 'starts_at', v_row.starts_at, 'ends_at', v_row.ends_at, 'discount_type', v_row.discount_type, 'discount_value', v_row.discount_value));
    perform public.flash_broadcast('insert', v_row.id);
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status and new.status in ('ended','cancelled') then
      perform public.write_audit(new.business_id, 'flash_sale.ended', 'flash_sale', new.id::text,
        jsonb_build_object('status', new.status, 'ended_reason', new.ended_reason, 'reason', v_reason));
    elsif new.ends_at is distinct from old.ends_at and old.starts_at <= now() then
      perform public.write_audit(new.business_id, 'flash_sale.extended', 'flash_sale', new.id::text,
        jsonb_build_object('from', old.ends_at, 'to', new.ends_at, 'reason', v_reason));
    elsif (new.headline, new.quantity_note, new.discount_type, new.discount_value, new.starts_at, new.ends_at, new.after_end)
          is distinct from (old.headline, old.quantity_note, old.discount_type, old.discount_value, old.starts_at, old.ends_at, old.after_end) then
      perform public.write_audit(new.business_id, 'flash_sale.updated', 'flash_sale', new.id::text, '{}'::jsonb);
    end if;
    if (new.status, new.ends_at, new.starts_at, new.headline, new.quantity_note, new.discount_type, new.discount_value)
       is distinct from (old.status, old.ends_at, old.starts_at, old.headline, old.quantity_note, old.discount_type, old.discount_value) then
      perform public.flash_broadcast('update', new.id);
    end if;
  else
    perform public.flash_broadcast('delete', old.id);
  end if;
  return null;
end $$;
drop trigger if exists t_flash_sales_after on public.flash_sales;
create trigger t_flash_sales_after after insert or update or delete on public.flash_sales for each row execute function public.flash_sales_after_change();

create or replace function public.flash_end_sale(p_id uuid, p_reason text) returns public.flash_sales
language plpgsql security definer set search_path = public as
$$
declare
  v public.flash_sales;
  v_name text;
  v_note text := nullif(current_setting('epicmkt.flash_reason', true), '');
begin
  update public.flash_sales
     set status = case when starts_at > now() then 'cancelled' else 'ended' end,
         ended_at = now(),
         ended_reason = p_reason
   where id = p_id and status in ('scheduled','live')
   returning * into v;
  if not found then return null; end if;
  if v.after_end = 'unlist' and p_reason in ('time','seller') then
    update public.items set visible = false, unlist_reason = 'flash_ended' where id = v.item_id and visible;
  end if;
  if p_reason <> 'seller' then
    select name into v_name from public.items where id = v.item_id;
    perform public.post_seller_message(
      v.business_id, 'general',
      case p_reason when 'time' then 'Flash sale ended' else 'Flash sale stopped' end,
      case p_reason
        when 'time' then format('Your flash sale on "%s" has ended.%s', coalesce(v_name, 'your item'), case when v.after_end = 'unlist' then ' The item was unlisted as you chose.' else '' end)
        when 'admin' then format('Your flash sale on "%s" was stopped by EpicMKT.%s', coalesce(v_name, 'your item'), coalesce(' Reason: ' || v_note, ''))
        when 'item_removed' then format('Your flash sale on "%s" was stopped because the item is no longer listed.', coalesce(v_name, 'your item'))
        else format('Your flash sale on "%s" was stopped because your listing is not active.', coalesce(v_name, 'your item'))
      end,
      jsonb_build_object('flash_sale_id', v.id, 'item_id', v.item_id, 'reason', p_reason),
      'flash_end:' || v.id);
  end if;
  return v;
end $$;
revoke all on function public.flash_end_sale(uuid, text) from public, anon, authenticated;
grant execute on function public.flash_end_sale(uuid, text) to service_role;

create or replace function public.seller_end_flash_sale(p_id uuid) returns public.flash_sales
language plpgsql security definer set search_path = public as
$$
declare v public.flash_sales;
begin
  select * into v from public.flash_sales where id = p_id and business_id = public.my_business_id() for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v.status not in ('scheduled','live') or v.ends_at <= now() then raise exception 'flash_closed' using errcode = 'P0001'; end if;
  return public.flash_end_sale(p_id, 'seller');
end $$;
revoke all on function public.seller_end_flash_sale(uuid) from public, anon;
grant execute on function public.seller_end_flash_sale(uuid) to authenticated, service_role;

create or replace function public.admin_end_flash_sale(p_id uuid, p_reason text) returns public.flash_sales
language plpgsql security definer set search_path = public as
$$
declare v public.flash_sales; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.has_role(array['owner','reviewer','support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_reason is null or char_length(v_reason) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  select * into v from public.flash_sales where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v.status not in ('scheduled','live') or v.ends_at <= now() then raise exception 'flash_closed' using errcode = 'P0001'; end if;
  perform set_config('epicmkt.flash_reason', left(v_reason, 500), true);
  return public.flash_end_sale(p_id, 'admin');
end $$;
revoke all on function public.admin_end_flash_sale(uuid, text) from public, anon;
grant execute on function public.admin_end_flash_sale(uuid, text) to authenticated, service_role;

create or replace function public.extend_flash_sale(p_id uuid, p_ends_at timestamptz, p_reason text default null) returns public.flash_sales
language plpgsql security definer set search_path = public as
$$
declare v public.flash_sales; v_out public.flash_sales;
begin
  select * into v from public.flash_sales where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not public.has_role(array['owner','reviewer','support'])
     and v.business_id is distinct from public.my_business_id() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v.status not in ('scheduled','live') or v.ends_at <= now() then raise exception 'flash_closed' using errcode = 'P0001'; end if;
  if p_ends_at is null or p_ends_at <= v.ends_at then raise exception 'invalid_window' using errcode = 'P0001'; end if;
  if p_ends_at - v.starts_at > interval '7 days' then raise exception 'duration_too_long' using errcode = 'P0001'; end if;
  perform set_config('epicmkt.flash_reason', left(coalesce(nullif(btrim(p_reason), ''), ''), 500), true);
  update public.flash_sales set ends_at = p_ends_at where id = p_id returning * into v_out;
  return v_out;
end $$;
revoke all on function public.extend_flash_sale(uuid, timestamptz, text) from public, anon;
grant execute on function public.extend_flash_sale(uuid, timestamptz, text) to authenticated, service_role;

create or replace function public.flash_sales_sweep() returns integer
language plpgsql security definer set search_path = public as
$$
declare
  r record;
  v public.flash_sales;
  v_ended integer := 0;
  v_started integer;
begin
  with up as (
    update public.flash_sales set status = 'live'
     where status = 'scheduled' and starts_at <= now() and ends_at > now()
     returning id
  ) select count(*) into v_started from up;

  for r in
    select s.id,
           case
             when s.ends_at <= now() then 'time'
             when i.hidden_by_admin or i.removed_by_admin then 'item_removed'
             when b.status = 'suspended' then 'admin'
             else 'subscription'
           end as reason
      from public.flash_sales s
      join public.items i on i.id = s.item_id
      join public.businesses b on b.id = s.business_id
     where s.status in ('scheduled','live')
       and (s.ends_at <= now() or i.hidden_by_admin or i.removed_by_admin
            or (not public.business_is_visible(b) and b.status <> 'paused'))
     order by s.ends_at
     for update of s skip locked
  loop
    v := public.flash_end_sale(r.id, r.reason);
    if v.id is not null then v_ended := v_ended + 1; end if;
  end loop;
  return v_ended + coalesce(v_started, 0);
end $$;
revoke all on function public.flash_sales_sweep() from public, anon, authenticated;
grant execute on function public.flash_sales_sweep() to service_role;

create or replace function public.flash_on_item_change() returns trigger
language plpgsql security definer set search_path = public as
$$
declare r record;
begin
  if (new.hidden_by_admin and not old.hidden_by_admin) or (new.removed_by_admin and not old.removed_by_admin) then
    for r in select id from public.flash_sales where item_id = new.id and status in ('scheduled','live') loop
      perform public.flash_end_sale(r.id, 'item_removed');
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists t_items_flash on public.items;
create trigger t_items_flash after update of hidden_by_admin, removed_by_admin on public.items for each row execute function public.flash_on_item_change();

create or replace function public.flash_items_relist() returns trigger
language plpgsql as
$$
begin
  if new.visible and not old.visible then new.unlist_reason := null; end if;
  return new;
end $$;
drop trigger if exists t_items_relist on public.items;
create trigger t_items_relist before update of visible on public.items for each row execute function public.flash_items_relist();

create or replace function public.flash_on_business_change() returns trigger
language plpgsql security definer set search_path = public as
$$
declare r record;
begin
  if (new.status in ('suspended','expired','deleted') and old.status is distinct from new.status)
     or (new.deleted_at is not null and old.deleted_at is null) then
    for r in select id from public.flash_sales where business_id = new.id and status in ('scheduled','live') loop
      perform public.flash_end_sale(r.id, case when new.status = 'suspended' then 'admin' else 'subscription' end);
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists t_businesses_flash on public.businesses;
create trigger t_businesses_flash after update of status, deleted_at on public.businesses for each row execute function public.flash_on_business_change();

create or replace view public.public_flash_sales with (security_barrier = true) as
select
  s.id, s.business_id, s.item_id, s.headline, s.starts_at, s.ends_at,
  s.discount_type, s.discount_value, s.variant_overrides, s.quantity_note,
  i.name as item_name, i.description as item_description, i.section as item_section,
  i.price_type as item_price_type, i.unit as item_unit, i.availability as item_availability,
  (select m.path from public.item_media m where m.item_id = i.id and m.kind = 'image' order by m.sort, m.created_at limit 1) as item_image_path,
  i.price as regular_price,
  d.p as sale_price,
  i.price - d.p as savings,
  case when i.price > 0 then round((i.price - d.p) / i.price * 100) else 0 end as discount_percent,
  b.slug as business_slug, b.name as business_name, b.category_id as business_category_id,
  b.town as business_town, b.county as business_county, b.lat as business_lat, b.lng as business_lng,
  b.phone as business_phone, b.whatsapp as business_whatsapp, b.logo_path as business_logo_path,
  b.verification_level as business_verification_level, b.hours as business_hours,
  now() as server_now,
  floor(extract(epoch from (s.ends_at - now())) * 1000)::bigint as remaining_ms
from public.flash_sales s
join public.items i on i.id = s.item_id
join public.businesses b on b.id = s.business_id
cross join lateral (select public.flash_discounted_price(s.discount_type, s.discount_value, i.price) as p) d
where s.status in ('scheduled','live')
  and now() >= s.starts_at
  and now() < s.ends_at
  and public.business_is_visible(b)
  and i.visible and not i.hidden_by_admin and not i.removed_by_admin
  and i.availability not in ('out_of_stock','unavailable')
  and i.price is not null and i.price_type in ('fixed','from')
  and d.p > 0 and d.p < i.price;
revoke all on public.public_flash_sales from public;
grant select on public.public_flash_sales to anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'flash_sales') then
    alter publication supabase_realtime add table public.flash_sales;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      perform cron.unschedule(jobid) from cron.job where jobname = 'flash-sales-sweep';
      perform cron.schedule('flash-sales-sweep', '* * * * *', 'select public.flash_sales_sweep()');
    exception when others then
      raise notice 'flash-sales-sweep was not scheduled: %', sqlerrm;
    end;
  else
    raise notice 'pg_cron is not available: schedule public.flash_sales_sweep() every minute yourself';
  end if;
end $$;
