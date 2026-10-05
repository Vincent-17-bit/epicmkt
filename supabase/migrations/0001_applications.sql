create extension if not exists pgcrypto;

create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.admins a where a.user_id = auth.uid()) $$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create or replace function public.generate_reference_no() returns text
language plpgsql as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := gen_random_bytes(6);
  result text := '';
  i int;
begin
  for i in 0..5 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return 'EPM-' || to_char(now() at time zone 'Africa/Nairobi', 'YYYY') || '-' || result;
end $$;

create table public.rate_limits (
  key text primary key,
  count int not null default 0,
  window_start timestamptz not null default now()
);
alter table public.rate_limits enable row level security;

create or replace function public.hit_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare r public.rate_limits;
begin
  insert into public.rate_limits as rl (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update set
    count = case when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1 else rl.count + 1 end,
    window_start = case when rl.window_start < now() - make_interval(secs => p_window_seconds) then now() else rl.window_start end
  returning * into r;
  return r.count <= p_max;
end $$;
revoke all on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;

create table public.categories (
  id text primary key check (id ~ '^[a-z0-9-]{2,50}$'),
  name text not null,
  grp text not null,
  icon text not null default 'store',
  tier text not null check (tier in ('A','B','C','D')),
  sort int not null default 0,
  active boolean not null default true,
  template jsonb not null default '[]',
  extra_docs jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plans (
  category_id text not null references public.categories(id) on delete cascade,
  plan_key text not null check (plan_key in ('standard','premium')),
  price_kes integer not null check (price_kes between 0 and 100000),
  items_limit integer not null check (items_limit >= 0),
  top_benefits jsonb not null check (jsonb_typeof(top_benefits) = 'array' and jsonb_array_length(top_benefits) = 3),
  features jsonb not null default '{}',
  badge text check (badge in ('Best value','Popular')),
  updated_at timestamptz not null default now(),
  primary key (category_id, plan_key)
);

create table public.global_limits (
  id int primary key default 1 check (id = 1),
  standard jsonb not null,
  premium jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.legal_docs (
  key text primary key check (key in ('terms','privacy')),
  version text not null,
  title text not null,
  body text not null,
  key_points jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

create table public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.global_limits (id, standard, premium) values (
  1,
  '{"photosPerItem":7,"videosPerItem":1,"galleryPhotos":5,"faqs":5,"activeOffers":8,"flashSalesPerMonth":3,"flashSalesConcurrent":1}',
  '{"photosPerItem":15,"videosPerItem":3,"galleryPhotos":20,"faqs":20,"activeOffers":null,"flashSalesPerMonth":10,"flashSalesConcurrent":5}'
) on conflict (id) do nothing;

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  reference_no text not null unique default public.generate_reference_no(),
  status text not null default 'uploading' check (status in
    ('uploading','submitted','under_review','changes_requested','approved','payment_confirming','activated','rejected')),
  verification_level text not null default 'unverified' check (verification_level in ('unverified','verified')),
  completeness_hint text check (completeness_hint in ('complete','basic')),

  category_id text not null references public.categories(id),
  plan_key text not null check (plan_key in ('standard','premium')),
  price_at_submission integer not null,
  plan_snapshot jsonb not null,

  owner_full_name text not null,
  owner_id_type text not null check (owner_id_type in ('national_id','passport')),
  owner_id_number text not null,
  phone text not null,
  alt_phone text,
  email text not null,

  business_name text not null,
  registered boolean not null,
  reg_type text check (reg_type in ('sole_proprietor','partnership','limited_company')),
  reg_number text,
  year_established int not null,
  kra_pin text,
  sbp_number text not null,
  sbp_expiry date not null,
  short_description text,
  template_values jsonb not null default '{}',
  conditional_docs jsonb not null default '{}',

  county text not null,
  town text not null,
  address text not null,
  lat double precision not null,
  lng double precision not null,
  business_phones jsonb not null default '[]',
  whatsapp text not null,
  website text,
  socials jsonb not null default '{}',

  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default now(),
  authorised boolean not null check (authorised),

  admin_note text,
  rejection_reason text,
  payment_code text,
  seller_id text unique,

  finalize_token_hash text,
  ip_hash text,
  user_agent text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index applications_status_idx on public.applications (status, submitted_at desc);
create index applications_phone_idx on public.applications (phone);

create table public.application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  slot_key text not null,
  storage_path text not null unique,
  original_name text not null,
  mime text not null,
  size_bytes integer not null,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (application_id, slot_key)
);

create table public.application_flags (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  path text not null,
  message text not null check (char_length(message) between 3 and 500),
  severity text not null default 'must_fix',
  status text not null default 'open' check (status in ('open','fixed','confirmed')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.application_events (
  id bigint generated always as identity primary key,
  application_id uuid references public.applications(id) on delete cascade,
  actor text not null check (actor in ('seller','admin','system')),
  type text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.otp_requests (
  id uuid primary key default gen_random_uuid(),
  reference_no text not null,
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  used boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.status_sessions (
  token_hash text primary key,
  application_id uuid not null references public.applications(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create trigger t_categories_touch before update on public.categories for each row execute function public.touch_updated_at();
create trigger t_plans_touch before update on public.plans for each row execute function public.touch_updated_at();
create trigger t_global_limits_touch before update on public.global_limits for each row execute function public.touch_updated_at();
create trigger t_legal_touch before update on public.legal_docs for each row execute function public.touch_updated_at();
create trigger t_applications_touch before update on public.applications for each row execute function public.touch_updated_at();

alter table public.categories enable row level security;
alter table public.plans enable row level security;
alter table public.global_limits enable row level security;
alter table public.legal_docs enable row level security;
alter table public.site_settings enable row level security;
alter table public.applications enable row level security;
alter table public.application_documents enable row level security;
alter table public.application_flags enable row level security;
alter table public.application_events enable row level security;
alter table public.otp_requests enable row level security;
alter table public.status_sessions enable row level security;

create policy "public read active categories" on public.categories
  for select to anon, authenticated using (active);
create policy "public read plans" on public.plans
  for select to anon, authenticated
  using (exists (select 1 from public.categories c where c.id = category_id and c.active));
create policy "public read global limits" on public.global_limits
  for select to anon, authenticated using (true);
create policy "public read legal docs" on public.legal_docs
  for select to anon, authenticated using (true);

create policy "admin all categories" on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all plans" on public.plans for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all global limits" on public.global_limits for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all legal docs" on public.legal_docs for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all settings" on public.site_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all applications" on public.applications for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all documents" on public.application_documents for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all flags" on public.application_flags for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all events" on public.application_events for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('applications', 'applications', false, 10485760,
        array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "admin read application files" on storage.objects
  for select to authenticated
  using (bucket_id = 'applications' and public.is_admin());
