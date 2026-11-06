-- 0091 (A08): departments as data, selling restrictions on product types, missing-type requests.
--
--   1. departments            Clothing, Shoes, Bags ... one row each (data, not code). Types point at one.
--   2. product_types          contract-shaped table (id, slug, name, kind, department_id, category_ids, restricted_to, quantity_mode, axes, spec_rows,
--                             size_chart_id). Seeded here ONLY with the five types this migration needs to be testable (the regulated three
--                             plus fragrance and stationery). TODO(contract:A06): A06 owns the full type list and must add the remaining types with
--                             `insert ... on conflict (id) do update`; every column below is created `if not exists` so A06 can add the rest.
--   3. restricted_to          shop CATEGORY ids (businesses.category_id). Empty = any shop may sell the type. A restriction naming a category that
--                             does not exist simply means nobody can sell the type (it fails closed).
--   4. items.product_type_id  nullable; null is "Other goods". Items that have no type are untouched.
--   5. enforcement            shop_can_sell_type() + a trigger on items (the guarantee, whoever writes the row) + seller_save_item, which now
--                             accepts `productTypeId` and checks it first so the seller gets a named error.
--                             seller_save_item(uuid, jsonb) is WRAPPED: the 0086 function is renamed seller_save_item_base (no direct grant) and
--                             called by the new wrapper, so none of its 170 lines is copied. seller_check_item (0088) calls seller_save_item and so
--                             checks types too, with nothing written.
--   6. type_requests          a seller who cannot find a type asks for one (seller_request_type) and still adds the item as Other goods.
--                             Admin side: admin_type_requests_list, admin_resolve_type_request.
--   7. seller_product_types   departments + the types THIS shop may sell. TODO(contract:A06): A06 may replace the body; keep the shape
--                             { departments: [{id, name}], types: [ProductType] } and keep leaving out types the shop may not sell.
--
-- Nothing already applied is edited. Old items (no type) behave exactly as before.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Departments
-- ---------------------------------------------------------------------------------------------------------------------

create table if not exists public.departments (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(id) <= 40),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.departments enable row level security;
drop policy if exists "departments are public" on public.departments;
create policy "departments are public" on public.departments for select to anon, authenticated using (active);
grant select on public.departments to anon, authenticated;
grant all on public.departments to service_role;

insert into public.departments (id, name, sort) values
  ('clothing',            'Clothing',                  10),
  ('shoes',               'Shoes',                     20),
  ('bags',                'Bags',                      30),
  ('jewellery',           'Jewellery',                 40),
  ('fragrance',           'Fragrance',                 50),
  ('phones',              'Phones',                    60),
  ('computers',           'Computers',                 70),
  ('cables-power',        'Cables and power',          80),
  ('lighting',            'Lighting',                  90),
  ('batteries',           'Batteries',                100),
  ('printers-ink',        'Printers and ink',         110),
  ('printing-services',   'Printing services',        120),
  ('stationery',          'Stationery',               130),
  -- the rest of the live shop categories (client/src/data/categories.js groups), so no live category has nowhere to sell
  ('water-energy',        'Water and energy',         200),
  ('food-drink',          'Food and drink',           210),
  ('medicine-health',     'Medicine and health',      220),
  ('eyewear',             'Eyewear',                  230),
  ('beauty-personal-care','Beauty and personal care', 240),
  ('fitness',             'Fitness',                  250),
  ('farm-inputs',         'Farm inputs and vet',      260),
  ('electronics',         'Electronics and appliances',270),
  ('hardware-building',   'Hardware and building',    280),
  ('plumbing-electrical', 'Plumbing and electrical',  290),
  ('furniture',           'Furniture',                300),
  ('home-kitchen',        'Home and kitchen',         310),
  ('cleaning-laundry',    'Cleaning and laundry',     320),
  ('auto-parts',          'Auto parts and garage',    330),
  ('education',           'Education and childcare',  340),
  ('photography-events',  'Photography and events',   350)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2 + 3. Product types (contract-shaped) and restricted_to
-- ---------------------------------------------------------------------------------------------------------------------

create table if not exists public.product_types (id text primary key);
alter table public.product_types add column if not exists slug text;
alter table public.product_types add column if not exists name text;
alter table public.product_types add column if not exists kind text not null default 'good';
alter table public.product_types add column if not exists department_id text references public.departments (id);
alter table public.product_types add column if not exists category_ids text[] not null default '{}';
alter table public.product_types add column if not exists restricted_to text[] not null default '{}';
alter table public.product_types add column if not exists quantity_mode text not null default 'units';
alter table public.product_types add column if not exists axes jsonb not null default '[]'::jsonb;
alter table public.product_types add column if not exists spec_rows jsonb not null default '[]'::jsonb;
alter table public.product_types add column if not exists size_chart_id uuid;
alter table public.product_types add column if not exists active boolean not null default true;
alter table public.product_types add column if not exists created_at timestamptz not null default now();

alter table public.product_types drop constraint if exists product_types_kind_ok;
alter table public.product_types add constraint product_types_kind_ok check (kind in ('good', 'service', 'package'));
alter table public.product_types drop constraint if exists product_types_quantity_mode_ok;
alter table public.product_types add constraint product_types_quantity_mode_ok check (quantity_mode in ('units', 'measure', 'none'));
alter table public.product_types drop constraint if exists product_types_restricted_ok;
-- no empty strings, no nulls inside the list
alter table public.product_types add constraint product_types_restricted_ok check (array_position(restricted_to, null) is null and array_position(restricted_to, '') is null);
alter table public.product_types drop constraint if exists product_types_axes_max;
alter table public.product_types add constraint product_types_axes_max check (jsonb_typeof(axes) = 'array' and jsonb_array_length(axes) <= 3);
alter table public.product_types drop constraint if exists product_types_spec_rows_shape;
alter table public.product_types add constraint product_types_spec_rows_shape check (jsonb_typeof(spec_rows) = 'array');
create unique index if not exists product_types_slug_uq on public.product_types (slug) where slug is not null;

alter table public.product_types enable row level security;
drop policy if exists "product types are public" on public.product_types;
create policy "product types are public" on public.product_types for select to anon, authenticated using (active);
grant select on public.product_types to anon, authenticated;
grant all on public.product_types to service_role;

-- Seed. TODO(contract:A06): the full list is A06's. These five make restrictions testable and match shared/src/types/restrictions.js.
insert into public.product_types (id, slug, name, kind, department_id, category_ids, restricted_to, quantity_mode) values
  ('prescription-medicine', 'prescription-medicine', 'Prescription medicine', 'good', 'medicine-health', '{chemist}',  '{chemist}', 'units'),
  ('vet-medicine',          'vet-medicine',          'Veterinary medicine',   'good', 'farm-inputs',     '{agrovet}',  '{agrovet}', 'units'),
  ('agrochemicals',         'agrochemicals',         'Agrochemicals',         'good', 'farm-inputs',     '{agrovet}',  '{agrovet}', 'units'),
  ('fragrance',             'fragrance',             'Fragrance',             'good', 'fragrance',       '{salon-beauty,fashion-boutiques,tailor-boutique,supermarket-minimart}', '{}', 'units'),
  ('stationery',            'stationery',            'Stationery',            'good', 'stationery',      '{printing-stationery,electronics-computers,supermarket-minimart}',      '{}', 'units')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4 + 5. items.product_type_id and enforcement
-- ---------------------------------------------------------------------------------------------------------------------

alter table public.items add column if not exists product_type_id text references public.product_types (id);
create index if not exists items_product_type_idx on public.items (product_type_id) where product_type_id is not null;

-- May this shop sell this type? Unknown type, unknown shop, inactive type: no. Empty restricted_to: any shop.
create or replace function public.shop_can_sell_type(p_business uuid, p_type text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select cardinality(t.restricted_to) = 0 or b.category_id = any (t.restricted_to)
      from public.product_types t, public.businesses b
     where t.id = p_type and t.active and b.id = p_business), false)
$$;
revoke all on function public.shop_can_sell_type(uuid, text) from public, anon;
grant execute on function public.shop_can_sell_type(uuid, text) to authenticated, service_role;

-- The guarantee: whichever function (or import, or admin tool) writes the row, a restricted type cannot be put on a shop that may not sell it.
-- Fires only when the type is set or changed, so editing an existing item never trips it.
create or replace function public.items_product_type_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.product_type_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.product_type_id is not distinct from old.product_type_id then return new; end if;
  if not exists (select 1 from public.product_types t where t.id = new.product_type_id and t.active) then
    raise exception 'unknown_product_type' using errcode = 'P0001';
  end if;
  if not public.shop_can_sell_type(new.business_id, new.product_type_id) then
    raise exception 'type_not_allowed' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists items_product_type_guard on public.items;
create trigger items_product_type_guard before insert or update of product_type_id on public.items
  for each row execute function public.items_product_type_guard();

-- Wrap seller_save_item. The 0086 text becomes seller_save_item_base (callable only through the wrapper).
do $$ begin
  if to_regprocedure('public.seller_save_item_base(uuid, jsonb)') is null then
    alter function public.seller_save_item(uuid, jsonb) rename to seller_save_item_base;
  end if;
end $$;
revoke all on function public.seller_save_item_base(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.seller_save_item_base(uuid, jsonb) to service_role;

create or replace function public.seller_save_item(p_id uuid, p_fields jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  f jsonb := coalesce(p_fields, '{}'::jsonb);
  v_biz uuid := public.my_business_id();
  v_has boolean := f ? 'productTypeId';
  v_type text;
  v_id uuid;
begin
  perform public.assert_seller_active();
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;

  -- productTypeId: absent = leave the item's type alone; null = Other goods; text = a type this shop may sell.
  if v_has then
    if jsonb_typeof(f -> 'productTypeId') not in ('string', 'null') then raise exception 'invalid_product_type' using errcode = 'P0001'; end if;
    v_type := nullif(btrim(coalesce(f ->> 'productTypeId', '')), '');
    if v_type is not null then
      if not exists (select 1 from public.product_types t where t.id = v_type and t.active) then
        raise exception 'unknown_product_type' using errcode = 'P0001';
      end if;
      if not public.shop_can_sell_type(v_biz, v_type) then raise exception 'type_not_allowed' using errcode = 'P0001'; end if;
    end if;
  end if;

  v_id := public.seller_save_item_base(p_id, f - 'productTypeId');

  if v_has then
    update public.items set product_type_id = v_type where id = v_id and product_type_id is distinct from v_type;   -- the trigger checks again
  end if;
  return v_id;
end $$;
revoke all on function public.seller_save_item(uuid, jsonb) from public, anon;
grant execute on function public.seller_save_item(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. Missing-type requests
-- ---------------------------------------------------------------------------------------------------------------------

create table if not exists public.type_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'resolved', 'declined')),
  resolved_type_id text references public.product_types (id) on delete set null,
  admin_note text check (admin_note is null or char_length(admin_note) <= 500),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'pending') = (resolved_at is null))
);
-- One open request per shop per name (case and spacing do not matter).
create unique index if not exists type_requests_open_name_uq on public.type_requests (business_id, lower(name)) where status = 'pending';
create index if not exists type_requests_status_idx on public.type_requests (status, created_at);

alter table public.type_requests enable row level security;
drop policy if exists "seller reads own type_requests" on public.type_requests;
create policy "seller reads own type_requests" on public.type_requests for select to authenticated using (business_id = public.my_business_id());
drop policy if exists "admin reads type_requests" on public.type_requests;
create policy "admin reads type_requests" on public.type_requests for select to authenticated using (public.is_admin());
revoke all on public.type_requests from public, anon;
grant select on public.type_requests to authenticated;
grant all on public.type_requests to service_role;

create or replace function public.seller_request_type(p_name text, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_biz uuid := public.my_business_id();
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid;
begin
  perform public.assert_seller_active();
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if char_length(v_name) not between 2 and 80 then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  if char_length(coalesce(v_note, '')) > 500 then raise exception 'invalid_note' using errcode = 'P0001'; end if;

  -- asking twice for the same thing returns the open request instead of a second row
  select r.id into v_id from public.type_requests r where r.business_id = v_biz and lower(r.name) = lower(v_name) and r.status = 'pending';
  if found then return v_id; end if;

  if (select count(*) from public.type_requests r where r.business_id = v_biz and r.status = 'pending') >= 20 then
    raise exception 'too_many_type_requests' using errcode = 'P0001';
  end if;
  begin
    insert into public.type_requests (business_id, name, note) values (v_biz, v_name, v_note) returning id into v_id;
  exception when unique_violation then
    select r.id into v_id from public.type_requests r where r.business_id = v_biz and lower(r.name) = lower(v_name) and r.status = 'pending';
    return v_id;
  end;
  perform public.write_audit(v_biz, 'type_request', 'type_request', v_id::text, jsonb_build_object('name', v_name));
  return v_id;
end $$;
revoke all on function public.seller_request_type(text, text) from public, anon;
grant execute on function public.seller_request_type(text, text) to authenticated, service_role;

create or replace function public.admin_type_requests_list(p_status text default 'pending') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status is not null and p_status not in ('pending', 'resolved', 'declined', 'all') then raise exception 'invalid_status' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at, x.id)
      from (select r.id, r.name, r.note, r.status, r.created_at, r.resolved_at, r.resolved_type_id as "resolvedTypeId", r.admin_note as "adminNote",
                   b.id as "businessId", b.name as "businessName", b.seller_id as "sellerId", b.category_id as "categoryId",
                   (select count(*) from public.type_requests o
                     where o.id <> r.id and o.status = 'pending' and lower(o.name) = lower(r.name)) as "alsoAskedBy"
              from public.type_requests r join public.businesses b on b.id = r.business_id
             where coalesce(p_status, 'pending') = 'all' or r.status = coalesce(p_status, 'pending')) x), '[]'::jsonb);
end $$;
revoke all on function public.admin_type_requests_list(text) from public, anon;
grant execute on function public.admin_type_requests_list(text) to authenticated, service_role;

-- outcome 'resolved' (optionally naming the type that now covers it) or 'declined' (a note is required so the seller learns why).
create or replace function public.admin_resolve_type_request(p_id uuid, p_outcome text, p_type_id text default null, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old public.type_requests;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.has_role(array['owner', 'reviewer']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_outcome is null or p_outcome not in ('resolved', 'declined') then raise exception 'invalid_outcome' using errcode = 'P0001'; end if;
  if char_length(coalesce(v_note, '')) > 500 then raise exception 'invalid_note' using errcode = 'P0001'; end if;
  if p_outcome = 'declined' and v_note is null then raise exception 'note_required' using errcode = 'P0001'; end if;
  if p_outcome = 'declined' and p_type_id is not null then raise exception 'invalid_outcome' using errcode = 'P0001'; end if;
  if p_type_id is not null and not exists (select 1 from public.product_types t where t.id = p_type_id and t.active) then
    raise exception 'unknown_product_type' using errcode = 'P0001';
  end if;
  select * into v_old from public.type_requests where id = p_id for update;
  if not found then raise exception 'type_request_not_found' using errcode = 'P0001'; end if;
  if v_old.status <> 'pending' then raise exception 'type_request_closed' using errcode = 'P0001'; end if;
  update public.type_requests set status = p_outcome, resolved_type_id = p_type_id, admin_note = v_note, resolved_by = auth.uid(), resolved_at = now() where id = p_id;
  perform public.admin_audit_action('type_request.' || p_outcome, 'type_request', p_id::text, jsonb_build_object('status', v_old.status, 'name', v_old.name),
    jsonb_build_object('status', p_outcome, 'typeId', p_type_id), v_note, v_old.business_id);
end $$;
revoke all on function public.admin_resolve_type_request(uuid, text, text, text) from public, anon;
grant execute on function public.admin_resolve_type_request(uuid, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 7. seller_product_types: departments and the types this shop may sell (restricted types the shop may not sell are left out)
-- ---------------------------------------------------------------------------------------------------------------------

create or replace function public.seller_product_types() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_biz uuid := public.my_business_id();
begin
  perform public.assert_seller_active();   -- repo rule: every plpgsql seller_* function refuses a suspended seller (conversations.test.mjs)
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  return jsonb_build_object(
    'departments', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by d.sort, d.id) from public.departments d where d.active), '[]'::jsonb),
    'types', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', t.id, 'slug', t.slug, 'name', t.name, 'kind', t.kind, 'departmentId', t.department_id, 'categoryIds', to_jsonb(t.category_ids),
                           'quantityMode', t.quantity_mode, 'axes', t.axes, 'specRows', t.spec_rows)
          || case when cardinality(t.restricted_to) > 0 then jsonb_build_object('restrictedTo', to_jsonb(t.restricted_to)) else '{}'::jsonb end
          || case when t.size_chart_id is not null then jsonb_build_object('sizeChartId', t.size_chart_id) else '{}'::jsonb end
        order by t.name, t.id)
      from public.product_types t where t.active and public.shop_can_sell_type(v_biz, t.id)), '[]'::jsonb));
end $$;
revoke all on function public.seller_product_types() from public, anon;
grant execute on function public.seller_product_types() to authenticated, service_role;
