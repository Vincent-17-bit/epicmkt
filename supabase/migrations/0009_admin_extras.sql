-- 0009_admin_extras.sql
-- EpicMKT admin extras: 15 new tables, role-aware write policies, indexes.
--
-- Needs from earlier migrations:
--   0001  admins, is_admin(), touch_updated_at(), categories, plans, global_limits, legal_docs,
--         site_settings, applications, application_documents, application_flags, application_events
--   0004  businesses, items
-- It also re-declares the two pieces of 0008 it depends on (admins.role and has_role). Both are
-- idempotent, so this file applies cleanly whether or not 0008 has run. 0008 itself is not touched.
--
-- Policy shape on every table below:
--   select               any admin (is_admin())
--   insert/update/delete only the roles listed in the "writers" map in section 5
-- Support never writes through RLS. Support actions go through edge functions / RPCs.

-- 1. Prerequisites ---------------------------------------------------------------------------

alter table public.admins add column if not exists role text not null default 'owner'
  check (role in ('owner','reviewer','finance','support'));

create or replace function public.has_role(roles text[]) returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from public.admins a
    where a.user_id = auth.uid()
      and a.role = any(roles)
  );
$$;
revoke all on function public.has_role(text[]) from public, anon;
grant execute on function public.has_role(text[]) to authenticated, service_role;

-- 2. New tables ------------------------------------------------------------------------------

create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  body text check (char_length(body) <= 500),
  image_path text,
  link_url text,
  placement text not null default 'home_top'
    check (placement in ('home_top','home_middle','category','search','seller_portal')),
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  sort integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);

create table if not exists public.site_announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null check (char_length(message) between 1 and 280),
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  audience text not null default 'all' check (audience in ('all','buyers','sellers')),
  link_url text,
  dismissible boolean not null default true,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);

create table if not exists public.search_synonyms (
  id uuid primary key default gen_random_uuid(),
  term text not null unique check (term = lower(btrim(term)) and char_length(term) between 1 and 60),
  synonyms text[] not null check (cardinality(synonyms) between 1 and 20),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.blocked_terms (
  id uuid primary key default gen_random_uuid(),
  term text not null check (term = lower(btrim(term)) and char_length(term) between 2 and 60),
  scope text not null default 'all'
    check (scope in ('all','business_name','item','faq','description','search')),
  action text not null default 'block' check (action in ('block','flag')),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (term, scope)
);

create table if not exists public.towns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,80}$'),
  county text not null,
  lat double precision,
  lng double precision,
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (county, name)
);

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9-]{3,20}$'),
  full_name text not null check (char_length(full_name) between 2 and 100),
  phone text not null,
  email text,
  town_id uuid references public.towns(id) on delete set null,
  status text not null default 'active' check (status in ('active','paused','ended')),
  commission_pct numeric(5,2) not null default 0 check (commission_pct between 0 and 100),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 100),
  phone text,
  email text,
  business_name text,
  category_id text references public.categories(id) on delete set null,
  town_id uuid references public.towns(id) on delete set null,
  source text not null default 'web'
    check (source in ('web','agent','whatsapp','referral','walk_in','other')),
  agent_id uuid references public.agents(id) on delete set null,
  status text not null default 'new'
    check (status in ('new','contacted','qualified','converted','lost')),
  assigned_to uuid references auth.users(id) on delete set null,
  application_id uuid references public.applications(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (phone is not null or email is not null)
);

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,24}$'),
  description text,
  discount_type text not null check (discount_type in ('percent','amount','free_months')),
  discount_value integer not null check (discount_value > 0),
  plan_key text check (plan_key in ('standard','premium')),
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  redeemed_count integer not null default 0 check (redeemed_count >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount_type <> 'percent' or discount_value <= 100),
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);

create table if not exists public.data_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('export','deletion','correction','other')),
  requester_name text not null,
  requester_email text,
  requester_phone text,
  business_id uuid references public.businesses(id) on delete set null,
  status text not null default 'received'
    check (status in ('received','verifying','in_progress','completed','rejected')),
  due_at timestamptz not null default now() + interval '30 days',
  handled_by uuid references auth.users(id) on delete set null,
  resolution_note text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_email is not null or requester_phone is not null)
);

create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null
    check (scope in ('applications','businesses','items','payments','flags','reports','messages')),
  name text not null check (char_length(name) between 1 and 60),
  filters jsonb not null default '{}',
  sort jsonb not null default '{}',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, scope, name)
);

create table if not exists public.admin_sessions_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  event text not null
    check (event in ('login','logout','failed_login','password_change','role_change')),
  ip text,
  user_agent text,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  storage_path text not null,
  alt text check (char_length(alt) <= 160),
  caption text check (char_length(caption) <= 200),
  sort integer not null default 0,
  visible boolean not null default true,
  admin_status text not null default 'ok' check (admin_status in ('ok','hidden','removed')),
  admin_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  role_title text check (char_length(role_title) <= 80),
  bio text check (char_length(bio) <= 300),
  photo_path text,
  sort integer not null default 0,
  visible boolean not null default true,
  admin_status text not null default 'ok' check (admin_status in ('ok','hidden','removed')),
  admin_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.timetable_slots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  title text not null check (char_length(title) between 1 and 100),
  starts_at time not null,
  ends_at time not null,
  staff_member_id uuid references public.staff_members(id) on delete set null,
  capacity integer check (capacity is null or capacity > 0),
  visible boolean not null default true,
  admin_status text not null default 'ok' check (admin_status in ('ok','hidden','removed')),
  admin_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.flash_sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  item_id uuid references public.items(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  discount_type text not null check (discount_type in ('percent','amount')),
  discount_value integer not null check (discount_value > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  max_quantity integer check (max_quantity is null or max_quantity > 0),
  active boolean not null default true,
  admin_status text not null default 'ok' check (admin_status in ('ok','hidden','removed')),
  admin_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (discount_type <> 'percent' or discount_value <= 100)
);

-- 3. Indexes (columns the admin screens filter and sort by) ----------------------------------

create index if not exists banners_active_idx on public.banners (active, placement, sort);
create index if not exists site_announcements_active_idx on public.site_announcements (active, starts_at desc);
create index if not exists towns_active_idx on public.towns (active, county, sort);
create index if not exists agents_status_idx on public.agents (status, full_name);
create index if not exists agents_town_idx on public.agents (town_id);
create index if not exists leads_status_idx on public.leads (status, created_at desc);
create index if not exists leads_agent_idx on public.leads (agent_id);
create index if not exists leads_phone_idx on public.leads (phone);
create index if not exists coupons_active_idx on public.coupons (active, ends_at);
create index if not exists data_requests_status_idx on public.data_requests (status, due_at);
create index if not exists data_requests_business_idx on public.data_requests (business_id);
create index if not exists admin_sessions_user_idx on public.admin_sessions_log (user_id, created_at desc);
create index if not exists admin_sessions_created_idx on public.admin_sessions_log (created_at desc);
create index if not exists gallery_photos_business_idx on public.gallery_photos (business_id, sort);
create index if not exists staff_members_business_idx on public.staff_members (business_id, sort);
create index if not exists timetable_slots_business_idx on public.timetable_slots (business_id, weekday, starts_at);
create index if not exists flash_sales_business_idx on public.flash_sales (business_id, starts_at desc);
create index if not exists flash_sales_active_idx on public.flash_sales (active, ends_at);

-- moderation queue: only rows an admin has hidden or removed
create index if not exists gallery_photos_moderation_idx on public.gallery_photos (created_at desc) where admin_status <> 'ok';
create index if not exists staff_members_moderation_idx on public.staff_members (created_at desc) where admin_status <> 'ok';
create index if not exists timetable_slots_moderation_idx on public.timetable_slots (created_at desc) where admin_status <> 'ok';
create index if not exists flash_sales_moderation_idx on public.flash_sales (created_at desc) where admin_status <> 'ok';

-- existing tables the admin review screens read by these columns
create index if not exists application_events_app_idx on public.application_events (application_id, created_at desc);
create index if not exists applications_category_idx on public.applications (category_id);

-- 4. Retire the blanket admin write policies --------------------------------------------------
-- 0001 created "admin all <x>" (for all, is_admin()). 0008 intended "admin role <x>" but cannot apply.
-- Dropping every policy with either prefix on the nine tables makes this safe in both situations.

do $$
declare
  r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('categories','plans','global_limits','legal_docs','site_settings',
                        'applications','application_documents','application_flags','application_events')
      and (policyname like 'admin all %' or policyname like 'admin role %')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- 5. RLS, grants, updated_at triggers and role-aware policies ---------------------------------
-- "writers" is the one place that says which roles may write which table.

do $$
declare
  writers jsonb := '{
    "categories":            ["owner"],
    "plans":                 ["owner"],
    "global_limits":         ["owner"],
    "legal_docs":            ["owner"],
    "site_settings":         ["owner"],
    "applications":          ["owner","reviewer"],
    "application_documents": ["owner","reviewer"],
    "application_flags":     ["owner","reviewer"],
    "application_events":    ["owner","reviewer"],
    "banners":               ["owner"],
    "site_announcements":    ["owner"],
    "towns":                 ["owner"],
    "agents":                ["owner"],
    "data_requests":         ["owner"],
    "admin_sessions_log":    ["owner"],
    "coupons":               ["owner","finance"],
    "search_synonyms":       ["owner","reviewer"],
    "blocked_terms":         ["owner","reviewer"],
    "leads":                 ["owner","reviewer"],
    "gallery_photos":        ["owner","reviewer"],
    "staff_members":         ["owner","reviewer"],
    "timetable_slots":       ["owner","reviewer"],
    "flash_sales":           ["owner","reviewer"],
    "saved_views":           ["owner","reviewer","finance"]
  }';
  older text[] := array['categories','plans','global_limits','legal_docs','site_settings',
                        'applications','application_documents','application_flags','application_events'];
  t text;
  roles text[];
  own_rows text;
begin
  for t, roles in
    select key, array(select jsonb_array_elements_text(value)) from jsonb_each(writers)
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);

    if t <> all(older) then
      execute format('revoke all on public.%I from public, anon', t);
      if exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = t and column_name = 'updated_at') then
        execute format('drop trigger if exists %I on public.%I', 't_' || t || '_touch', t);
        execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()',
                       't_' || t || '_touch', t);
      end if;
    end if;

    -- saved views are personal: a writer may only touch their own rows
    own_rows := case when t = 'saved_views' then ' and user_id = auth.uid()' else '' end;

    execute format('drop policy if exists %I on public.%I', 'admin select ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'admin insert ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'admin update ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'admin delete ' || t, t);

    execute format('create policy %I on public.%I for select to authenticated using (public.is_admin())',
                   'admin select ' || t, t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.has_role(%L::text[])%s)',
                   'admin insert ' || t, t, roles, own_rows);
    execute format('create policy %I on public.%I for update to authenticated using (public.has_role(%L::text[])%s) with check (public.has_role(%L::text[])%s)',
                   'admin update ' || t, t, roles, own_rows, roles, own_rows);
    execute format('create policy %I on public.%I for delete to authenticated using (public.has_role(%L::text[])%s)',
                   'admin delete ' || t, t, roles, own_rows);
  end loop;
end $$;
