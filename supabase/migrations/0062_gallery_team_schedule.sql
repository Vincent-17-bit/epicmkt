-- 0062_gallery_team_schedule.sql
-- Gallery photos, team members (with the services they do) and the weekly class timetable (ported from s7).
-- Offers, flash sales and the QR poster are already on main, so only these three parts are added.
--
--   * Pictures are Cloudinary ids like every other shop picture: "<biz>/gallery/<uuid>" and "<biz>/staff/<uuid>".
--     media_uploads accepts the new purposes 'gallery' and 'staff'; the sweep, the claim and the delete triggers know them.
--   * Gallery photos are soft deleted first (deleted_at, so Undo works) and hard deleted afterwards.
--   * Suspended sellers can read but not write (restrictive policies, same as offer_items).
-- Re-runnable: every statement can be run twice.

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------------------------------
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

do $$
declare t text;
begin
  foreach t in array array['gallery_photos','staff_members','timetable_slots'] loop
    execute format('drop trigger if exists %I on public.%I', 't_' || t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', 't_' || t || '_touch', t);
    execute format('drop trigger if exists %I on public.%I', 't_' || t || '_protect', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.protect_admin_cols()', 't_' || t || '_protect', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.is_counted_gallery(g public.gallery_photos) returns boolean
language sql immutable as
$$ select g.deleted_at is null and coalesce(g.admin_status, 'ok') = 'ok' and not g.removed_by_admin and not g.hidden_by_admin $$;

create or replace function public.validate_gallery_photo() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_cat text;
begin
  if public.actor_role() = 'admin' then return new; end if;
  if tg_op = 'INSERT' then
    if not public.is_cloudinary_id(new.path) or new.path not like new.business_id::text || '/gallery/%' then
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
declare v_plan text; v_limit integer; v_count integer;
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
  if new.photo_path is not null and (not public.is_cloudinary_id(new.photo_path) or new.photo_path not like new.business_id::text || '/staff/%') then
    raise exception 'invalid_photo_path';
  end if;
  return new;
end $$;
drop trigger if exists t_staff_members_1_validate on public.staff_members;
create trigger t_staff_members_1_validate before insert or update on public.staff_members for each row execute function public.validate_staff_member();

create or replace function public.validate_staff_service() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_plan text; s public.staff_members; i public.items;
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
declare v_plan text; v_cat text; v_owner uuid;
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
  foreach fn in array array['validate_gallery_photo()', 'enforce_gallery_limit()', 'validate_staff_member()', 'validate_staff_service()', 'validate_timetable_slot()'] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['gallery_photos','staff_members','staff_services','timetable_slots'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'admin all ' || t, t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', 'admin all ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'seller reads own ' || t, t);
    execute format('create policy %I on public.%I for select to authenticated using (business_id = public.my_business_id())', 'seller reads own ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'seller inserts own ' || t, t);
    execute format('create policy %I on public.%I for insert to authenticated with check (business_id = public.my_business_id())', 'seller inserts own ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'seller updates own ' || t, t);
    execute format('create policy %I on public.%I for update to authenticated using (business_id = public.my_business_id()) with check (business_id = public.my_business_id())', 'seller updates own ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'seller deletes own ' || t, t);
    execute format('create policy %I on public.%I for delete to authenticated using (business_id = public.my_business_id())', 'seller deletes own ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'suspended cannot insert ' || t, t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (public.is_admin() or not public.my_business_suspended())', 'suspended cannot insert ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'suspended cannot update ' || t, t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (public.is_admin() or not public.my_business_suspended()) with check (public.is_admin() or not public.my_business_suspended())', 'suspended cannot update ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'suspended cannot delete ' || t, t);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (public.is_admin() or not public.my_business_suspended())', 'suspended cannot delete ' || t, t);
  end loop;
end $$;
-- A live photo must be soft deleted (Undo window) before the row can be removed.
drop policy if exists "seller deletes own gallery_photos" on public.gallery_photos;
create policy "seller deletes own gallery_photos" on public.gallery_photos for delete to authenticated
  using (business_id = public.my_business_id() and deleted_at is not null);

revoke all on public.gallery_photos, public.staff_members, public.staff_services, public.timetable_slots from public, anon;
grant select, insert, update, delete on public.gallery_photos, public.staff_members, public.staff_services, public.timetable_slots to authenticated;
grant all on public.gallery_photos, public.staff_members, public.staff_services, public.timetable_slots to service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- Pictures: new upload purposes, and cleanup of files nothing points at any more
-- ---------------------------------------------------------------------------------------------------------------------
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.media_uploads'::regclass and contype = 'c' and conname = 'media_uploads_purpose_ck'
  loop
    execute format('alter table public.media_uploads drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.media_uploads add constraint media_uploads_purpose_ck
  check (purpose in ('item_photo', 'item_video', 'logo', 'cover', 'gallery', 'staff'));

create or replace function public.media_register_upload(p_business uuid, p_item uuid, p_purpose text, p_public_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_purpose not in ('item_photo', 'item_video', 'logo', 'cover', 'gallery', 'staff') then raise exception 'invalid_purpose'; end if;
  if p_purpose = 'item_video' then
    if p_item is null or not exists (select 1 from public.items i where i.id = p_item and i.business_id = p_business) then raise exception 'item_not_found'; end if;
    if not public.is_storage_video_path(p_public_id) or p_public_id not like p_business::text || '/' || p_item::text || '/%' then raise exception 'path_not_owned' using errcode = '42501'; end if;
  else
    if not public.is_cloudinary_id(p_public_id) or p_public_id not like p_business::text || '/%' then raise exception 'path_not_owned' using errcode = '42501'; end if;
    if p_purpose = 'item_photo' then
      if p_item is null or not exists (select 1 from public.items i where i.id = p_item and i.business_id = p_business) then raise exception 'item_not_found'; end if;
    elsif p_item is not null then
      raise exception 'invalid_purpose';
    elsif p_purpose in ('gallery', 'staff') and p_public_id not like p_business::text || '/' || p_purpose || '/%' then
      raise exception 'path_not_owned' using errcode = '42501';
    end if;
  end if;
  insert into public.media_uploads (public_id, business_id, item_id, purpose) values (p_public_id, p_business, p_item, p_purpose);
end $$;

-- Is anything still pointing at this file? One definition for the claim, the per-seller claim and the sweep.
create or replace function public.media_in_use(p_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.item_media m where m.path = p_id)
      or exists (select 1 from public.businesses b where b.logo_path = p_id or b.cover_path = p_id)
      or exists (select 1 from public.gallery_photos g where g.path = p_id)
      or exists (select 1 from public.staff_members s where s.photo_path = p_id)
$$;
revoke all on function public.media_in_use(text) from public, anon, authenticated;
grant execute on function public.media_in_use(text) to service_role;

create or replace function public.media_gc_claim(p_limit integer default 50) returns table (public_id text)
language plpgsql security definer set search_path = public as $$
begin
  delete from public.media_gc g where g.next_try_at <= now() and public.media_in_use(g.public_id);
  return query
  update public.media_gc g set attempts = g.attempts + 1, next_try_at = now() + interval '10 minutes'
  where g.public_id in (select q.public_id from public.media_gc q where q.next_try_at <= now() order by q.next_try_at, q.queued_at limit greatest(1, least(coalesce(p_limit, 50), 100)) for update skip locked)
  returning g.public_id;
end $$;

create or replace function public.media_gc_claim_for_business(p_business uuid, p_limit integer default 20) returns table (public_id text)
language plpgsql security definer set search_path = public as $$
begin
  delete from public.media_gc g
  where g.next_try_at <= now() and g.public_id like p_business::text || '/%' and public.media_in_use(g.public_id);
  return query
  update public.media_gc g set attempts = g.attempts + 1, next_try_at = now() + interval '10 minutes'
  where g.public_id in (
    select q.public_id from public.media_gc q
    where q.next_try_at <= now() and q.public_id like p_business::text || '/%'
    order by q.next_try_at, q.queued_at
    limit greatest(1, least(coalesce(p_limit, 20), 50))
    for update skip locked)
  returning g.public_id;
end $$;

create or replace function public.media_sweep_orphans(p_grace interval default interval '1 hour') returns integer
language plpgsql security definer set search_path = public as $$
declare queued integer;
begin
  with put as (
    insert into public.media_gc (public_id, reason)
    select u.public_id, 'unattached_upload' from public.media_uploads u
    where u.created_at < now() - (case when u.purpose = 'item_video' then greatest(p_grace, interval '3 hours') else p_grace end)
      and not public.media_in_use(u.public_id)
    on conflict (public_id) do nothing
    returning 1
  )
  select count(*) into queued from put;
  delete from public.media_uploads u
  where u.created_at < now() - (case when u.purpose = 'item_video' then greatest(p_grace, interval '3 hours') else p_grace end);
  return queued;
end $$;

-- A removed gallery photo, or a staff picture that was replaced or removed, is queued in the same transaction.
create or replace function public.media_gc_from_shop_pictures() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'gallery_photos' then
    if public.is_cloudinary_id(old.path) then
      insert into public.media_gc (public_id, reason) values (old.path, 'gallery_removed') on conflict (public_id) do nothing;
    end if;
  elsif tg_op = 'DELETE' or old.photo_path is distinct from new.photo_path then
    if public.is_cloudinary_id(old.photo_path) then
      insert into public.media_gc (public_id, reason) values (old.photo_path, 'staff_photo_removed') on conflict (public_id) do nothing;
    end if;
  end if;
  return null;
end $$;
revoke all on function public.media_gc_from_shop_pictures() from public, anon, authenticated;
drop trigger if exists gallery_photos_media_gc on public.gallery_photos;
create trigger gallery_photos_media_gc after delete on public.gallery_photos for each row execute function public.media_gc_from_shop_pictures();
drop trigger if exists staff_members_media_gc on public.staff_members;
create trigger staff_members_media_gc after update of photo_path or delete on public.staff_members for each row execute function public.media_gc_from_shop_pictures();

-- A deleted business takes its gallery rows with it (cascade): queue their files too.
create or replace function public.media_gc_from_business() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    insert into public.media_gc (public_id, reason)
    select x, 'business_deleted' from unnest(array[old.logo_path, old.cover_path]) as x
    where public.is_cloudinary_id(x)
    on conflict (public_id) do nothing;
    insert into public.media_gc (public_id, reason)
    select x, 'business_deleted' from (
      select g.path as x from public.gallery_photos g where g.business_id = old.id
      union all select s.photo_path from public.staff_members s where s.business_id = old.id
    ) q where public.is_cloudinary_id(x)
    on conflict (public_id) do nothing;
    return null;
  end if;
  insert into public.media_gc (public_id, reason)
  select x, 'shop_image_replaced'
  from unnest(array[
    case when old.logo_path is distinct from new.logo_path then old.logo_path end,
    case when old.cover_path is distinct from new.cover_path then old.cover_path end
  ]) as x
  where public.is_cloudinary_id(x)
  on conflict (public_id) do nothing;
  return null;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------------------------------------------------
-- Service only: called by seller-media-finalize once Cloudinary's signature on the upload has been checked.
create or replace function public.attach_gallery_photo(
  p_business uuid, p_path text, p_mime text, p_width integer, p_height integer, p_size bigint,
  p_caption text default null, p_pair_id uuid default null, p_pair_role text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_sort integer; v_id uuid;
begin
  if not public.is_cloudinary_id(p_path) or p_path not like p_business::text || '/gallery/%' then
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

-- Service only: lets seller-media-sign say "limit reached" before the seller waits on an upload.
create or replace function public.gallery_room(p_business uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_plan text; v_limit integer; v_count integer;
begin
  select b.plan_key into v_plan from public.businesses b where b.id = p_business;
  select (case v_plan when 'premium' then g.premium else g.standard end ->> 'galleryPhotos')::integer into v_limit from public.global_limits g where g.id = 1;
  if v_limit is null then return true; end if;
  select count(*) into v_count from public.gallery_photos p where p.business_id = p_business and public.is_counted_gallery(p);
  return v_count < v_limit;
end $$;
revoke all on function public.gallery_room(uuid) from public, anon, authenticated;
grant execute on function public.gallery_room(uuid) to service_role;

create or replace function public.seller_reorder_gallery(p_ids uuid[]) returns integer
language plpgsql set search_path = public as $$
declare v_bid uuid := public.my_business_id(); v_n integer;
begin
  perform public.assert_seller_active();
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

create or replace function public.seller_gallery_usage() returns integer
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_seller_active();
  return (select count(*)::integer from public.gallery_photos p where p.business_id = public.my_business_id() and public.is_counted_gallery(p));
end $$;
revoke all on function public.seller_gallery_usage() from public, anon;
grant execute on function public.seller_gallery_usage() to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- Public views (what the shop page will read)
-- ---------------------------------------------------------------------------------------------------------------------
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
where b.status = 'live' and not s.hidden_by_admin and not s.removed_by_admin and coalesce(s.admin_status, 'ok') = 'ok';

create or replace view public.public_timetable with (security_invoker = false) as
select t.id, t.business_id, b.slug as business_slug, t.day_of_week, t.start_time, t.end_time, t.class_name, t.staff_id
from public.timetable_slots t
join public.businesses b on b.id = t.business_id
where b.status = 'live' and b.plan_key = 'premium'
  and not t.hidden_by_admin and not t.removed_by_admin and coalesce(t.admin_status, 'ok') = 'ok';

revoke all on public.public_gallery_photos, public.public_staff, public.public_timetable from public;
grant select on public.public_gallery_photos, public.public_staff, public.public_timetable to anon, authenticated, service_role;
