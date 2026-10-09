create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  seller_id text not null unique,
  user_id uuid unique references auth.users(id) on delete set null,
  application_id uuid references public.applications(id) on delete set null,
  slug text not null unique,
  name text not null check (char_length(name) between 2 and 100),
  category_id text not null references public.categories(id),
  plan_key text not null default 'standard' check (plan_key in ('standard','premium')),
  status text not null default 'pending' check (status in ('pending','live','paused','suspended','expired','deleted')),
  verification_level text not null default 'unverified' check (verification_level in ('unverified','verified')),
  featured boolean not null default false,
  paid_until timestamptz,
  tagline text,
  description text,
  phone text not null,
  whatsapp text,
  email text,
  socials jsonb not null default '{}',
  amenities jsonb not null default '[]',
  payment_methods jsonb not null default '[]',
  delivery_area text,
  county text,
  town text,
  address text,
  lat double precision,
  lng double precision,
  pin text,
  licence text,
  logo_path text,
  cover_path text,
  tags text[] not null default '{}',
  announcement text,
  profile jsonb not null default '{}',
  hours jsonb not null default '{}',
  exceptions jsonb not null default '[]',
  override jsonb,
  partial_closures jsonb not null default '[]',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists businesses_status_idx on public.businesses (status);
create index if not exists businesses_category_idx on public.businesses (category_id);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  description text,
  section text,
  price numeric(12,2) check (price >= 0),
  price_max numeric(12,2) check (price_max >= 0),
  price_type text not null default 'fixed' check (price_type in ('fixed','from','range','free','contact')),
  unit text,
  sale_price numeric(12,2) check (sale_price >= 0),
  availability text not null default 'available' check (availability in ('available','limited_stock','out_of_stock','unavailable')),
  stock_count integer check (stock_count >= 0),
  visible boolean not null default true,
  sort integer not null default 0,
  hidden_by_admin boolean not null default false,
  admin_hide_reason text,
  admin_status text,
  admin_reason text,
  removed_by_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists items_business_idx on public.items (business_id, sort);

create table if not exists public.item_media (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  kind text not null check (kind in ('image','video')),
  path text not null unique,
  mime text not null,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists item_media_item_idx on public.item_media (item_id, kind);

create table if not exists public.faqs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  question text not null check (char_length(question) between 3 and 200),
  answer text not null check (char_length(answer) between 1 and 1000),
  sort integer not null default 0,
  hidden_by_admin boolean not null default false,
  admin_hide_reason text,
  admin_status text,
  admin_reason text,
  removed_by_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists faqs_business_idx on public.faqs (business_id, sort);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  description text,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  hidden_by_admin boolean not null default false,
  admin_hide_reason text,
  admin_status text,
  admin_reason text,
  removed_by_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists offers_business_idx on public.offers (business_id, active);

create table if not exists public.flags (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  item_id uuid references public.items(id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 500),
  status text not null default 'open' check (status in ('open','replied','resolved')),
  seller_reply text,
  replied_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists flags_business_idx on public.flags (business_id, status);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  item_id uuid references public.items(id) on delete set null,
  reason text not null,
  details text check (char_length(details) <= 1000),
  reporter_hash text,
  status text not null default 'open' check (status in ('open','reviewed','dismissed')),
  created_at timestamptz not null default now()
);
create index if not exists reports_business_idx on public.reports (business_id, created_at desc);
create index if not exists reports_item_idx on public.reports (item_id);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  amount_kes integer not null check (amount_kes >= 0),
  method text not null default 'mpesa',
  reference text,
  period_start date,
  period_end date,
  recorded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists payments_business_idx on public.payments (business_id, created_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  subject text not null check (char_length(subject) between 1 and 150),
  body text not null check (char_length(body) between 1 and 4000),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists messages_business_idx on public.messages (business_id, created_at desc);

create table if not exists public.change_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  field text not null check (field in ('name','category_id','phone','town','pin','licence')),
  old_value text,
  new_value text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  admin_note text,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists change_requests_one_pending on public.change_requests (business_id, field) where status = 'pending';
create index if not exists change_requests_business_idx on public.change_requests (business_id, created_at desc);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  business_id uuid references public.businesses(id) on delete set null,
  actor_id uuid,
  actor_role text not null check (actor_role in ('seller','admin','system')),
  action text not null,
  entity text,
  entity_id text,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists audit_log_business_idx on public.audit_log (business_id, created_at desc);

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  business_id uuid references public.businesses(id) on delete cascade,
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists admin_notifications_open_idx on public.admin_notifications (created_at desc) where read_at is null;

drop trigger if exists t_businesses_touch on public.businesses;
create trigger t_businesses_touch before update on public.businesses for each row execute function public.touch_updated_at();
drop trigger if exists t_items_touch on public.items;
create trigger t_items_touch before update on public.items for each row execute function public.touch_updated_at();
drop trigger if exists t_faqs_touch on public.faqs;
create trigger t_faqs_touch before update on public.faqs for each row execute function public.touch_updated_at();
drop trigger if exists t_offers_touch on public.offers;
create trigger t_offers_touch before update on public.offers for each row execute function public.touch_updated_at();

alter table public.businesses enable row level security;
alter table public.items enable row level security;
alter table public.item_media enable row level security;
alter table public.faqs enable row level security;
alter table public.offers enable row level security;
alter table public.flags enable row level security;
alter table public.reports enable row level security;
alter table public.payments enable row level security;
alter table public.messages enable row level security;
alter table public.change_requests enable row level security;
alter table public.audit_log enable row level security;
alter table public.admin_notifications enable row level security;

create or replace function public.my_business_id() returns uuid
language sql stable security definer set search_path = public as
$$ select b.id from public.businesses b where b.user_id = auth.uid() and b.status <> 'deleted' limit 1 $$;
revoke all on function public.my_business_id() from public, anon;
grant execute on function public.my_business_id() to authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array['businesses','items','item_media','faqs','offers','flags','reports','payments','messages','change_requests','audit_log','admin_notifications'] loop
    execute format('drop policy if exists %I on public.%I', 'admin all ' || t, t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', 'admin all ' || t, t);
  end loop;
end $$;

drop policy if exists "seller reads own business" on public.businesses;
create policy "seller reads own business" on public.businesses for select to authenticated using (id = public.my_business_id());

drop policy if exists "seller reads own items" on public.items;
create policy "seller reads own items" on public.items for select to authenticated using (business_id = public.my_business_id());
drop policy if exists "seller inserts own items" on public.items;
create policy "seller inserts own items" on public.items for insert to authenticated with check (business_id = public.my_business_id());
drop policy if exists "seller updates own items" on public.items;
create policy "seller updates own items" on public.items for update to authenticated using (business_id = public.my_business_id()) with check (business_id = public.my_business_id());
drop policy if exists "seller deletes own items" on public.items;
create policy "seller deletes own items" on public.items for delete to authenticated using (business_id = public.my_business_id());

drop policy if exists "seller reads own media" on public.item_media;
create policy "seller reads own media" on public.item_media for select to authenticated using (business_id = public.my_business_id());
drop policy if exists "seller deletes own media" on public.item_media;
create policy "seller deletes own media" on public.item_media for delete to authenticated using (business_id = public.my_business_id());

drop policy if exists "seller reads own faqs" on public.faqs;
create policy "seller reads own faqs" on public.faqs for select to authenticated using (business_id = public.my_business_id());
drop policy if exists "seller inserts own faqs" on public.faqs;
create policy "seller inserts own faqs" on public.faqs for insert to authenticated with check (business_id = public.my_business_id());
drop policy if exists "seller updates own faqs" on public.faqs;
create policy "seller updates own faqs" on public.faqs for update to authenticated using (business_id = public.my_business_id()) with check (business_id = public.my_business_id());
drop policy if exists "seller deletes own faqs" on public.faqs;
create policy "seller deletes own faqs" on public.faqs for delete to authenticated using (business_id = public.my_business_id());

drop policy if exists "seller reads own offers" on public.offers;
create policy "seller reads own offers" on public.offers for select to authenticated using (business_id = public.my_business_id());
drop policy if exists "seller inserts own offers" on public.offers;
create policy "seller inserts own offers" on public.offers for insert to authenticated with check (business_id = public.my_business_id());
drop policy if exists "seller updates own offers" on public.offers;
create policy "seller updates own offers" on public.offers for update to authenticated using (business_id = public.my_business_id()) with check (business_id = public.my_business_id());
drop policy if exists "seller deletes own offers" on public.offers;
create policy "seller deletes own offers" on public.offers for delete to authenticated using (business_id = public.my_business_id());

drop policy if exists "seller reads own flags" on public.flags;
create policy "seller reads own flags" on public.flags for select to authenticated using (business_id = public.my_business_id());
drop policy if exists "seller reads own payments" on public.payments;
create policy "seller reads own payments" on public.payments for select to authenticated using (business_id = public.my_business_id());
drop policy if exists "seller reads own messages" on public.messages;
create policy "seller reads own messages" on public.messages for select to authenticated using (business_id = public.my_business_id());
drop policy if exists "seller reads own change requests" on public.change_requests;
create policy "seller reads own change requests" on public.change_requests for select to authenticated using (business_id = public.my_business_id());

grant select, insert, update, delete on
  public.businesses, public.items, public.item_media, public.faqs, public.offers, public.flags, public.reports,
  public.payments, public.messages, public.change_requests, public.audit_log, public.admin_notifications
to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
