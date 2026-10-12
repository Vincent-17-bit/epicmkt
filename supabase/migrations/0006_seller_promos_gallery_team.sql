create extension if not exists btree_gist with schema extensions;

create or replace function public.my_business_writable() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.businesses b where b.user_id = auth.uid() and b.status = 'live') $$;
revoke all on function public.my_business_writable() from public, anon;
grant execute on function public.my_business_writable() to authenticated, service_role;

alter table public.offers
  add column if not exists discount_type text,
  add column if not exists discount_value numeric(12,2),
  add column if not exists banner_path text;

alter table public.offers drop constraint if exists offers_discount_type_check;
alter table public.offers add constraint offers_discount_type_check check (discount_type in ('percent','kes'));
alter table public.offers drop constraint if exists offers_discount_pair_check;
alter table public.offers add constraint offers_discount_pair_check check ((discount_type is null) = (discount_value is null)) not valid;
alter table public.offers drop constraint if exists offers_window_check;
alter table public.offers add constraint offers_window_check check (starts_at is null or ends_at is null or ends_at > starts_at) not valid;
alter table public.offers drop constraint if exists offers_discount_range_check;
alter table public.offers add constraint offers_discount_range_check check (
  discount_value is null
  or (discount_type = 'percent' and discount_value between 1 and 90)
  or (discount_type = 'kes' and discount_value > 0)
) not valid;

create table if not exists public.offer_items (
  offer_id uuid not null references public.offers(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  primary key (offer_id, item_id)
);
create index if not exists offer_items_item_idx on public.offer_items (item_id);

create table if not exists public.flash_sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  discount_type text not null check (discount_type in ('percent','kes')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  on_end text not null default 'keep' check (on_end in ('keep','unlist')),
  hidden_by_admin boolean not null default false,
  admin_hide_reason text,
  admin_status text check (admin_status in ('ok','hidden','removed')),
  admin_reason text,
  removed_by_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (discount_type <> 'percent' or discount_value between 1 and 90)
);
create index if not exists flash_sales_business_idx on public.flash_sales (business_id, starts_at);
create index if not exists flash_sales_item_idx on public.flash_sales (item_id);

create table if not exists public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  path text not null unique,
  mime text not null,
  width integer check (width > 0),
  height integer check (height > 0),
  size_bytes bigint check (size_bytes >= 0),
  caption text check (char_length(caption) <= 120),
  sort integer not null default 0,
  pair_id uuid,
  pair_role text check (pair_role in ('before','after')),
  deleted_at timestamptz,
  hidden_by_admin boolean not null default false,
  admin_hide_reason text,
  admin_status text check (admin_status in ('ok','hidden','removed')),
  admin_reason text,
  removed_by_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((pair_id is null) = (pair_role is null))
);
create index if not exists gallery_photos_business_idx on public.gallery_photos (business_id, sort);
create unique index if not exists gallery_photos_pair_idx on public.gallery_photos (business_id, pair_id, pair_role) where pair_id is not null;

create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  role text check (char_length(role) <= 60),
  specialties text[] not null default '{}' check (cardinality(specialties) <= 10),
  photo_path text,
  sort integer not null default 0,
  hidden_by_admin boolean not null default false,
  admin_hide_reason text,
  admin_status text check (admin_status in ('ok','hidden','removed')),
  admin_reason text,
  removed_by_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists staff_members_business_idx on public.staff_members (business_id, sort);

create table if not exists public.staff_services (
  staff_id uuid not null references public.staff_members(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  primary key (staff_id, item_id)
);

create table if not exists public.timetable_slots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  start_time time not null,
  end_time time not null,
  class_name text not null check (char_length(class_name) between 2 and 80),
  staff_id uuid references public.staff_members(id) on delete set null,
  hidden_by_admin boolean not null default false,
  admin_hide_reason text,
  admin_status text check (admin_status in ('ok','hidden','removed')),
  admin_reason text,
  removed_by_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index if not exists timetable_slots_business_idx on public.timetable_slots (business_id, day_of_week, start_time);
alter table public.timetable_slots drop constraint if exists timetable_trainer_no_overlap;
alter table public.timetable_slots add constraint timetable_trainer_no_overlap exclude using gist (
  staff_id with =,
  day_of_week with =,
  tsrange(date '2000-01-01' + start_time, date '2000-01-01' + end_time) with &&
) where (staff_id is not null and coalesce(admin_status, 'ok') = 'ok' and not removed_by_admin and not hidden_by_admin);

drop trigger if exists t_flash_sales_touch on public.flash_sales;
create trigger t_flash_sales_touch before update on public.flash_sales for each row execute function public.touch_updated_at();
drop trigger if exists t_gallery_photos_touch on public.gallery_photos;
create trigger t_gallery_photos_touch before update on public.gallery_photos for each row execute function public.touch_updated_at();
drop trigger if exists t_staff_members_touch on public.staff_members;
create trigger t_staff_members_touch before update on public.staff_members for each row execute function public.touch_updated_at();
drop trigger if exists t_timetable_slots_touch on public.timetable_slots;
create trigger t_timetable_slots_touch before update on public.timetable_slots for each row execute function public.touch_updated_at();

drop trigger if exists t_flash_sales_protect on public.flash_sales;
create trigger t_flash_sales_protect before insert or update on public.flash_sales for each row execute function public.protect_admin_cols();
drop trigger if exists t_gallery_photos_protect on public.gallery_photos;
create trigger t_gallery_photos_protect before insert or update on public.gallery_photos for each row execute function public.protect_admin_cols();
drop trigger if exists t_staff_members_protect on public.staff_members;
create trigger t_staff_members_protect before insert or update on public.staff_members for each row execute function public.protect_admin_cols();
drop trigger if exists t_timetable_slots_protect on public.timetable_slots;
create trigger t_timetable_slots_protect before insert or update on public.timetable_slots for each row execute function public.protect_admin_cols();

create or replace function public.is_counted_offer(o public.offers) returns boolean
language sql stable as
$$ select o.active
   and (o.ends_at is null or o.ends_at > now())
   and coalesce(o.admin_status, 'ok') = 'ok'
   and not o.removed_by_admin
   and not o.hidden_by_admin $$;

create or replace function public.is_counted_flash(f public.flash_sales) returns boolean
language sql immutable as
$$ select coalesce(f.admin_status, 'ok') = 'ok' and not f.removed_by_admin and not f.hidden_by_admin $$;

create or replace function public.is_counted_gallery(g public.gallery_photos) returns boolean
language sql immutable as
$$ select g.deleted_at is null and coalesce(g.admin_status, 'ok') = 'ok' and not g.removed_by_admin and not g.hidden_by_admin $$;

create or replace function public.check_offer_prices(p_offer uuid, p_type text, p_value numeric) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p_type = 'kes' and exists (
    select 1 from public.offer_items oi join public.items i on i.id = oi.item_id
    where oi.offer_id = p_offer and (i.price is null or i.price <= p_value)
  ) then
    raise exception 'invalid_discount:kes_not_below_price';
  end if;
end $$;
revoke all on function public.check_offer_prices(uuid, text, numeric) from public, anon, authenticated;

create or replace function public.validate_offer() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_plan text;
begin
  if public.actor_role() = 'admin' then return new; end if;
  if new.starts_at is not null and new.ends_at is not null and new.ends_at <= new.starts_at then
    raise exception 'invalid_dates';
  end if;
  if (new.discount_type = 'percent' and (new.discount_value < 1 or new.discount_value > 90))
     or (new.discount_type = 'kes' and new.discount_value <= 0) then
    raise exception 'invalid_discount';
  end if;
  if new.banner_path is not null and (new.banner_path not like new.business_id::text || '/banners/%' or new.banner_path like '%..%') then
    raise exception 'invalid_banner_path';
  end if;
  select b.plan_key into v_plan from public.businesses b where b.id = new.business_id;
  if v_plan <> 'premium' and new.starts_at > now() + interval '5 minutes'
     and (tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at) then
    raise exception 'premium_only:schedule';
  end if;
  if tg_op = 'UPDATE' and (new.discount_type, new.discount_value) is distinct from (old.discount_type, old.discount_value) then
    perform public.check_offer_prices(new.id, new.discount_type, new.discount_value);
  end if;
  return new;
end $$;
drop trigger if exists t_offers_1_validate on public.offers;
create trigger t_offers_1_validate before insert or update on public.offers for each row execute function public.validate_offer();

create or replace function public.enforce_offer_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_plan text;
  v_limit integer;
  v_count integer;
begin
  if public.actor_role() = 'admin' then return new; end if;
  if not public.is_counted_offer(new) then return new; end if;
  if tg_op = 'UPDATE' and public.is_counted_offer(old) then return new; end if;
  perform pg_advisory_xact_lock(hashtext(new.business_id::text || 'offers'));
  select b.plan_key into v_plan from public.businesses b where b.id = new.business_id;
  select (case v_plan when 'premium' then g.premium else g.standard end ->> 'activeOffers')::integer into v_limit
    from public.global_limits g where g.id = 1;
  if v_limit is null then return new; end if;
  select count(*) into v_count from public.offers o
    where o.business_id = new.business_id and o.id <> new.id and public.is_counted_offer(o);
  if v_count >= v_limit then raise exception 'limit_reached:offers' using errcode = 'P0001'; end if;
  return new;
end $$;
drop trigger if exists t_offers_limit on public.offers;
drop trigger if exists t_offers_2_limit on public.offers;
create trigger t_offers_2_limit before insert or update on public.offers for each row execute function public.enforce_offer_limit();

create or replace function public.validate_offer_item() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o public.offers;
  i public.items;
begin
  select * into o from public.offers where id = new.offer_id;
  select * into i from public.items where id = new.item_id;
  if o.id is null or i.id is null or o.business_id <> new.business_id or i.business_id <> new.business_id then
    raise exception 'item_not_owned';
  end if;
  if public.actor_role() <> 'admin' and o.discount_type = 'kes' and (i.price is null or i.price <= o.discount_value) then
    raise exception 'invalid_discount:kes_not_below_price';
  end if;
  return new;
end $$;
drop trigger if exists t_offer_items_validate on public.offer_items;
create trigger t_offer_items_validate before insert or update on public.offer_items for each row execute function public.validate_offer_item();

create or replace function public.validate_flash_sale() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  i public.items;
begin
  if public.actor_role() = 'admin' then return new; end if;
  select * into i from public.items where id = new.item_id;
  if i.id is null or i.business_id <> new.business_id then raise exception 'item_not_owned'; end if;
  if new.ends_at <= new.starts_at then raise exception 'invalid_dates'; end if;
  if (tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at) and new.starts_at < now() - interval '15 minutes' then
    raise exception 'invalid_dates:past';
  end if;
  if (tg_op = 'INSERT' or new.ends_at is distinct from old.ends_at) and new.ends_at <= now() then
    raise exception 'invalid_dates:past';
  end if;
  if tg_op = 'INSERT' or (new.item_id, new.discount_type, new.discount_value) is distinct from (old.item_id, old.discount_type, old.discount_value) then
    if new.discount_type = 'percent' and (new.discount_value < 1 or new.discount_value > 90) then
      raise exception 'invalid_discount';
    end if;
    if new.discount_type = 'kes' and (i.price is null or new.discount_value >= i.price) then
      raise exception 'invalid_discount:kes_not_below_price';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists t_flash_sales_1_validate on public.flash_sales;
create trigger t_flash_sales_1_validate before insert or update on public.flash_sales for each row execute function public.validate_flash_sale();

create or replace function public.enforce_flash_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_plan text;
  v_month integer;
  v_conc integer;
  v_count integer;
  v_peak integer;
begin
  if public.actor_role() = 'admin' then return new; end if;
  if not public.is_counted_flash(new) then return new; end if;
  if tg_op = 'UPDATE' and public.is_counted_flash(old)
     and old.starts_at = new.starts_at and old.ends_at = new.ends_at then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext(new.business_id::text || 'flash_sales'));
  select b.plan_key into v_plan from public.businesses b where b.id = new.business_id;
  select (case v_plan when 'premium' then g.premium else g.standard end ->> 'flashSalesPerMonth')::integer,
         (case v_plan when 'premium' then g.premium else g.standard end ->> 'flashSalesConcurrent')::integer
    into v_month, v_conc from public.global_limits g where g.id = 1;
  if v_month is not null then
    select count(*) into v_count from public.flash_sales f
      where f.business_id = new.business_id and f.id <> new.id and public.is_counted_flash(f)
        and date_trunc('month', f.starts_at at time zone 'Africa/Nairobi') = date_trunc('month', new.starts_at at time zone 'Africa/Nairobi');
    if v_count >= v_month then raise exception 'limit_reached:flash_sales_month' using errcode = 'P0001'; end if;
  end if;
  if v_conc is not null then
    select coalesce(max(c), 0) into v_peak from (
      select (select count(*) from public.flash_sales s
                where s.business_id = new.business_id and s.id <> new.id and public.is_counted_flash(s)
                  and s.starts_at <= p.t and s.ends_at > p.t) as c
      from (
        select new.starts_at as t
        union
        select s2.starts_at from public.flash_sales s2
          where s2.business_id = new.business_id and s2.id <> new.id and public.is_counted_flash(s2)
            and s2.starts_at > new.starts_at and s2.starts_at < new.ends_at
      ) p
    ) x;
    if v_peak >= v_conc then raise exception 'limit_reached:flash_sales_concurrent' using errcode = 'P0001'; end if;
  end if;
  return new;
end $$;
drop trigger if exists t_flash_sales_2_limit on public.flash_sales;
create trigger t_flash_sales_2_limit before insert or update on public.flash_sales for each row execute function public.enforce_flash_limit();

create or replace function public.validate_gallery_photo() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cat text;
begin
  if public.actor_role() = 'admin' then return new; end if;
  if tg_op = 'INSERT' then
    if new.path not like new.business_id::text || '/gallery/%' or new.path like '%..%' then
      raise exception 'path_not_owned' using errcode = '42501';
    end if;
  elsif public.actor_role() = 'seller' then
    if (new.business_id, new.path, new.mime, new.width, new.height, new.size_bytes)
       is distinct from (old.business_id, old.path, old.mime, old.width, old.height, old.size_bytes) then
      raise exception 'gallery_columns_protected' using errcode = '42501';
    end if;
  end if;
  if new.pair_id is not null then
    select b.category_id into v_cat from public.businesses b where b.id = new.business_id;
    if v_cat not in ('barbershop', 'salon-beauty') then raise exception 'pair_category'; end if;
  end if;
  return new;
end $$;
drop trigger if exists t_gallery_photos_1_validate on public.gallery_photos;
create trigger t_gallery_photos_1_validate before insert or update on public.gallery_photos for each row execute function public.validate_gallery_photo();

create or replace function public.enforce_gallery_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_plan text;
  v_limit integer;
  v_count integer;
begin
  if public.actor_role() = 'admin' then return new; end if;
  if not public.is_counted_gallery(new) then return new; end if;
  if tg_op = 'UPDATE' and public.is_counted_gallery(old) then return new; end if;
  perform pg_advisory_xact_lock(hashtext(new.business_id::text || 'gallery_photos'));
  select b.plan_key into v_plan from public.businesses b where b.id = new.business_id;
  select (case v_plan when 'premium' then g.premium else g.standard end ->> 'galleryPhotos')::integer into v_limit
    from public.global_limits g where g.id = 1;
  if v_limit is null then return new; end if;
  select count(*) into v_count from public.gallery_photos p
    where p.business_id = new.business_id and p.id <> new.id and public.is_counted_gallery(p);
  if v_count >= v_limit then raise exception 'limit_reached:gallery_photos' using errcode = 'P0001'; end if;
  return new;
end $$;
drop trigger if exists t_gallery_photos_2_limit on public.gallery_photos;
create trigger t_gallery_photos_2_limit before insert or update on public.gallery_photos for each row execute function public.enforce_gallery_limit();

create or replace function public.validate_staff_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.actor_role() = 'admin' then return new; end if;
  if new.photo_path is not null and (new.photo_path not like new.business_id::text || '/staff/%' or new.photo_path like '%..%') then
    raise exception 'invalid_photo_path';
  end if;
  return new;
end $$;
drop trigger if exists t_staff_members_1_validate on public.staff_members;
create trigger t_staff_members_1_validate before insert or update on public.staff_members for each row execute function public.validate_staff_member();

create or replace function public.validate_staff_service() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_plan text;
  s public.staff_members;
  i public.items;
begin
  if public.actor_role() = 'admin' then return new; end if;
  select * into s from public.staff_members where id = new.staff_id;
  select * into i from public.items where id = new.item_id;
  if s.id is null or i.id is null or s.business_id <> new.business_id or i.business_id <> new.business_id then
    raise exception 'item_not_owned';
  end if;
  select b.plan_key into v_plan from public.businesses b where b.id = new.business_id;
  if v_plan <> 'premium' and tg_op = 'INSERT' then raise exception 'premium_only:services'; end if;
  return new;
end $$;
drop trigger if exists t_staff_services_validate on public.staff_services;
create trigger t_staff_services_validate before insert or update on public.staff_services for each row execute function public.validate_staff_service();

create or replace function public.validate_timetable_slot() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_plan text;
  v_cat text;
  v_owner uuid;
begin
  if public.actor_role() = 'admin' then return new; end if;
  select b.plan_key, b.category_id into v_plan, v_cat from public.businesses b where b.id = new.business_id;
  if tg_op = 'INSERT' and v_plan <> 'premium' then raise exception 'premium_only:timetable'; end if;
  if v_cat not in ('salon-beauty', 'gym-fitness') then raise exception 'timetable_category'; end if;
  if new.staff_id is not null then
    select s.business_id into v_owner from public.staff_members s where s.id = new.staff_id;
    if v_owner is distinct from new.business_id then raise exception 'trainer_not_owned'; end if;
  end if;
  return new;
end $$;
drop trigger if exists t_timetable_slots_1_validate on public.timetable_slots;
create trigger t_timetable_slots_1_validate before insert or update on public.timetable_slots for each row execute function public.validate_timetable_slot();

do $$
declare fn text;
begin
  foreach fn in array array[
    'validate_offer()', 'enforce_offer_limit()', 'validate_offer_item()', 'validate_flash_sale()', 'enforce_flash_limit()',
    'validate_gallery_photo()', 'enforce_gallery_limit()', 'validate_staff_member()', 'validate_staff_service()', 'validate_timetable_slot()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end $$;

alter table public.offer_items enable row level security;
alter table public.flash_sales enable row level security;
alter table public.gallery_photos enable row level security;
alter table public.staff_members enable row level security;
alter table public.staff_services enable row level security;
alter table public.timetable_slots enable row level security;

do $$
declare t text;
begin
  foreach t in array array['offer_items','flash_sales','gallery_photos','staff_members','staff_services','timetable_slots'] loop
    execute format('drop policy if exists %I on public.%I', 'admin all ' || t, t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', 'admin all ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'seller reads own ' || t, t);
    execute format('create policy %I on public.%I for select to authenticated using (business_id = public.my_business_id())', 'seller reads own ' || t, t);
  end loop;
end $$;

drop policy if exists "seller inserts own offers" on public.offers;
create policy "seller inserts own offers" on public.offers for insert to authenticated
  with check (business_id = public.my_business_id() and public.my_business_writable());
drop policy if exists "seller updates own offers" on public.offers;
create policy "seller updates own offers" on public.offers for update to authenticated
  using (business_id = public.my_business_id() and public.my_business_writable())
  with check (business_id = public.my_business_id() and public.my_business_writable());
drop policy if exists "seller deletes own offers" on public.offers;
create policy "seller deletes own offers" on public.offers for delete to authenticated
  using (business_id = public.my_business_id() and public.my_business_writable());

drop policy if exists "seller inserts own offer_items" on public.offer_items;
create policy "seller inserts own offer_items" on public.offer_items for insert to authenticated
  with check (business_id = public.my_business_id() and public.my_business_writable());
drop policy if exists "seller deletes own offer_items" on public.offer_items;
create policy "seller deletes own offer_items" on public.offer_items for delete to authenticated
  using (business_id = public.my_business_id() and public.my_business_writable());

drop policy if exists "seller inserts own flash_sales" on public.flash_sales;
create policy "seller inserts own flash_sales" on public.flash_sales for insert to authenticated
  with check (business_id = public.my_business_id() and public.my_business_writable());
drop policy if exists "seller updates own flash_sales" on public.flash_sales;
create policy "seller updates own flash_sales" on public.flash_sales for update to authenticated
  using (business_id = public.my_business_id() and public.my_business_writable())
  with check (business_id = public.my_business_id() and public.my_business_writable());
drop policy if exists "seller deletes own flash_sales" on public.flash_sales;
create policy "seller deletes own flash_sales" on public.flash_sales for delete to authenticated
  using (business_id = public.my_business_id() and public.my_business_writable());

drop policy if exists "seller updates own gallery_photos" on public.gallery_photos;
create policy "seller updates own gallery_photos" on public.gallery_photos for update to authenticated
  using (business_id = public.my_business_id() and public.my_business_writable())
  with check (business_id = public.my_business_id() and public.my_business_writable());
drop policy if exists "seller deletes own gallery_photos" on public.gallery_photos;
create policy "seller deletes own gallery_photos" on public.gallery_photos for delete to authenticated
  using (business_id = public.my_business_id() and public.my_business_writable() and deleted_at is not null);

drop policy if exists "seller inserts own staff_members" on public.staff_members;
create policy "seller inserts own staff_members" on public.staff_members for insert to authenticated
  with check (business_id = public.my_business_id() and public.my_business_writable());
drop policy if exists "seller updates own staff_members" on public.staff_members;
create policy "seller updates own staff_members" on public.staff_members for update to authenticated
  using (business_id = public.my_business_id() and public.my_business_writable())
  with check (business_id = public.my_business_id() and public.my_business_writable());
drop policy if exists "seller deletes own staff_members" on public.staff_members;
create policy "seller deletes own staff_members" on public.staff_members for delete to authenticated
  using (business_id = public.my_business_id() and public.my_business_writable());

drop policy if exists "seller inserts own staff_services" on public.staff_services;
create policy "seller inserts own staff_services" on public.staff_services for insert to authenticated
  with check (business_id = public.my_business_id() and public.my_business_writable());
drop policy if exists "seller deletes own staff_services" on public.staff_services;
create policy "seller deletes own staff_services" on public.staff_services for delete to authenticated
  using (business_id = public.my_business_id() and public.my_business_writable());

drop policy if exists "seller inserts own timetable_slots" on public.timetable_slots;
create policy "seller inserts own timetable_slots" on public.timetable_slots for insert to authenticated
  with check (business_id = public.my_business_id() and public.my_business_writable());
drop policy if exists "seller updates own timetable_slots" on public.timetable_slots;
create policy "seller updates own timetable_slots" on public.timetable_slots for update to authenticated
  using (business_id = public.my_business_id() and public.my_business_writable())
  with check (business_id = public.my_business_id() and public.my_business_writable());
drop policy if exists "seller deletes own timetable_slots" on public.timetable_slots;
create policy "seller deletes own timetable_slots" on public.timetable_slots for delete to authenticated
  using (business_id = public.my_business_id() and public.my_business_writable());

revoke all on public.offer_items, public.flash_sales, public.gallery_photos, public.staff_members, public.staff_services, public.timetable_slots from public, anon;
grant select, insert, update, delete on public.offer_items, public.flash_sales, public.gallery_photos, public.staff_members, public.staff_services, public.timetable_slots to authenticated;
grant all on public.offer_items, public.flash_sales, public.gallery_photos, public.staff_members, public.staff_services, public.timetable_slots to service_role;

create or replace function public.attach_gallery_photo(
  p_business uuid, p_path text, p_mime text, p_width integer, p_height integer, p_size bigint,
  p_caption text default null, p_pair_id uuid default null, p_pair_role text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_sort integer;
  v_id uuid;
begin
  if p_path not like p_business::text || '/gallery/%' or p_path like '%..%' then
    raise exception 'path_not_owned' using errcode = '42501';
  end if;
  select coalesce(max(g.sort) + 1, 0) into v_sort from public.gallery_photos g where g.business_id = p_business;
  insert into public.gallery_photos (business_id, path, mime, width, height, size_bytes, caption, sort, pair_id, pair_role)
  values (p_business, p_path, p_mime, p_width, p_height, p_size, nullif(trim(p_caption), ''), v_sort, p_pair_id, p_pair_role)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.attach_gallery_photo(uuid, text, text, integer, integer, bigint, text, uuid, text) from public, anon, authenticated;
grant execute on function public.attach_gallery_photo(uuid, text, text, integer, integer, bigint, text, uuid, text) to service_role;

create or replace function public.seller_reorder_gallery(p_ids uuid[]) returns integer
language plpgsql set search_path = public as $$
declare
  v_bid uuid := public.my_business_id();
  v_n integer;
begin
  if v_bid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if (select count(distinct x) from unnest(p_ids) x) <> coalesce(cardinality(p_ids), 0) then raise exception 'invalid_order'; end if;
  update public.gallery_photos g set sort = o.ord - 1
    from unnest(p_ids) with ordinality as o(id, ord)
    where g.id = o.id and g.business_id = v_bid and g.deleted_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.seller_reorder_gallery(uuid[]) from public, anon;
grant execute on function public.seller_reorder_gallery(uuid[]) to authenticated, service_role;

create or replace function public.seller_save_offer(p_id uuid, p_patch jsonb, p_items uuid[] default '{}') returns public.offers
language plpgsql set search_path = public as $$
declare
  v_bid uuid := public.my_business_id();
  v_allowed text[] := array['title','description','discount_type','discount_value','starts_at','ends_at','banner_path','active'];
  v_key text;
  v_row public.offers;
  v_item uuid;
begin
  if v_bid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if not v_key = any (v_allowed) then raise exception 'field_not_allowed:%', v_key; end if;
  end loop;
  if (select count(distinct x) from unnest(p_items) x) <> coalesce(cardinality(p_items), 0) then raise exception 'item_not_owned'; end if;
  if p_id is null then
    insert into public.offers (business_id, title, description, discount_type, discount_value, starts_at, ends_at, banner_path, active)
    values (
      v_bid,
      p_patch ->> 'title',
      p_patch ->> 'description',
      p_patch ->> 'discount_type',
      (p_patch ->> 'discount_value')::numeric,
      (p_patch ->> 'starts_at')::timestamptz,
      (p_patch ->> 'ends_at')::timestamptz,
      p_patch ->> 'banner_path',
      coalesce((p_patch ->> 'active')::boolean, true)
    ) returning * into v_row;
  else
    delete from public.offer_items where offer_id = p_id and business_id = v_bid;
    update public.offers o set
      title = case when p_patch ? 'title' then p_patch ->> 'title' else o.title end,
      description = case when p_patch ? 'description' then p_patch ->> 'description' else o.description end,
      discount_type = case when p_patch ? 'discount_type' then p_patch ->> 'discount_type' else o.discount_type end,
      discount_value = case when p_patch ? 'discount_value' then (p_patch ->> 'discount_value')::numeric else o.discount_value end,
      starts_at = case when p_patch ? 'starts_at' then (p_patch ->> 'starts_at')::timestamptz else o.starts_at end,
      ends_at = case when p_patch ? 'ends_at' then (p_patch ->> 'ends_at')::timestamptz else o.ends_at end,
      banner_path = case when p_patch ? 'banner_path' then p_patch ->> 'banner_path' else o.banner_path end,
      active = case when p_patch ? 'active' then (p_patch ->> 'active')::boolean else o.active end
    where o.id = p_id and o.business_id = v_bid
    returning * into v_row;
    if v_row.id is null then raise exception 'offer_not_found'; end if;
  end if;
  if v_row.starts_at is null or v_row.ends_at is null then raise exception 'invalid_dates'; end if;
  if v_row.discount_type is null or v_row.discount_value is null then raise exception 'invalid_discount'; end if;
  foreach v_item in array coalesce(p_items, '{}') loop
    insert into public.offer_items (offer_id, item_id, business_id) values (v_row.id, v_item, v_bid);
  end loop;
  return v_row;
end $$;
revoke all on function public.seller_save_offer(uuid, jsonb, uuid[]) from public, anon;
grant execute on function public.seller_save_offer(uuid, jsonb, uuid[]) to authenticated, service_role;

create or replace function public.seller_promo_usage() returns jsonb
language plpgsql stable set search_path = public as $$
declare
  v_bid uuid := public.my_business_id();
  v_month text := to_char(now() at time zone 'Africa/Nairobi', 'YYYY-MM');
begin
  return jsonb_build_object(
    'month', v_month,
    'activeOffers', (select count(*) from public.offers o where o.business_id = v_bid and public.is_counted_offer(o)),
    'flashMonth', (select count(*) from public.flash_sales f where f.business_id = v_bid and public.is_counted_flash(f)
                    and to_char(f.starts_at at time zone 'Africa/Nairobi', 'YYYY-MM') = v_month),
    'flashRunning', (select count(*) from public.flash_sales f where f.business_id = v_bid and public.is_counted_flash(f)
                      and f.starts_at <= now() and f.ends_at > now()),
    'galleryPhotos', (select count(*) from public.gallery_photos g where g.business_id = v_bid and public.is_counted_gallery(g))
  );
end $$;
revoke all on function public.seller_promo_usage() from public, anon;
grant execute on function public.seller_promo_usage() to authenticated, service_role;

create or replace view public.public_offers with (security_invoker = false) as
select o.id, o.business_id, b.slug as business_slug, o.title, o.description, o.discount_type, o.discount_value,
       o.starts_at, o.ends_at, o.banner_path,
       coalesce((select array_agg(oi.item_id) from public.offer_items oi where oi.offer_id = o.id), '{}'::uuid[]) as item_ids
from public.offers o
join public.businesses b on b.id = o.business_id
where b.status = 'live'
  and o.active
  and not o.hidden_by_admin and not o.removed_by_admin
  and coalesce(o.admin_status, 'ok') = 'ok'
  and (o.starts_at is null or o.starts_at <= now())
  and (o.ends_at is null or o.ends_at > now());

create or replace view public.public_flash_sales with (security_invoker = false) as
select f.id, f.business_id, b.slug as business_slug, f.item_id, i.name as item_name, i.price,
       f.discount_type, f.discount_value,
       case f.discount_type
         when 'percent' then round(i.price * (1 - f.discount_value / 100), 2)
         else i.price - f.discount_value
       end as sale_price,
       f.starts_at, f.ends_at, f.on_end
from public.flash_sales f
join public.businesses b on b.id = f.business_id
join public.items i on i.id = f.item_id
where b.status = 'live'
  and i.visible and not i.hidden_by_admin
  and public.is_counted_flash(f)
  and f.starts_at <= now() and f.ends_at > now();

create or replace view public.flash_unlisted_items with (security_invoker = false) as
select distinct f.item_id
from public.flash_sales f
where f.on_end = 'unlist'
  and f.ends_at <= now()
  and public.is_counted_flash(f)
  and not exists (
    select 1 from public.flash_sales n
    where n.item_id = f.item_id and n.ends_at > now() and public.is_counted_flash(n)
  );

create or replace view public.public_gallery_photos with (security_invoker = false) as
select g.id, g.business_id, b.slug as business_slug, g.path, g.caption, g.sort, g.pair_id, g.pair_role, g.width, g.height
from public.gallery_photos g
join public.businesses b on b.id = g.business_id
where b.status = 'live' and public.is_counted_gallery(g);

create or replace view public.public_staff with (security_invoker = false) as
select s.id, s.business_id, b.slug as business_slug, s.name, s.role, s.specialties, s.photo_path, s.sort,
       case when b.plan_key = 'premium'
            then coalesce((select array_agg(ss.item_id) from public.staff_services ss where ss.staff_id = s.id), '{}'::uuid[])
            else '{}'::uuid[] end as item_ids
from public.staff_members s
join public.businesses b on b.id = s.business_id
where b.status = 'live'
  and not s.hidden_by_admin and not s.removed_by_admin
  and coalesce(s.admin_status, 'ok') = 'ok';

create or replace view public.public_timetable with (security_invoker = false) as
select t.id, t.business_id, b.slug as business_slug, t.day_of_week, t.start_time, t.end_time, t.class_name, t.staff_id
from public.timetable_slots t
join public.businesses b on b.id = t.business_id
where b.status = 'live' and b.plan_key = 'premium'
  and not t.hidden_by_admin and not t.removed_by_admin
  and coalesce(t.admin_status, 'ok') = 'ok';

revoke all on public.public_offers, public.public_flash_sales, public.flash_unlisted_items, public.public_gallery_photos, public.public_staff, public.public_timetable from public;
grant select on public.public_offers, public.public_flash_sales, public.flash_unlisted_items, public.public_gallery_photos, public.public_staff, public.public_timetable to anon, authenticated, service_role;
