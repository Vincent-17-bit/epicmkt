-- Quantity price tiers: [{minQty, maxQty, unitPrice}] on an item or on one option combination, with a mode (whole | graduated).
-- Mirrors shared/src/pricing/tiers.js (validateTiers); a db test runs one table of cases through both.
-- seller_save_item takes priceTiers, priceTierMode and options.variants[].priceTiers (key absent = leave alone, null = clear).
-- Errors (P0001): invalid_price_tiers, tiers_need_from_price, item_in_flash_sale.

create or replace function public.price_tiers_valid(p_tiers jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare
  n integer;
  i integer;
  t jsonb;
  k text;
  v_min numeric;
  v_max numeric;
  v_price numeric;
  v_prev_max numeric;
  v_prev_price numeric;
begin
  if p_tiers is null or jsonb_typeof(p_tiers) is distinct from 'array' then return false; end if;
  n := jsonb_array_length(p_tiers);
  if n < 1 or n > 10 then return false; end if;
  for i in 0 .. n - 1 loop
    t := p_tiers -> i;
    if jsonb_typeof(t) is distinct from 'object' then return false; end if;
    for k in select jsonb_object_keys(t) loop
      if k not in ('minQty', 'maxQty', 'unitPrice') then return false; end if;
    end loop;
    if not (t ? 'maxQty') then return false; end if;
    if jsonb_typeof(t -> 'minQty') is distinct from 'number' or jsonb_typeof(t -> 'unitPrice') is distinct from 'number' then return false; end if;
    v_min := (t ->> 'minQty')::numeric;
    v_price := (t ->> 'unitPrice')::numeric;
    if v_min <> trunc(v_min) or v_min < 1 or v_min > 1000000 then return false; end if;
    if v_price <= 0 or v_price > 9999999999.99 or v_price <> round(v_price, 2) then return false; end if;
    if jsonb_typeof(t -> 'maxQty') = 'null' then
      v_max := null;
    elsif jsonb_typeof(t -> 'maxQty') = 'number' then
      v_max := (t ->> 'maxQty')::numeric;
      if v_max <> trunc(v_max) or v_max < v_min or v_max > 1000000 then return false; end if;
    else
      return false;
    end if;
    if i = 0 then
      if v_min <> 1 then return false; end if;
    else
      if v_prev_max is null or v_min <> v_prev_max + 1 or v_price > v_prev_price then return false; end if;
    end if;
    if i < n - 1 and v_max is null then return false; end if;
    if i = n - 1 and v_max is not null then return false; end if;
    v_prev_max := v_max;
    v_prev_price := v_price;
  end loop;
  return true;
end $$;

alter table public.items add column if not exists price_tiers jsonb;
alter table public.items add column if not exists price_tier_mode text not null default 'whole';
alter table public.item_variants add column if not exists price_tiers jsonb;

alter table public.items drop constraint if exists items_price_tiers_ck;
alter table public.items add constraint items_price_tiers_ck check (price_tiers is null or public.price_tiers_valid(price_tiers));
alter table public.items drop constraint if exists items_price_tier_mode_ck;
alter table public.items add constraint items_price_tier_mode_ck check (price_tier_mode in ('whole', 'graduated'));
alter table public.item_variants drop constraint if exists item_variants_price_tiers_ck;
alter table public.item_variants add constraint item_variants_price_tiers_ck check (price_tiers is null or public.price_tiers_valid(price_tiers));

do $$ begin
  if to_regprocedure('public.seller_save_item_typed(uuid, jsonb)') is null then
    alter function public.seller_save_item(uuid, jsonb) rename to seller_save_item_typed;
  end if;
end $$;
revoke all on function public.seller_save_item_typed(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.seller_save_item_typed(uuid, jsonb) to service_role;

create or replace function public.seller_save_item(p_id uuid, p_fields jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  f jsonb := coalesce(p_fields, '{}'::jsonb);
  v_biz uuid := public.my_business_id();
  v_has_tiers boolean := f ? 'priceTiers';
  v_has_mode boolean := f ? 'priceTierMode';
  v_tiers jsonb;
  v_mode text;
  v_old public.items;
  v_clean jsonb := '[]'::jsonb;
  v_vt jsonb := '[]'::jsonb;
  e jsonb;
  v_flash boolean := false;
  v_found boolean;
  v_id uuid;
  v_axes jsonb;
  v_key text;
begin
  perform public.assert_seller_active();
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;

  if v_has_tiers then
    v_tiers := f -> 'priceTiers';
    if jsonb_typeof(v_tiers) = 'null' then v_tiers := null;
    elsif not public.price_tiers_valid(v_tiers) then raise exception 'invalid_price_tiers' using errcode = 'P0001'; end if;
  end if;
  if v_has_mode then
    if jsonb_typeof(f -> 'priceTierMode') is distinct from 'string' or (f ->> 'priceTierMode') not in ('whole', 'graduated') then
      raise exception 'invalid_price_tiers' using errcode = 'P0001';
    end if;
    v_mode := f ->> 'priceTierMode';
  end if;

  if jsonb_typeof(f -> 'options') = 'object' and jsonb_typeof(f -> 'options' -> 'variants') = 'array' then
    for e in select jsonb_array_elements(f -> 'options' -> 'variants') loop
      if jsonb_typeof(e) = 'object' and e ? 'priceTiers' then
        if jsonb_typeof(e -> 'priceTiers') <> 'null' and not public.price_tiers_valid(e -> 'priceTiers') then
          raise exception 'invalid_price_tiers' using errcode = 'P0001';
        end if;
        v_vt := v_vt || jsonb_build_array(jsonb_build_object('choice', e -> 'choice', 'tiers', e -> 'priceTiers'));
        v_clean := v_clean || jsonb_build_array(e - 'priceTiers');
      else
        v_clean := v_clean || jsonb_build_array(e);
      end if;
    end loop;
    f := jsonb_set(f, '{options,variants}', v_clean);
  end if;
  f := f - 'priceTiers' - 'priceTierMode';

  if p_id is not null then
    select * into v_old from public.items where id = p_id and business_id = v_biz;
    v_found := found;
    v_flash := exists (select 1 from public.flash_sales s where s.item_id = p_id and s.status in ('scheduled', 'live'));
    if v_flash and v_found and (
      (v_has_tiers and v_tiers is distinct from v_old.price_tiers)
      or (v_has_mode and v_mode is distinct from v_old.price_tier_mode)
    ) then
      raise exception 'item_in_flash_sale' using errcode = 'P0001';
    end if;
  end if;

  v_id := public.seller_save_item_typed(p_id, f);

  if v_has_tiers then update public.items set price_tiers = v_tiers where id = v_id and price_tiers is distinct from v_tiers; end if;
  if v_has_mode then update public.items set price_tier_mode = v_mode where id = v_id and price_tier_mode is distinct from v_mode; end if;

  if jsonb_array_length(v_vt) > 0 then
    select option_axes into v_axes from public.items where id = v_id;
    for e in select jsonb_array_elements(v_vt) loop
      v_key := public.item_option_combo_key(v_axes, e -> 'choice');
      update public.item_variants set price_tiers = case when jsonb_typeof(e -> 'tiers') = 'null' then null else e -> 'tiers' end, updated_at = now()
        where item_id = v_id and combo_key = v_key
          and price_tiers is distinct from case when jsonb_typeof(e -> 'tiers') = 'null' then null else e -> 'tiers' end;
      if found and v_flash then raise exception 'item_in_flash_sale' using errcode = 'P0001'; end if;
    end loop;
  end if;

  if exists (
    select 1 from public.items i
    where i.id = v_id and i.price_type is distinct from 'from'
      and (i.price_tiers is not null or exists (select 1 from public.item_variants v where v.item_id = i.id and v.price_tiers is not null))
  ) then
    raise exception 'tiers_need_from_price' using errcode = 'P0001';
  end if;

  return v_id;
end $$;
revoke all on function public.seller_save_item(uuid, jsonb) from public, anon;
grant execute on function public.seller_save_item(uuid, jsonb) to authenticated, service_role;
revoke all on function public.price_tiers_valid(jsonb) from public, anon;
grant execute on function public.price_tiers_valid(jsonb) to authenticated, service_role;
