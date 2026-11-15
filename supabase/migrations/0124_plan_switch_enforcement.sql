-- 0124_plan_switch_enforcement.sql
-- The plan feature switches of 0111 (global_limits.<plan>.features: options, threeD, recommend, delivery, demand) were stored and shown in the
-- admin but nothing read them. Now they are enforced. A switch is on unless a plan sets it to false, and turning one off never takes away what a
-- shop already has: it stops NEW use and hides the feature from shoppers.
--
--   plan_feature_on(business, key)   the one place that answers "does this shop's plan have it?"
--   writes (a seller adds it):       options     an item that had no options gets some          -> 'feature_off' (detail: options)
--                                    threeD      a model, spin frame or poster is attached      -> 'feature_off' (detail: threeD)
--                                    delivery    seller_set_delivery(offers = true)             -> 'feature_off' (detail: delivery)
--                                    demand      seller_unmet_demand                            -> 'feature_off' (detail: demand)
--   reads (a shopper looks):         delivery    business_delivery says { offers: false }
--                                    threeD      public_item_media3d answers null (no viewer)
--                                    recommend   related_item_candidates answers null (no related items)
-- Options already on an item keep working and stay editable (prices, stock, values); only adding options to an item without them is refused.

create or replace function public.plan_feature_on(p_business uuid, p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select coalesce((case when b.plan_key = 'premium' then g.premium else g.standard end) -> 'features' ->> p_key, 'true') <> 'false'
      from public.businesses b cross join public.global_limits g
     where b.id = p_business and g.id = 1), true)
$$;
revoke all on function public.plan_feature_on(uuid, text) from public;
grant execute on function public.plan_feature_on(uuid, text) to anon, authenticated, service_role;

-- ---- writes ---------------------------------------------------------------------------------------------------------------------------
create or replace function public.items_feature_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if jsonb_typeof(new.option_axes) = 'array' and jsonb_array_length(new.option_axes) > 0
     and (tg_op = 'INSERT' or old.option_axes is null or jsonb_typeof(old.option_axes) <> 'array' or jsonb_array_length(old.option_axes) = 0)
     and not public.plan_feature_on(new.business_id, 'options') then
    raise exception 'feature_off' using errcode = 'P0001', detail = 'options';
  end if;
  return new;
end $$;
drop trigger if exists t_items_feature_guard on public.items;
create trigger t_items_feature_guard before insert or update of option_axes on public.items for each row execute function public.items_feature_guard();

create or replace function public.item_media_feature_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind in ('model', 'spin', 'poster') and not public.plan_feature_on(new.business_id, 'threeD') then
    raise exception 'feature_off' using errcode = 'P0001', detail = 'threeD';
  end if;
  return new;
end $$;
drop trigger if exists t_item_media_feature_guard on public.item_media;
create trigger t_item_media_feature_guard before insert on public.item_media for each row execute function public.item_media_feature_guard();

do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'seller_set_delivery';
  if position('plan_feature_on' in v_def) = 0 then
    v_new := replace(v_def, E'  if p_offers is null then raise exception ''invalid_offers'' using errcode = ''P0001''; end if;\n',
      E'  if p_offers is null then raise exception ''invalid_offers'' using errcode = ''P0001''; end if;\n' ||
      E'  if p_offers and not public.plan_feature_on(v_biz, ''delivery'') then raise exception ''feature_off'' using errcode = ''P0001'', detail = ''delivery''; end if;\n');
    if v_new = v_def then raise exception 'seller_set_delivery: offers check not found'; end if;
    execute v_new;
  end if;

  select pg_get_functiondef(p.oid) into strict v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'seller_unmet_demand';
  if position('plan_feature_on' in v_def) = 0 then
    v_new := replace(v_def, E'  if v_biz is null then raise exception ''not_a_seller'' using errcode = ''42501''; end if;\n',
      E'  if v_biz is null then raise exception ''not_a_seller'' using errcode = ''42501''; end if;\n' ||
      E'  if not public.plan_feature_on(v_biz, ''demand'') then raise exception ''feature_off'' using errcode = ''P0001'', detail = ''demand''; end if;\n');
    if v_new = v_def then raise exception 'seller_unmet_demand: seller check not found'; end if;
    execute v_new;
  end if;

  select pg_get_functiondef(p.oid) into strict v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'related_item_candidates';
  if position('plan_feature_on' in v_def) = 0 then
    v_new := replace(v_def, E'  if not found then return null; end if;\n',
      E'  if not found then return null; end if;\n' ||
      E'  if not public.plan_feature_on(v_item.business_id, ''recommend'') then return null; end if;\n');
    if v_new = v_def then raise exception 'related_item_candidates: lookup not found'; end if;
    execute v_new;
  end if;
end $$;

-- ---- reads ----------------------------------------------------------------------------------------------------------------------------
create or replace function public.business_delivery(b public.businesses) returns jsonb
language sql stable as $$
  select case when coalesce(b.delivers, false) and public.plan_feature_on(b.id, 'delivery')
    then jsonb_strip_nulls(jsonb_build_object('offers', true, 'fee', b.delivery_fee, 'radiusKm', b.delivery_radius_km,
           'area', nullif(btrim(b.delivery_area), ''), 'minOrder', b.delivery_min_order, 'notes', nullif(btrim(b.delivery_notes), '')))
    else jsonb_build_object('offers', false) end
$$;

create or replace function public.public_item_media3d(p_item uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from public.public_items pi where pi.id = p_item and public.plan_feature_on(pi.business_id, 'threeD'))
    then jsonb_build_object('view3d', public.item_view3d_raw(p_item) -> '', 'view3dByOption', public.item_view3d_raw(p_item) - '')
    else null end
$$;
