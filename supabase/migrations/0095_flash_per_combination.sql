-- Flash sale per combination. variant_target: 'all' (every combination gets the sale's discount) or 'chosen' (only the combinations
-- listed in variant_overrides). variant_overrides entries are {combo, type, value}: that combination's own percent, amount_off or
-- sale_price. Older [{variantId, salePrice}] entries stay valid and are ignored. A combination is sold when it is a stored
-- item_variants row with its own price that is not 'unavailable' (the pricing core's isSold). Mirrors shared/src/flash/validateFlashVariants.js; a db test runs the same cases through both.
-- Errors (P0001): invalid_flash_overrides, flash_needs_combinations, invalid_flash_target, discount_too_large, sale_price_not_lower.
-- For 'chosen' the sale's own discount_type/discount_value are still required and checked against the item price by the 0013 rules,
-- but are not applied to combinations that are not listed.

alter table public.flash_sales add column if not exists variant_target text not null default 'all';
alter table public.flash_sales drop constraint if exists flash_sales_variant_target_ck;
alter table public.flash_sales add constraint flash_sales_variant_target_ck check (variant_target in ('all', 'chosen'));

create or replace function public.flash_overrides_shape_valid(p jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare
  e jsonb;
  k text;
  v_type text;
  v_val numeric;
  v_seen text[] := '{}';
  v_combo text;
begin
  if p is null or jsonb_typeof(p) is distinct from 'array' then return false; end if;
  if jsonb_array_length(p) > 200 then return false; end if;
  for e in select jsonb_array_elements(p) loop
    if jsonb_typeof(e) is distinct from 'object' then return false; end if;
    if e ? 'variantId' then
      for k in select jsonb_object_keys(e) loop
        if k not in ('variantId', 'salePrice') then return false; end if;
      end loop;
      continue;
    end if;
    for k in select jsonb_object_keys(e) loop
      if k not in ('combo', 'type', 'value') then return false; end if;
    end loop;
    if jsonb_typeof(e -> 'combo') is distinct from 'string' or jsonb_typeof(e -> 'type') is distinct from 'string' or jsonb_typeof(e -> 'value') is distinct from 'number' then return false; end if;
    v_combo := e ->> 'combo';
    v_type := e ->> 'type';
    v_val := (e ->> 'value')::numeric;
    if char_length(v_combo) < 3 or char_length(v_combo) > 400 then return false; end if;
    if v_type not in ('percent', 'amount_off', 'sale_price') then return false; end if;
    if v_val <= 0 or v_val > 9999999999.99 or v_val <> round(v_val, 2) then return false; end if;
    if v_type = 'percent' and (v_val < 1 or v_val > 99) then return false; end if;
    if v_combo = any (v_seen) then return false; end if;
    v_seen := v_seen || v_combo;
  end loop;
  return true;
end $$;

create or replace function public.flash_combo_price(p_sale public.flash_sales, p_combo text, p_regular numeric) returns numeric
language plpgsql stable set search_path = public as $$
declare
  o jsonb;
  v_type text := null;
  v_val numeric;
  v_price numeric;
begin
  if p_regular is null then return null; end if;
  select x.e into o from jsonb_array_elements(p_sale.variant_overrides) x(e) where x.e ->> 'combo' = p_combo limit 1;
  if o is not null then
    v_type := o ->> 'type';
    v_val := (o ->> 'value')::numeric;
  elsif p_sale.variant_target = 'all' then
    v_type := p_sale.discount_type;
    v_val := p_sale.discount_value;
  end if;
  if v_type is null then return null; end if;
  v_price := public.flash_discounted_price(v_type, v_val, p_regular);
  if v_price <= 0 or v_price >= p_regular then return null; end if;
  return v_price;
end $$;

create or replace function public.flash_headline_price(p_sale public.flash_sales, p_item_price numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select min(coalesce(public.flash_combo_price(p_sale, v.combo_key, v.price), v.price))
       from public.item_variants v where v.item_id = p_sale.item_id and v.status <> 'unavailable' and v.price is not null),
    public.flash_discounted_price(p_sale.discount_type, p_sale.discount_value, p_item_price));
$$;

create or replace function public.flash_check_variants() returns trigger
language plpgsql set search_path = public as $$
declare
  v_client boolean := current_user in ('authenticated', 'anon');
  e jsonb;
  v_regular numeric;
  v_new numeric;
begin
  if tg_op = 'UPDATE' then
    if v_client and old.starts_at <= now() and new.variant_target is distinct from old.variant_target then
      raise exception 'flash_locked' using errcode = 'P0001';
    end if;
    if new.status in ('ended', 'cancelled') then return new; end if;
    if (new.variant_target, new.variant_overrides, new.discount_type, new.discount_value)
       is not distinct from (old.variant_target, old.variant_overrides, old.discount_type, old.discount_value) then
      return new;
    end if;
  end if;

  if not public.flash_overrides_shape_valid(new.variant_overrides) then raise exception 'invalid_flash_overrides' using errcode = 'P0001'; end if;

  if new.variant_target = 'chosen' and (
    not exists (select 1 from public.item_variants v where v.item_id = new.item_id)
    or not exists (select 1 from jsonb_array_elements(new.variant_overrides) x(e) where x.e ? 'combo')
  ) then
    raise exception 'flash_needs_combinations' using errcode = 'P0001';
  end if;

  for e in select x.e from jsonb_array_elements(new.variant_overrides) x(e) where x.e ? 'combo' loop
    select v.price into v_regular
      from public.item_variants v where v.item_id = new.item_id and v.combo_key = e ->> 'combo' and v.status <> 'unavailable' and v.price is not null;
    if not found then raise exception 'invalid_flash_target' using errcode = 'P0001'; end if;
    v_new := public.flash_discounted_price(e ->> 'type', (e ->> 'value')::numeric, v_regular);
    if v_new <= 0 then raise exception 'discount_too_large' using errcode = 'P0001'; end if;
    if v_new >= v_regular then raise exception 'sale_price_not_lower' using errcode = 'P0001'; end if;
  end loop;
  return new;
end $$;
drop trigger if exists t_flash_sales_variants on public.flash_sales;
create trigger t_flash_sales_variants before insert or update on public.flash_sales for each row execute function public.flash_check_variants();

revoke all on function public.flash_overrides_shape_valid(jsonb), public.flash_combo_price(public.flash_sales, text, numeric), public.flash_headline_price(public.flash_sales, numeric) from public;
grant execute on function public.flash_overrides_shape_valid(jsonb), public.flash_combo_price(public.flash_sales, text, numeric), public.flash_headline_price(public.flash_sales, numeric) to anon, authenticated, service_role;

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
  floor(extract(epoch from (s.ends_at - now())) * 1000)::bigint as remaining_ms,
  public.public_exceptions(b.exceptions) as business_exceptions,
  b.timezone as business_timezone,
  s.variant_target,
  (select jsonb_agg(jsonb_build_object('combo', v.combo_key, 'choice', v.choice, 'regularPrice', v.price, 'salePrice', fp.p) order by v.sort)
     from public.item_variants v
     cross join lateral (select public.flash_combo_price(s, v.combo_key, v.price) as p) fp
    where v.item_id = i.id and v.status <> 'unavailable' and v.price is not null and fp.p is not null) as variant_flash
from public.flash_sales s
join public.items i on i.id = s.item_id
join public.businesses b on b.id = s.business_id
cross join lateral (
  select case when s.variant_target = 'all' and jsonb_array_length(s.variant_overrides) = 0
              then public.flash_discounted_price(s.discount_type, s.discount_value, i.price)
              else public.flash_headline_price(s, i.price) end as p
) d
where s.status in ('scheduled','live')
  and now() >= s.starts_at
  and now() < s.ends_at
  and public.business_is_visible(b)
  and i.visible and not i.hidden_by_admin and not i.removed_by_admin
  and i.availability not in ('out_of_stock','unavailable')
  and i.price is not null and i.price_type in ('fixed','from')
  and d.p > 0
  and (d.p < i.price or s.variant_target = 'chosen' or jsonb_array_length(s.variant_overrides) > 0);
revoke all on public.public_flash_sales from public;
grant select on public.public_flash_sales to anon, authenticated, service_role;

do $$ begin
  if to_regprocedure('public.public_item_options_base(uuid)') is null then
    alter function public.public_item_options(uuid) rename to public_item_options_base;
  end if;
end $$;
revoke all on function public.public_item_options_base(uuid) from public, anon, authenticated;
grant execute on function public.public_item_options_base(uuid) to service_role;

create or replace function public.public_item_options(p_item uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r jsonb := public.public_item_options_base(p_item);
  s public.flash_sales;
begin
  if r is null then return null; end if;
  select * into s from public.flash_sales f
    where f.item_id = p_item and f.status in ('scheduled', 'live') and now() >= f.starts_at and now() < f.ends_at
    order by f.starts_at desc limit 1;
  if not found then return r; end if;
  return jsonb_set(r, '{optionVariants}', coalesce((
    select jsonb_agg(
      x.e || jsonb_build_object('flash', (
        select case when fp.p is null then null else jsonb_build_object(
          'type', coalesce(o.e ->> 'type', s.discount_type),
          'value', coalesce((o.e ->> 'value')::numeric, s.discount_value),
          'regularPrice', (x.e ->> 'price')::numeric,
          'salePrice', fp.p,
          'endsAt', s.ends_at) end
        from (select public.flash_combo_price(s, vr.combo_key, (x.e ->> 'price')::numeric) as p) fp
        left join lateral (select y.e from jsonb_array_elements(s.variant_overrides) y(e) where y.e ->> 'combo' = vr.combo_key limit 1) o on true
      )) order by x.n)
    from jsonb_array_elements(r -> 'optionVariants') with ordinality as x(e, n)
    left join public.item_variants vr on vr.id::text = x.e ->> 'id'
  ), r -> 'optionVariants'));
end $$;
revoke all on function public.public_item_options(uuid) from public, anon;
grant execute on function public.public_item_options(uuid) to anon, authenticated, service_role;
