-- 0044_product_offers.sql
-- Offers belong to PRODUCTS. A store card shows an Offer chip because at least one of its products has a running offer;
-- a product card, the store page's product list and the product page show the offer only on the products that are in it.
-- The offer never changes a product's price: items.price (and any flash sale price) stays the truth, the deal is
-- explained beside it.
--
--   * offers gets a kind (percent off, buy X get Y, multi-buy, bundle, volume, free gift), its settings, who and when
--     it applies to (days, hours, new customers, minimum spend), an optional chip text, code and terms.
--   * offer_items says which products an offer is on. A bundle has main products and companion ("with") products.
--   * offer_config_valid() / offer_conditions_valid() are the rules of shared/src/offers.js, enforced on every write
--     path by a trigger. A test keeps the two sides equal.
--   * public_offers (customers) now lists only offers on at least one public product, with those products. Offers
--     written before this migration have no product and no kind, so they stop showing until the seller attaches
--     products. Nothing is deleted.
--   * The plan's active-offer limit stops counting offers whose end time has passed.
--   * seller_save_offer / seller_set_offer_active / seller_end_offer are the seller's write path.

alter table public.offers
  add column if not exists kind text check (kind is null or kind in ('percent_off','amount_off','buy_x_get_y','multi_buy','bundle','volume','free_gift')),
  add column if not exists config jsonb not null default '{}',
  add column if not exists conditions jsonb not null default '{}',
  add column if not exists chip_text text check (chip_text is null or char_length(chip_text) between 2 and 22),
  add column if not exists code text check (code is null or code ~ '^[A-Z0-9]{3,16}$'),
  add column if not exists terms text check (terms is null or char_length(terms) <= 280);
alter table public.offers drop constraint if exists offers_config_object;
alter table public.offers add constraint offers_config_object
  check (jsonb_typeof(config) = 'object' and jsonb_typeof(conditions) = 'object' and octet_length(config::text) <= 1500 and octet_length(conditions::text) <= 500);

create index if not exists offers_business_window_idx on public.offers (business_id, ends_at) where active;

-- ---------------------------------------------------------------------------
-- Rules (same as shared/src/offers.js)
-- ---------------------------------------------------------------------------
create or replace function public.offer_int(v jsonb) returns integer
language sql immutable as $$
  select case when jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric) and abs((v #>> '{}')::numeric) < 1000000000
    then (v #>> '{}')::numeric::integer end
$$;

create or replace function public.offer_num(v jsonb) returns numeric
language sql immutable as $$
  select case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric end
$$;

create or replace function public.offer_text_ok(v jsonb, p_min integer, p_max integer) returns boolean
language sql immutable as $$
  select coalesce(jsonb_typeof(v) = 'string' and char_length(btrim(v #>> '{}')) between p_min and p_max and (v #>> '{}') !~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', false)
$$;

create or replace function public.offer_config_valid(p_kind text, p_config jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare
  c jsonb := coalesce(p_config, '{}'::jsonb);
  t jsonb;
  q integer;
  pc integer;
  prev_q integer := 0;
  prev_p integer := 0;
begin
  if jsonb_typeof(c) <> 'object' then return false; end if;
  if p_kind = 'percent_off' then
    return coalesce(public.offer_int(c -> 'percent') between 1 and 99, false);
  elsif p_kind = 'amount_off' then
    return coalesce(public.offer_num(c -> 'amount') > 0 and public.offer_num(c -> 'amount') <= 10000000, false);
  elsif p_kind = 'buy_x_get_y' then
    return coalesce(public.offer_int(c -> 'buy') between 1 and 50 and public.offer_int(c -> 'get') between 1 and 50
      and public.offer_int(c -> 'discountPercent') between 1 and 100, false);
  elsif p_kind = 'multi_buy' then
    return coalesce(public.offer_int(c -> 'qty') between 2 and 100 and public.offer_num(c -> 'price') > 0 and public.offer_num(c -> 'price') <= 100000000, false);
  elsif p_kind = 'bundle' then
    case c ->> 'rewardType'
      when 'free_gift' then return public.offer_text_ok(c -> 'gift', 2, 48);
      when 'percent_off' then return coalesce(public.offer_int(c -> 'rewardValue') between 1 and 99, false);
      when 'amount_off' then return coalesce(public.offer_num(c -> 'rewardValue') > 0 and public.offer_num(c -> 'rewardValue') <= 10000000, false);
      when 'bundle_price' then return coalesce(public.offer_num(c -> 'rewardValue') > 0 and public.offer_num(c -> 'rewardValue') <= 100000000, false);
      else return false;
    end case;
  elsif p_kind = 'volume' then
    if jsonb_typeof(c -> 'tiers') <> 'array' or jsonb_array_length(c -> 'tiers') not between 1 and 4 then return false; end if;
    for t in select * from jsonb_array_elements(c -> 'tiers') loop
      q := public.offer_int(t -> 'qty');
      pc := public.offer_int(t -> 'percent');
      if q is null or pc is null or q < 2 or q > 1000 or pc < 1 or pc > 99 or q <= prev_q or pc <= prev_p then return false; end if;
      prev_q := q;
      prev_p := pc;
    end loop;
    return true;
  elsif p_kind = 'free_gift' then
    if not public.offer_text_ok(c -> 'gift', 2, 48) then return false; end if;
    if c ? 'minQty' and not coalesce(public.offer_int(c -> 'minQty') between 1 and 1000, false) then return false; end if;
    return true;
  end if;
  return false;
end $$;

create or replace function public.offer_conditions_valid(p_conditions jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare
  c jsonb := coalesce(p_conditions, '{}'::jsonb);
  d text;
  seen text[] := '{}';
begin
  if jsonb_typeof(c) <> 'object' then return false; end if;
  if c ? 'daysOfWeek' then
    if jsonb_typeof(c -> 'daysOfWeek') <> 'array' or jsonb_array_length(c -> 'daysOfWeek') > 6 then return false; end if;
    for d in select jsonb_array_elements_text(c -> 'daysOfWeek') loop
      if d not in ('mon','tue','wed','thu','fri','sat','sun') or d = any (seen) then return false; end if;
      seen := seen || d;
    end loop;
  end if;
  if c ? 'hours' then
    if jsonb_typeof(c -> 'hours') <> 'object'
       or coalesce(c -> 'hours' ->> 'from', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or coalesce(c -> 'hours' ->> 'to', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or (c -> 'hours' ->> 'from') = (c -> 'hours' ->> 'to') then return false; end if;
  end if;
  if c ? 'newCustomersOnly' and jsonb_typeof(c -> 'newCustomersOnly') <> 'boolean' then return false; end if;
  if c ? 'minSpend' and not coalesce(public.offer_num(c -> 'minSpend') > 0 and public.offer_num(c -> 'minSpend') <= 10000000, false) then return false; end if;
  return true;
end $$;
grant execute on function public.offer_int(jsonb), public.offer_num(jsonb), public.offer_text_ok(jsonb, integer, integer),
  public.offer_config_valid(text, jsonb), public.offer_conditions_valid(jsonb) to anon, authenticated, service_role;

create or replace function public.offers_check_rules() returns trigger
language plpgsql set search_path = public as $$
begin
  -- Offers from before products were attached have no kind: they stay as they are and show nothing.
  if new.kind is null then
    if tg_op = 'INSERT' and public.actor_role() = 'seller' and new.config <> '{}'::jsonb then raise exception 'invalid_offer_config' using errcode = 'P0001'; end if;
    return new;
  end if;
  if not public.offer_config_valid(new.kind, new.config) then raise exception 'invalid_offer_config' using errcode = 'P0001'; end if;
  if not public.offer_conditions_valid(new.conditions) then raise exception 'invalid_offer_conditions' using errcode = 'P0001'; end if;
  if new.starts_at is not null and new.ends_at is not null and new.ends_at <= new.starts_at then raise exception 'invalid_window' using errcode = 'P0001'; end if;
  if new.ends_at is not null and new.ends_at - coalesce(new.starts_at, new.created_at, now()) > interval '365 days' then raise exception 'duration_too_long' using errcode = 'P0001'; end if;
  return new;
end $$;
drop trigger if exists t_offers_rules on public.offers;
create trigger t_offers_rules before insert or update on public.offers for each row execute function public.offers_check_rules();

-- The plan's active-offer limit counts offers that are on, not ones whose end time has passed.
create or replace function public.enforce_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cat text;
  v_plan text;
  v_limit integer;
  v_count integer;
  v_tbl text := tg_table_name;
begin
  if public.actor_role() <> 'seller' then return new; end if;
  if v_tbl = 'offers' then
    if not new.active then return new; end if;
    if tg_op = 'UPDATE' and old.active then return new; end if;
  end if;
  perform pg_advisory_xact_lock(hashtext(new.business_id::text || v_tbl));
  select b.category_id, b.plan_key into v_cat, v_plan from public.businesses b where b.id = new.business_id;
  if v_tbl = 'items' then
    select p.items_limit into v_limit from public.plans p where p.category_id = v_cat and p.plan_key = v_plan;
    if not found then v_limit := 0; end if;
    select count(*) into v_count from public.items i where i.business_id = new.business_id;
  elsif v_tbl = 'faqs' then
    select (case v_plan when 'premium' then g.premium else g.standard end ->> 'faqs')::integer into v_limit
      from public.global_limits g where g.id = 1;
    select count(*) into v_count from public.faqs f where f.business_id = new.business_id;
  else
    select (case v_plan when 'premium' then g.premium else g.standard end ->> 'activeOffers')::integer into v_limit
      from public.global_limits g where g.id = 1;
    select count(*) into v_count from public.offers o where o.business_id = new.business_id and o.active and (o.ends_at is null or o.ends_at > now());
  end if;
  if v_limit is not null and v_count >= v_limit then
    raise exception 'limit_reached:%', v_tbl using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Which products an offer is on
-- ---------------------------------------------------------------------------
create table if not exists public.offer_items (
  offer_id uuid not null references public.offers(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  role text not null default 'main' check (role in ('main','with')),
  sort integer not null default 0,
  primary key (offer_id, item_id)
);
create index if not exists offer_items_item_idx on public.offer_items (item_id);
create index if not exists offer_items_business_idx on public.offer_items (business_id);

create or replace function public.offer_items_check() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.offers o where o.id = new.offer_id and o.business_id = new.business_id) then
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
drop trigger if exists t_offer_items_check on public.offer_items;
create trigger t_offer_items_check before insert or update on public.offer_items for each row execute function public.offer_items_check();

alter table public.offer_items enable row level security;
drop policy if exists "admin all offer_items" on public.offer_items;
create policy "admin all offer_items" on public.offer_items for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "seller reads own offer_items" on public.offer_items;
create policy "seller reads own offer_items" on public.offer_items for select to authenticated using (business_id = public.my_business_id());
drop policy if exists "seller inserts own offer_items" on public.offer_items;
create policy "seller inserts own offer_items" on public.offer_items for insert to authenticated with check (business_id = public.my_business_id());
drop policy if exists "seller updates own offer_items" on public.offer_items;
create policy "seller updates own offer_items" on public.offer_items for update to authenticated using (business_id = public.my_business_id()) with check (business_id = public.my_business_id());
drop policy if exists "seller deletes own offer_items" on public.offer_items;
create policy "seller deletes own offer_items" on public.offer_items for delete to authenticated using (business_id = public.my_business_id());

do $$
declare cmd text;
begin
  foreach cmd in array array['insert', 'update', 'delete'] loop
    execute format('drop policy if exists %I on public.offer_items', 'suspended cannot ' || cmd || ' offer_items');
  end loop;
  create policy "suspended cannot insert offer_items" on public.offer_items as restrictive for insert to authenticated with check (public.is_admin() or not public.my_business_suspended());
  create policy "suspended cannot update offer_items" on public.offer_items as restrictive for update to authenticated using (public.is_admin() or not public.my_business_suspended()) with check (public.is_admin() or not public.my_business_suspended());
  create policy "suspended cannot delete offer_items" on public.offer_items as restrictive for delete to authenticated using (public.is_admin() or not public.my_business_suspended());
end $$;

revoke all on public.offer_items from public, anon;
grant select, insert, update, delete on public.offer_items to authenticated;
grant all on public.offer_items to service_role;

-- ---------------------------------------------------------------------------
-- What customers can see
-- ---------------------------------------------------------------------------
-- A product is public when customers can see it (the same rule as public_items). An offer is public when its store is
-- live, it is switched on, inside its window, not hidden or removed by an admin, has a kind, and is on at least one
-- public product (a bundle needs a public main product and a public companion). New columns go last so the view
-- definition stays valid.
create or replace view public.public_offers with (security_barrier = true) as
select
  o.id, o.business_id, o.title, o.description, o.starts_at, o.ends_at, o.created_at,
  o.kind, o.config, o.conditions, o.chip_text, o.code, o.terms,
  p.items
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
  and (p.mains + p.withs) > 0
  and (o.kind <> 'bundle' or (p.mains > 0 and p.withs > 0));
revoke all on public.public_offers from public;
grant select on public.public_offers to anon, authenticated, service_role;

-- One row per product that has a running offer. This is what a store card's Offer chip counts.
create or replace view public.public_offer_items with (security_barrier = true) as
select
  oi.offer_id, oi.item_id, oi.business_id, oi.role, po.starts_at, po.ends_at
from public.offer_items oi
join public.public_offers po on po.id = oi.offer_id
join public.items i on i.id = oi.item_id
where i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin;
revoke all on public.public_offer_items from public;
grant select on public.public_offer_items to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Seller write path
-- ---------------------------------------------------------------------------
create or replace function public.seller_save_offer(p_id uuid, p_fields jsonb, p_items jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_biz uuid := public.my_business_id();
  f jsonb := coalesce(p_fields, '{}'::jsonb);
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

  if v_kind is null or v_kind not in ('percent_off','amount_off','buy_x_get_y','multi_buy','bundle','volume','free_gift') then
    raise exception 'invalid_kind' using errcode = 'P0001';
  end if;
  if not public.offer_config_valid(v_kind, v_config) then raise exception 'invalid_config' using errcode = 'P0001'; end if;
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

  if p_id is not null then
    select * into v_old from public.offers o where o.id = p_id and o.business_id = v_biz for update;
    if not found then raise exception 'offer_not_found' using errcode = 'P0001'; end if;
    if v_old.removed_by_admin then raise exception 'offer_not_found' using errcode = 'P0001'; end if;
  end if;

  v_starts := coalesce(nullif(f ->> 'starts_at', '')::timestamptz, case when p_id is null then now() else v_old.starts_at end);
  v_ends := nullif(f ->> 'ends_at', '')::timestamptz;
  if p_id is null and v_starts < now() then v_starts := now(); end if;
  if v_ends is not null and v_ends <= now() then raise exception 'ends_in_past' using errcode = 'P0001'; end if;
  if v_ends is not null and v_starts is not null and v_ends <= v_starts then raise exception 'invalid_window' using errcode = 'P0001'; end if;
  if v_ends is not null and v_ends - coalesce(v_starts, now()) > interval '365 days' then raise exception 'duration_too_long' using errcode = 'P0001'; end if;

  if p_id is null then
    insert into public.offers (business_id, title, description, kind, config, conditions, chip_text, code, terms, starts_at, ends_at)
    values (v_biz, coalesce(v_title, 'Special offer'), v_desc, v_kind, v_config, v_conditions, v_chip, v_code, v_terms, v_starts, v_ends)
    returning id into v_id;
  else
    v_id := p_id;
    update public.offers set
      title = coalesce(v_title, title), description = v_desc, kind = v_kind, config = v_config, conditions = v_conditions,
      chip_text = v_chip, code = v_code, terms = v_terms, starts_at = v_starts, ends_at = v_ends
    where id = v_id;
    delete from public.offer_items where offer_id = v_id;
  end if;

  v_seen := '{}';
  for e in select * from jsonb_array_elements(p_items) loop
    v_item := (e ->> 'item_id')::uuid;
    if v_item = any (v_seen) then continue; end if;
    v_seen := v_seen || v_item;
    v_pos := v_pos + 1;
    insert into public.offer_items (offer_id, item_id, business_id, role, sort)
    values (v_id, v_item, v_biz, case when v_kind = 'bundle' and e ->> 'role' = 'with' then 'with' else 'main' end, v_pos);
  end loop;
  return v_id;
end $$;
revoke all on function public.seller_save_offer(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.seller_save_offer(uuid, jsonb, jsonb) to authenticated, service_role;

create or replace function public.seller_set_offer_active(p_id uuid, p_active boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_biz uuid := public.my_business_id();
begin
  perform public.assert_seller_active();
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  update public.offers set active = coalesce(p_active, false)
  where id = p_id and business_id = v_biz and not removed_by_admin;
  if not found then raise exception 'offer_not_found' using errcode = 'P0001'; end if;
  return true;
end $$;
revoke all on function public.seller_set_offer_active(uuid, boolean) from public, anon;
grant execute on function public.seller_set_offer_active(uuid, boolean) to authenticated, service_role;

-- Ending a running offer stamps its end now, so it stays in the seller's history. One that has not started yet is just removed.
create or replace function public.seller_end_offer(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_biz uuid := public.my_business_id();
  v_o public.offers;
begin
  perform public.assert_seller_active();
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select * into v_o from public.offers o where o.id = p_id and o.business_id = v_biz and not o.removed_by_admin for update;
  if not found then raise exception 'offer_not_found' using errcode = 'P0001'; end if;
  if v_o.starts_at is not null and v_o.starts_at > now() then
    delete from public.offers where id = p_id;
    return 'removed';
  end if;
  update public.offers set ends_at = now() where id = p_id and (ends_at is null or ends_at > now());
  return 'ended';
end $$;
revoke all on function public.seller_end_offer(uuid) from public, anon;
grant execute on function public.seller_end_offer(uuid) to authenticated, service_role;

grant all on public.offers to service_role;

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['offers', 'offer_items'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
