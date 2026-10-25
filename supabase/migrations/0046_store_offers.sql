-- 0046_store_offers.sql
-- Two kinds of offer, both controlled by the seller:
--   product  an offer on chosen products (0045). Shows on those products and counts toward the store card's Offer chip.
--   store    an offer on the whole shop: percent off, amount off or a free perk with the order, with its own settings
--            (minimum spend, days, hours, new customers). It has no products. Shows on the store page and the store chip.
-- Sellers can edit, pause, end and now DELETE any offer, including ended ones and ones made before 0045.
--
--   * offers.scope: 'product' (default) or 'store'.
--   * Offers made before 0045 were whole-store promotions with no kind: they become scope 'store' and stay hidden from
--     customers until the seller opens them, picks a type and saves.
--   * public_offers lists a store offer without needing products.
--   * seller_save_offer takes scope from p_fields; seller_delete_offer removes an offer for good.

alter table public.offers
  add column if not exists scope text not null default 'product' check (scope in ('product', 'store'));

update public.offers set scope = 'store' where kind is null and scope <> 'store';

create or replace function public.offers_check_rules() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.kind is null then
    if tg_op = 'INSERT' and public.actor_role() = 'seller' and new.config <> '{}'::jsonb then raise exception 'invalid_offer_config' using errcode = 'P0001'; end if;
    return new;
  end if;
  if new.scope = 'store' and (new.kind not in ('percent_off', 'amount_off', 'free_gift') or (new.kind = 'free_gift' and new.config ? 'minQty')) then
    raise exception 'invalid_offer_config' using errcode = 'P0001';
  end if;
  if not public.offer_config_valid(new.kind, new.config) then raise exception 'invalid_offer_config' using errcode = 'P0001'; end if;
  if not public.offer_conditions_valid(new.conditions) then raise exception 'invalid_offer_conditions' using errcode = 'P0001'; end if;
  if new.starts_at is not null and new.ends_at is not null and new.ends_at <= new.starts_at then raise exception 'invalid_window' using errcode = 'P0001'; end if;
  if new.ends_at is not null and new.ends_at - coalesce(new.starts_at, new.created_at, now()) > interval '365 days' then raise exception 'duration_too_long' using errcode = 'P0001'; end if;
  return new;
end $$;

create or replace function public.offer_items_check() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.offers o where o.id = new.offer_id and o.business_id = new.business_id and o.scope = 'product') then
    raise exception 'offer_item_mismatch' using errcode = '42501';
  end if;
  if not exists (select 1 from public.items i where i.id = new.item_id and i.business_id = new.business_id) then
    raise exception 'offer_item_mismatch' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.offer_items x where x.offer_id = new.offer_id) >= 12 then
    raise exception 'too_many_items' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- A store offer is public on its own. A product offer still needs a public product (a bundle needs a main and a companion).
-- scope goes last so the view definition stays valid.
create or replace view public.public_offers with (security_barrier = true) as
select
  o.id, o.business_id, o.title, o.description, o.starts_at, o.ends_at, o.created_at,
  o.kind, o.config, o.conditions, o.chip_text, o.code, o.terms,
  p.items,
  o.scope
from public.offers o
join public.businesses b on b.id = o.business_id
cross join lateral (
  select
    coalesce(jsonb_agg(jsonb_build_object('item_id', oi.item_id, 'role', oi.role) order by oi.sort, oi.role, oi.item_id), '[]'::jsonb) as items,
    count(*) filter (where oi.role = 'main') as mains,
    count(*) filter (where oi.role = 'with') as withs
  from public.offer_items oi
  join public.items i on i.id = oi.item_id
  where oi.offer_id = o.id and i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin
) p
where public.business_is_visible(b)
  and o.kind is not null
  and o.active
  and not o.hidden_by_admin
  and not o.removed_by_admin
  and (o.starts_at is null or o.starts_at <= now())
  and (o.ends_at is null or o.ends_at > now())
  and (
    o.scope = 'store'
    or ((p.mains + p.withs) > 0 and (o.kind <> 'bundle' or (p.mains > 0 and p.withs > 0)))
  );
revoke all on public.public_offers from public;
grant select on public.public_offers to anon, authenticated, service_role;

create or replace function public.seller_save_offer(p_id uuid, p_fields jsonb, p_items jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_biz uuid := public.my_business_id();
  f jsonb := coalesce(p_fields, '{}'::jsonb);
  v_scope text := case when f ->> 'scope' = 'store' then 'store' else 'product' end;
  v_kind text := f ->> 'kind';
  v_config jsonb := coalesce(f -> 'config', '{}'::jsonb);
  v_conditions jsonb := coalesce(f -> 'conditions', '{}'::jsonb);
  v_title text := nullif(btrim(coalesce(f ->> 'title', '')), '');
  v_desc text := nullif(btrim(coalesce(f ->> 'description', '')), '');
  v_chip text := nullif(btrim(coalesce(f ->> 'chip_text', '')), '');
  v_code text := nullif(upper(btrim(coalesce(f ->> 'code', ''))), '');
  v_terms text := nullif(btrim(coalesce(f ->> 'terms', '')), '');
  v_starts timestamptz;
  v_ends timestamptz;
  v_old public.offers;
  v_id uuid;
  v_mains integer := 0;
  v_withs integer := 0;
  v_n integer := 0;
  e jsonb;
  v_item uuid;
  v_role text;
  v_seen uuid[] := '{}';
  v_pos integer := 0;
begin
  perform public.assert_seller_active();
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;

  if v_kind is null
     or (v_scope = 'product' and v_kind not in ('percent_off','amount_off','buy_x_get_y','multi_buy','bundle','volume','free_gift'))
     or (v_scope = 'store' and v_kind not in ('percent_off','amount_off','free_gift')) then
    raise exception 'invalid_kind' using errcode = 'P0001';
  end if;
  if not public.offer_config_valid(v_kind, v_config) or (v_scope = 'store' and v_kind = 'free_gift' and v_config ? 'minQty') then
    raise exception 'invalid_config' using errcode = 'P0001';
  end if;
  if not public.offer_conditions_valid(v_conditions) then raise exception 'invalid_conditions' using errcode = 'P0001'; end if;
  if v_title is not null and char_length(v_title) not between 3 and 80 then raise exception 'invalid_title' using errcode = 'P0001'; end if;
  if char_length(coalesce(v_desc, '')) > 200 then raise exception 'invalid_description' using errcode = 'P0001'; end if;
  if v_chip is not null and char_length(v_chip) not between 2 and 22 then raise exception 'invalid_chip_text' using errcode = 'P0001'; end if;
  if v_code is not null and v_code !~ '^[A-Z0-9]{3,16}$' then raise exception 'invalid_code' using errcode = 'P0001'; end if;
  if char_length(coalesce(v_terms, '')) > 280 then raise exception 'invalid_terms' using errcode = 'P0001'; end if;
  if coalesce(v_title, '') ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' or coalesce(v_desc, '') ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'
     or coalesce(v_chip, '') ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' or coalesce(v_terms, '') ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' then
    raise exception 'invalid_text' using errcode = 'P0001';
  end if;

  if v_scope = 'product' then
    if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'no_items' using errcode = 'P0001'; end if;
    for e in select * from jsonb_array_elements(p_items) loop
      begin
        v_item := (e ->> 'item_id')::uuid;
      exception when others then
        raise exception 'item_not_found' using errcode = 'P0001';
      end;
      if v_item = any (v_seen) then continue; end if;
      v_seen := v_seen || v_item;
      v_role := case when v_kind = 'bundle' and e ->> 'role' = 'with' then 'with' else 'main' end;
      if not exists (select 1 from public.items i where i.id = v_item and i.business_id = v_biz and not i.removed_by_admin) then
        raise exception 'item_not_found' using errcode = 'P0001';
      end if;
      v_n := v_n + 1;
      if v_role = 'with' then v_withs := v_withs + 1; else v_mains := v_mains + 1; end if;
    end loop;
    if v_n = 0 then raise exception 'no_items' using errcode = 'P0001'; end if;
    if v_n > 12 then raise exception 'too_many_items' using errcode = 'P0001'; end if;
    if v_kind = 'bundle' and (v_mains < 1 or v_withs < 1) then raise exception 'bundle_needs_two' using errcode = 'P0001'; end if;
  end if;

  if p_id is not null then
    select * into v_old from public.offers o where o.id = p_id and o.business_id = v_biz for update;
    if not found then raise exception 'offer_not_found' using errcode = 'P0001'; end if;
    if v_old.removed_by_admin then raise exception 'offer_not_found' using errcode = 'P0001'; end if;
    if v_old.kind is not null and v_old.scope <> v_scope then raise exception 'scope_locked' using errcode = 'P0001'; end if;
  end if;

  v_starts := coalesce(nullif(f ->> 'starts_at', '')::timestamptz, case when p_id is null then now() else v_old.starts_at end);
  v_ends := nullif(f ->> 'ends_at', '')::timestamptz;
  if p_id is null and v_starts < now() then v_starts := now(); end if;
  if v_ends is not null and v_ends <= now() then raise exception 'ends_in_past' using errcode = 'P0001'; end if;
  if v_ends is not null and v_starts is not null and v_ends <= v_starts then raise exception 'invalid_window' using errcode = 'P0001'; end if;
  if v_ends is not null and v_ends - coalesce(v_starts, now()) > interval '365 days' then raise exception 'duration_too_long' using errcode = 'P0001'; end if;

  if p_id is null then
    insert into public.offers (business_id, scope, title, description, kind, config, conditions, chip_text, code, terms, starts_at, ends_at)
    values (v_biz, v_scope, coalesce(v_title, 'Special offer'), v_desc, v_kind, v_config, v_conditions, v_chip, v_code, v_terms, v_starts, v_ends)
    returning id into v_id;
  else
    v_id := p_id;
    delete from public.offer_items where offer_id = v_id;
    update public.offers set
      scope = v_scope, title = coalesce(v_title, title), description = v_desc, kind = v_kind, config = v_config, conditions = v_conditions,
      chip_text = v_chip, code = v_code, terms = v_terms, starts_at = v_starts, ends_at = v_ends
    where id = v_id;
  end if;

  if v_scope = 'product' then
    v_seen := '{}';
    for e in select * from jsonb_array_elements(p_items) loop
      v_item := (e ->> 'item_id')::uuid;
      if v_item = any (v_seen) then continue; end if;
      v_seen := v_seen || v_item;
      v_pos := v_pos + 1;
      insert into public.offer_items (offer_id, item_id, business_id, role, sort)
      values (v_id, v_item, v_biz, case when v_kind = 'bundle' and e ->> 'role' = 'with' then 'with' else 'main' end, v_pos);
    end loop;
  end if;
  return v_id;
end $$;
revoke all on function public.seller_save_offer(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.seller_save_offer(uuid, jsonb, jsonb) to authenticated, service_role;

-- Deletes the offer and, by cascade, its product list. Works on running, scheduled, paused and ended offers alike.
create or replace function public.seller_delete_offer(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_biz uuid := public.my_business_id();
begin
  perform public.assert_seller_active();
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  delete from public.offers where id = p_id and business_id = v_biz and not removed_by_admin;
  if not found then raise exception 'offer_not_found' using errcode = 'P0001'; end if;
  return true;
end $$;
revoke all on function public.seller_delete_offer(uuid) from public, anon;
grant execute on function public.seller_delete_offer(uuid) to authenticated, service_role;
