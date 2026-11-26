-- 0154_flash_14_days.sql
-- A flash sale can now run for up to 14 days (it was 7). Sellers can renew a sale that has ended for as long as they like within that limit,
-- and extend a running one right up to it. The limit is counted from the sale's start, as before.
--
-- The number lives in four places and all four move together:
--   1. the table constraint flash_sales_duration (a last line of defence if a row is written any other way),
--   2. flash_check_rules (the insert/update trigger every write goes through),
--   3. extend_flash_sale (the seller and admin "run longer" action),
--   4. FLASH_MAX_DAYS in shared/src/seller/flash.js (the same rule, so the forms refuse a bad end before the round trip).
-- Nothing else changes: existing sales are all within 7 days, so they still satisfy the wider limit. Re-runnable.

alter table public.flash_sales drop constraint if exists flash_sales_duration;
alter table public.flash_sales add constraint flash_sales_duration check (ends_at - starts_at <= interval '14 days');

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
  if new.ends_at - new.starts_at > interval '14 days' then raise exception 'duration_too_long' using errcode = 'P0001'; end if;

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
-- the trigger already points at flash_check_rules; replacing the function body is enough.

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
  if p_ends_at - v.starts_at > interval '14 days' then raise exception 'duration_too_long' using errcode = 'P0001'; end if;
  perform set_config('epicmkt.flash_reason', left(coalesce(nullif(btrim(p_reason), ''), ''), 500), true);
  update public.flash_sales set ends_at = p_ends_at where id = p_id returning * into v_out;
  return v_out;
end $$;
revoke all on function public.extend_flash_sale(uuid, timestamptz, text) from public, anon;
grant execute on function public.extend_flash_sale(uuid, timestamptz, text) to authenticated, service_role;
