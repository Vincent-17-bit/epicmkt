-- 0114 (Prompt A18): delivery, set by the shop itself.
--
-- What the live site used before (the finding): only `businesses.delivery_area`, free text edited through seller_update_profile and shown
-- on the shop page. A delivery yes/no, fee and radius existed only in the demo category list (backend/src/data/categories.js). Nothing
-- stored whether a shop delivers at all.
--
--   1. businesses.delivers, delivery_fee, delivery_radius_km, delivery_min_order, delivery_notes   the shop's own setting.
--      `delivers` is null until the shop answers. A shop that already filled in a delivery area is taken to deliver there (backfill), since
--      writing an area is the only way the old form said it.
--   2. business_delivery(b)       the public object { offers, fee, radiusKm, area, minOrder, notes } (shared/src/delivery.js reads it).
--                                  A shop that does not deliver publishes { offers: false } and nothing else.
--   3. seller_set_delivery(...)   in the style of seller_set_location (0066). Audited.
--   4. public_businesses          gets the `delivery` column, last, so the view is replaced in place.

alter table public.businesses add column if not exists delivers boolean;
alter table public.businesses add column if not exists delivery_fee numeric(10, 2);
alter table public.businesses add column if not exists delivery_radius_km numeric(6, 1);
alter table public.businesses add column if not exists delivery_min_order numeric(12, 2);
alter table public.businesses add column if not exists delivery_notes text;

alter table public.businesses drop constraint if exists businesses_delivery_ck;
alter table public.businesses add constraint businesses_delivery_ck check (
  (delivery_fee is null or (delivery_fee >= 0 and delivery_fee <= 100000))
  and (delivery_radius_km is null or (delivery_radius_km > 0 and delivery_radius_km <= 500))
  and (delivery_min_order is null or (delivery_min_order >= 0 and delivery_min_order <= 10000000))
  and (delivery_notes is null or char_length(delivery_notes) <= 300));

update public.businesses set delivers = true where delivers is null and nullif(btrim(delivery_area), '') is not null;

create or replace function public.business_delivery(b public.businesses) returns jsonb
language sql stable parallel safe as $$
  select case when coalesce(b.delivers, false)
    then jsonb_strip_nulls(jsonb_build_object('offers', true, 'fee', b.delivery_fee, 'radiusKm', b.delivery_radius_km,
           'area', nullif(btrim(b.delivery_area), ''), 'minOrder', b.delivery_min_order, 'notes', nullif(btrim(b.delivery_notes), '')))
    else jsonb_build_object('offers', false) end
$$;
grant execute on function public.business_delivery(public.businesses) to anon, authenticated, service_role;

create or replace function public.seller_set_delivery(p_offers boolean, p_fee numeric default null, p_radius_km numeric default null,
  p_area text default null, p_min_order numeric default null, p_notes text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_biz uuid := public.my_business_id();
  v_row public.businesses;
  v_area text := nullif(regexp_replace(btrim(coalesce(p_area, '')), '\s+', ' ', 'g'), '');
  v_notes text := nullif(regexp_replace(btrim(coalesce(p_notes, '')), '\s+', ' ', 'g'), '');
begin
  perform public.assert_seller_active();
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if p_offers is null then raise exception 'invalid_offers' using errcode = 'P0001'; end if;
  if p_fee is not null and (p_fee <> p_fee or p_fee < 0 or p_fee > 100000) then raise exception 'invalid_fee' using errcode = 'P0001'; end if;
  if p_radius_km is not null and (p_radius_km <> p_radius_km or p_radius_km <= 0 or p_radius_km > 500) then raise exception 'invalid_radius' using errcode = 'P0001'; end if;
  if p_min_order is not null and (p_min_order <> p_min_order or p_min_order < 0 or p_min_order > 10000000) then raise exception 'invalid_min_order' using errcode = 'P0001'; end if;
  if v_area is not null and char_length(v_area) > 120 then raise exception 'invalid_area' using errcode = 'P0001'; end if;
  if v_notes is not null and char_length(v_notes) > 300 then raise exception 'invalid_notes' using errcode = 'P0001'; end if;

  perform 1 from public.businesses b where b.id = v_biz for update;
  update public.businesses b set
    delivers = p_offers,
    delivery_fee = round(p_fee, 2),
    delivery_radius_km = round(p_radius_km, 1),
    delivery_area = v_area,
    delivery_min_order = round(p_min_order, 2),
    delivery_notes = v_notes
  where b.id = v_biz
  returning * into v_row;

  perform public.write_audit(v_biz, 'delivery_updated', 'business', v_biz::text, jsonb_build_object('offers', p_offers));
  return public.business_delivery(v_row);
end $$;
revoke all on function public.seller_set_delivery(boolean, numeric, numeric, text, numeric, text) from public, anon;
grant execute on function public.seller_set_delivery(boolean, numeric, numeric, text, numeric, text) to authenticated, service_role;

-- The view is extended from its current text (0087 patched it after 0064), so nothing else in it changes.
do $$
declare
  v_def text;
  v_at integer;
begin
  select pg_get_viewdef('public.public_businesses'::regclass) into strict v_def;
  if position('business_delivery' in v_def) > 0 then return; end if;
  v_def := rtrim(btrim(v_def), ';');
  v_at := length(v_def) - position(reverse(' FROM businesses b') in reverse(v_def)) - length(' FROM businesses b') + 2;
  if v_at < 1 or substr(v_def, v_at, length(' FROM businesses b')) <> ' FROM businesses b' then raise exception 'public_businesses: outer FROM not found'; end if;
  v_def := substr(v_def, 1, v_at - 1) || ', public.business_delivery(b.*) AS delivery' || substr(v_def, v_at);
  execute 'create or replace view public.public_businesses with (security_barrier = true) as ' || v_def;
end $$;
revoke all on public.public_businesses from public;
grant select on public.public_businesses to anon, authenticated, service_role;
