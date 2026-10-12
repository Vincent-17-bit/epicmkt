create extension if not exists pg_trgm;

alter table public.admins add column if not exists role text not null default 'owner'
  check (role in ('owner','reviewer','finance','support'));
alter table public.admins add column if not exists email text;
alter table public.admins add column if not exists display_name text;

create or replace function public.has_role(roles text[]) returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from public.admins a
    where a.user_id = auth.uid()
      and a.role = any(roles)
  );
$$;

create or replace function public.nairobi_today() returns date
language sql stable as $$
  select (now() at time zone 'Africa/Nairobi')::date;
$$;

create or replace function public.grace_days() returns int
language sql stable security definer set search_path = public as
$$
  select coalesce((select (value #>> '{}')::int from public.site_settings where key = 'grace_days'), 1);
$$;

alter table public.applications add column if not exists reviewer_id uuid references auth.users(id);
alter table public.applications add column if not exists review_started_at timestamptz;

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_email text,
  action text not null,
  target_type text,
  target_id uuid,
  before jsonb,
  after jsonb,
  reason text,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists audit_target_idx on public.audit_log (target_type, target_id, created_at desc);
alter table public.audit_log enable row level security;
create policy if not exists "admin read audit" on public.audit_log for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.audit_log from public, anon, authenticated;

create or replace function public.audit_log_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end $$;

drop trigger if exists t_audit_no_update on public.audit_log;
create trigger t_audit_no_update before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();

create or replace function public.write_audit(p_action text, p_target_type text, p_target_id uuid,
  p_before jsonb, p_after jsonb, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.audit_log(actor_id, actor_email, action, target_type, target_id, before, after, reason)
  values (auth.uid(), (select email from auth.users where id = auth.uid()), p_action, p_target_type, p_target_id, p_before, p_after, p_reason);
end $$;
revoke all on function public.write_audit(text, text, uuid, jsonb, jsonb, text) from public, anon;
grant execute on function public.write_audit(text, text, uuid, jsonb, jsonb, text) to authenticated;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  application_id uuid unique references public.applications(id),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  seller_id text not null unique,
  owner_user_id uuid unique references auth.users(id) on delete set null,
  owner_name text not null,
  category_id text not null references public.categories(id),
  plan_key text not null check (plan_key in ('standard','premium')),
  monthly_price integer not null,
  name text not null,
  tagline text,
  description text,
  status text not null default 'live' check (status in ('live','paused','suspended','unlisted','deleted')),
  status_reason text,
  paid_until date,
  verification_level text not null default 'unverified' check (verification_level in ('unverified','verified')),
  featured boolean not null default false,
  featured_until timestamptz,
  featured_rank int,
  strikes int not null default 0,
  tags text[] not null default '{}',
  phone text not null,
  whatsapp text,
  email text,
  county text, town text, address text,
  lat double precision, lng double precision,
  logo_path text, cover_path text,
  hours jsonb not null default '{}',
  exceptions jsonb not null default '[]',
  override jsonb,
  partial_closures jsonb not null default '[]',
  socials jsonb not null default '{}',
  amenities jsonb not null default '[]',
  payment_methods jsonb not null default '[]',
  delivery_area text,
  announcement text,
  profile jsonb not null default '{}',
  must_change_password boolean not null default true,
  first_paid_at timestamptz,
  last_login_at timestamptz,
  last_edit_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists businesses_name_trgm on public.businesses using gin (name gin_trgm_ops);
create index if not exists businesses_phone_idx on public.businesses (phone);
create index if not exists businesses_status_paid_idx on public.businesses (status, paid_until);
create index if not exists businesses_category_town_idx on public.businesses (category_id, town);

create or replace function public.business_is_visible(b public.businesses) returns boolean
language sql stable as $$
  select b.status = 'live'
    and b.deleted_at is null
    and b.paid_until is not null
    and public.nairobi_today() <= b.paid_until + public.grace_days();
$$;

create or replace function public.owns_business(bid uuid) returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from public.businesses
    where id = bid and owner_user_id = auth.uid() and deleted_at is null
  );
$$;

create trigger if not exists t_businesses_touch before update on public.businesses
  for each row execute function public.touch_updated_at();

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  item_type text not null default 'product' check (item_type in ('product','service','package','class')),
  section text,
  short_description text,
  description text,
  price_type text not null default 'fixed' check (price_type in ('fixed','from','range','free','contact')),
  price integer,
  price_max integer,
  unit text,
  sale_price integer,
  sale_starts date,
  sale_ends date,
  availability text not null default 'available'
    check (availability in ('available','limited_stock','out_of_stock','seasonal','by_appointment','coming_soon')),
  stock_count integer check (stock_count is null or stock_count >= 0),
  badge text check (badge in ('Popular','New','Best value')),
  tags text[] not null default '{}',
  variants jsonb not null default '[]',
  specs jsonb not null default '{}',
  extra jsonb not null default '{}',
  sort int not null default 0,
  visible boolean not null default true,
  hidden_by_admin boolean not null default false,
  admin_hide_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists items_name_trgm on public.items using gin (name gin_trgm_ops);
create index if not exists items_business_idx on public.items (business_id, sort);
create index if not exists items_tags_idx on public.items using gin (tags);
create trigger if not exists t_items_touch before update on public.items for each row execute function public.touch_updated_at();

create table if not exists public.item_media (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  kind text not null check (kind in ('image','video')),
  storage_path text not null,
  poster_path text,
  alt text,
  sort int not null default 0,
  status text not null default 'ready' check (status in ('processing','ready','failed')),
  removed_by_admin boolean not null default false,
  admin_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.faqs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  question text not null check (char_length(question) <= 120),
  answer text not null check (char_length(answer) <= 500),
  sort int not null default 0,
  visible boolean not null default true,
  admin_status text not null default 'ok' check (admin_status in ('ok','hidden','removed')),
  admin_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists faqs_business_idx on public.faqs (business_id, sort);
create trigger if not exists t_faqs_touch before update on public.faqs for each row execute function public.touch_updated_at();

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null,
  description text,
  discount_type text not null check (discount_type in ('percent','amount')),
  discount_value integer not null check (discount_value > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  item_ids uuid[] not null default '{}',
  admin_status text not null default 'ok' check (admin_status in ('ok','hidden','removed')),
  admin_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.flags (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('business','item','faq','media','offer','application')),
  target_id uuid not null,
  business_id uuid references public.businesses(id) on delete cascade,
  reason text not null,
  severity text not null default 'medium' check (severity in ('low','medium','high')),
  status text not null default 'open' check (status in ('open','investigating','resolved','dismissed')),
  note text,
  seller_message text,
  seller_due_at timestamptz,
  seller_reply text,
  seller_replied_at timestamptz,
  assigned_to uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists flags_open_idx on public.flags (status, created_at desc);
create index if not exists flags_business_idx on public.flags (business_id, status);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  item_id uuid references public.items(id) on delete set null,
  report_type text not null check (report_type in ('wrong_price','closed_but_listed_open','fake','offensive','other')),
  details text check (char_length(details) <= 500),
  reporter_hash text,
  status text not null default 'open' check (status in ('open','investigating','resolved','dismissed')),
  assigned_to uuid references auth.users(id),
  admin_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists reports_open_idx on public.reports (status, created_at desc);

create sequence if not exists public.receipt_seq start 1000;
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete set null,
  application_id uuid references public.applications(id) on delete set null,
  amount integer not null check (amount >= 0),
  plan_key text not null check (plan_key in ('standard','premium')),
  months int not null default 1 check (months between 1 and 24),
  mpesa_code text,
  phone text,
  status text not null default 'submitted' check (status in ('submitted','confirmed','rejected','refunded')),
  period_start date,
  period_end date,
  submitted_at timestamptz not null default now(),
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  receipt_no text unique,
  notes text,
  reject_reason text
);
create index if not exists payments_code_idx on public.payments (mpesa_code);
create index if not exists payments_status_idx on public.payments (status, submitted_at desc);

create table if not exists public.message_templates (
  key text primary key,
  channel text not null check (channel in ('sms','email','in_app')),
  subject text,
  body_en text not null,
  body_sw text,
  version int not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.applications(id) on delete set null,
  business_id uuid references public.businesses(id) on delete set null,
  channel text not null check (channel in ('sms','email','in_app','whatsapp_link')),
  template_key text,
  to_address text,
  subject text,
  body text not null,
  status text not null default 'queued' check (status in ('queued','sent','delivered','failed')),
  provider_id text,
  cost_kes numeric(8,2),
  error text,
  attempts int not null default 0,
  transactional boolean not null default true,
  dedupe_key text unique,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists messages_queue_idx on public.messages (status, scheduled_at);

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  title text not null,
  body text,
  link text,
  read_by uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.site_config (
  key text primary key,
  value jsonb not null,
  version int not null default 1,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
create table if not exists public.content_pages (
  slug text primary key,
  title text not null,
  body_md text not null,
  published boolean not null default true,
  version int not null default 1,
  seo_title text,
  seo_description text,
  updated_at timestamptz not null default now()
);
create table if not exists public.change_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  field_path text not null,
  old_value jsonb,
  new_value jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reason text,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;
alter table public.plans enable row level security;
alter table public.global_limits enable row level security;
alter table public.legal_docs enable row level security;
alter table public.site_settings enable row level security;
alter table public.applications enable row level security;
alter table public.application_documents enable row level security;
alter table public.application_flags enable row level security;
alter table public.application_events enable row level security;

alter table public.businesses enable row level security;
alter table public.items enable row level security;
alter table public.item_media enable row level security;
alter table public.faqs enable row level security;
alter table public.offers enable row level security;
alter table public.flags enable row level security;
alter table public.reports enable row level security;
alter table public.payments enable row level security;
alter table public.message_templates enable row level security;
alter table public.messages enable row level security;
alter table public.admin_notifications enable row level security;
alter table public.site_config enable row level security;
alter table public.content_pages enable row level security;
alter table public.change_requests enable row level security;

create policy if not exists "public read active categories" on public.categories for select to anon, authenticated using (active);
create policy if not exists "public read plans" on public.plans for select to anon, authenticated
  using (exists (select 1 from public.categories c where c.id = category_id and c.active));
create policy if not exists "public read global limits" on public.global_limits for select to anon, authenticated using (true);
create policy if not exists "public read legal docs" on public.legal_docs for select to anon, authenticated using (true);
create policy if not exists "public read visible businesses" on public.businesses for select to anon, authenticated using (public.business_is_visible(businesses));
create policy if not exists "public read visible items" on public.items for select to anon, authenticated using (
  visible and not hidden_by_admin and exists (
    select 1 from public.businesses b where b.id = business_id and public.business_is_visible(b)
  )
);
create policy if not exists "public read visible media" on public.item_media for select to anon, authenticated using (
  status = 'ready' and not removed_by_admin and exists (
    select 1 from public.items i join public.businesses b on b.id = i.business_id
    where i.id = item_id and i.visible and not i.hidden_by_admin and public.business_is_visible(b)
  )
);
create policy if not exists "public read visible faqs" on public.faqs for select to anon, authenticated using (
  visible and admin_status = 'ok' and exists (
    select 1 from public.businesses b where b.id = business_id and public.business_is_visible(b)
  )
);
create policy if not exists "public read offers" on public.offers for select to anon, authenticated using (
  admin_status = 'ok' and exists (
    select 1 from public.businesses b where b.id = business_id and public.business_is_visible(b)
  )
);
create policy if not exists "public read site config" on public.site_config for select to anon, authenticated using (true);
create policy if not exists "public read published pages" on public.content_pages for select to anon, authenticated using (published);

create policy if not exists "admin role categories" on public.categories for all to authenticated
  using (public.has_role(array['owner'])) with check (public.has_role(array['owner']));
create policy if not exists "admin role plans" on public.plans for all to authenticated
  using (public.has_role(array['owner'])) with check (public.has_role(array['owner']));
create policy if not exists "admin role global limits" on public.global_limits for all to authenticated
  using (public.has_role(array['owner'])) with check (public.has_role(array['owner']));
create policy if not exists "admin role legal docs" on public.legal_docs for all to authenticated
  using (public.has_role(array['owner'])) with check (public.has_role(array['owner']));
create policy if not exists "admin role settings" on public.site_settings for all to authenticated
  using (public.has_role(array['owner'])) with check (public.has_role(array['owner']));
create policy if not exists "admin role applications" on public.applications for all to authenticated
  using (public.has_role(array['owner','reviewer'])) with check (public.has_role(array['owner','reviewer']));
create policy if not exists "admin role application docs" on public.application_documents for all to authenticated
  using (public.has_role(array['owner','reviewer'])) with check (public.has_role(array['owner','reviewer']));
create policy if not exists "admin role application flags" on public.application_flags for all to authenticated
  using (public.has_role(array['owner','reviewer'])) with check (public.has_role(array['owner','reviewer']));
create policy if not exists "admin role application events" on public.application_events for all to authenticated
  using (public.has_role(array['owner','reviewer'])) with check (public.has_role(array['owner','reviewer']));

create policy if not exists "admin role businesses" on public.businesses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy if not exists "admin role items" on public.items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy if not exists "admin role item media" on public.item_media for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy if not exists "admin role faqs" on public.faqs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy if not exists "admin role offers" on public.offers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy if not exists "admin role flags" on public.flags for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy if not exists "admin role reports" on public.reports for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy if not exists "admin role payments" on public.payments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy if not exists "admin role message templates" on public.message_templates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy if not exists "admin role messages" on public.messages for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy if not exists "admin role notifications" on public.admin_notifications for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy if not exists "admin role site config" on public.site_config for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy if not exists "admin role content pages" on public.content_pages for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy if not exists "admin role change requests" on public.change_requests for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy if not exists "seller read own business" on public.businesses for select to authenticated using (owner_user_id = auth.uid());
create policy if not exists "seller manage own items" on public.items for all to authenticated
  using (public.owns_business(business_id)) with check (public.owns_business(business_id));
create policy if not exists "seller manage own media" on public.item_media for all to authenticated
  using (exists (select 1 from public.items i where i.id = item_id and public.owns_business(i.business_id)))
  with check (exists (select 1 from public.items i where i.id = item_id and public.owns_business(i.business_id)));
create policy if not exists "seller manage own faqs" on public.faqs for all to authenticated
  using (public.owns_business(business_id)) with check (public.owns_business(business_id));
create policy if not exists "seller manage own offers" on public.offers for all to authenticated
  using (public.owns_business(business_id)) with check (public.owns_business(business_id));
create policy if not exists "seller read own flags" on public.flags for select to authenticated using (public.owns_business(business_id));
create policy if not exists "seller read own payments" on public.payments for select to authenticated using (public.owns_business(business_id));
create policy if not exists "seller read own messages" on public.messages for select to authenticated
  using (channel = 'in_app' and public.owns_business(business_id));
create policy if not exists "seller read own change requests" on public.change_requests for select to authenticated using (public.owns_business(business_id));

create or replace function public.protect_admin_cols() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if tg_table_name = 'items' then
      new.hidden_by_admin := old.hidden_by_admin; new.admin_hide_reason := old.admin_hide_reason;
    elsif tg_table_name = 'faqs' or tg_table_name = 'offers' then
      new.admin_status := old.admin_status; new.admin_reason := old.admin_reason;
    elsif tg_table_name = 'item_media' then
      new.removed_by_admin := old.removed_by_admin; new.admin_reason := old.admin_reason;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists t_items_protect on public.items;
drop trigger if exists t_faqs_protect on public.faqs;
drop trigger if exists t_offers_protect on public.offers;
drop trigger if exists t_media_protect on public.item_media;
create trigger t_items_protect before update on public.items for each row execute function public.protect_admin_cols();
create trigger t_faqs_protect before update on public.faqs for each row execute function public.protect_admin_cols();
create trigger t_offers_protect before update on public.offers for each row execute function public.protect_admin_cols();
create trigger t_media_protect before update on public.item_media for each row execute function public.protect_admin_cols();

create or replace function public.admin_open_application(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare cur text;
begin
  if not public.has_role(array['owner','reviewer']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select status into cur from public.applications where id = p_id for update;
  if cur is null then raise exception 'not_found'; end if;
  if cur = 'submitted' then
    update public.applications
       set status = 'under_review', reviewer_id = coalesce(reviewer_id, auth.uid()), review_started_at = coalesce(review_started_at, now())
     where id = p_id;
    insert into public.application_events(application_id, actor, type, data)
      values (p_id, 'admin', 'under_review', jsonb_build_object('by', auth.uid()));
    perform public.write_audit('application.open', 'application', p_id,
      jsonb_build_object('status', cur), jsonb_build_object('status', 'under_review'), null);
    return 'under_review';
  end if;
  return cur;
end $$;

create or replace function public.admin_return_to_queue(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare cur text;
begin
  if not public.has_role(array['owner','reviewer']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select status into cur from public.applications where id = p_id for update;
  if cur = 'under_review' then
    update public.applications
       set status = 'submitted', reviewer_id = null, review_started_at = null
     where id = p_id;
    insert into public.application_events(application_id, actor, type, data)
      values (p_id, 'admin', 'returned_to_queue', jsonb_build_object('by', auth.uid()));
    perform public.write_audit('application.return', 'application', p_id,
      jsonb_build_object('status', cur), jsonb_build_object('status', 'submitted'), null);
    return 'submitted';
  end if;
  return cur;
end $$;

create or replace function public.admin_log_document_view(p_id uuid, p_slot text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.application_events(application_id, actor, type, data)
    values (p_id, 'admin', 'document_viewed', jsonb_build_object('by', auth.uid(), 'slot', p_slot));
end $$;

create or replace function public.admin_counts() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then jsonb_build_object(
    'submitted',          (select count(*) from applications where status = 'submitted'),
    'under_review',       (select count(*) from applications where status = 'under_review'),
    'changes_requested',  (select count(*) from applications where status = 'changes_requested'),
    'awaiting_payment',   (select count(*) from applications where status = 'approved'),
    'payment_confirming', (select count(*) from applications where status = 'payment_confirming'),
    'live',               (select count(*) from businesses b where public.business_is_visible(b)),
    'expiring_7d',        (select count(*) from businesses where status = 'live' and deleted_at is null and paid_until between public.nairobi_today() and public.nairobi_today() + 7),
    'in_grace',           (select count(*) from businesses where status = 'live' and deleted_at is null and paid_until < public.nairobi_today() and public.nairobi_today() <= paid_until + public.grace_days()),
    'expired',            (select count(*) from businesses where status = 'live' and deleted_at is null and public.nairobi_today() > paid_until + public.grace_days()),
    'suspended',          (select count(*) from businesses where status = 'suspended' and deleted_at is null),
    'open_flags',         (select count(*) from flags where status in ('open','investigating')),
    'open_reports',       (select count(*) from reports where status in ('open','investigating')),
    'unconfirmed_payments', (select count(*) from payments where status = 'submitted'),
    'failed_messages',    (select count(*) from messages where status = 'failed'),
    'pending_changes',    (select count(*) from change_requests where status = 'pending')
  ) else '{}'::jsonb end;
$$;

create or replace function public.admin_search(q text, scopes text[] default null, lim int default 8) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  term text := btrim(coalesce(q, ''));
  pat text;
  res jsonb := '{}'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(term) < 2 then return res; end if;
  pat := '%' || replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  lim := least(greatest(coalesce(lim, 8), 1), 25);

  if scopes is null or 'businesses' = any(scopes) then
    res := res || jsonb_build_object('businesses', coalesce((select jsonb_agg(r) from (
      select b.id, b.name, b.slug, b.seller_id, b.status, b.plan_key, b.town, b.phone, b.paid_until,
             b.verification_level, b.featured,
             (select count(*) from flags f where f.business_id = b.id and f.status in ('open','investigating')) as open_flags
        from businesses b
       where b.deleted_at is null
         and (b.name ilike pat or b.slug ilike pat or b.seller_id ilike pat or b.phone ilike pat
              or b.email ilike pat or b.owner_name ilike pat or b.town ilike pat)
       order by similarity(b.name, term) desc, b.name
       limit lim) r), '[]'::jsonb));
  end if;

  if scopes is null or 'items' = any(scopes) then
    res := res || jsonb_build_object('items', coalesce((select jsonb_agg(r) from (
      select i.id, i.name, i.price, i.price_type, i.unit, i.availability, i.visible, i.hidden_by_admin,
             i.business_id, b.name as business_name, b.slug as business_slug,
             (select count(*) from reports rp where rp.item_id = i.id and rp.status in ('open','investigating')) as open_reports,
             (select count(*) from flags f where f.target_type = 'item' and f.target_id = i.id and f.status in ('open','investigating')) as open_flags
        from items i join businesses b on b.id = i.business_id
       where i.name ilike pat or i.short_description ilike pat or b.name ilike pat
          or exists (select 1 from unnest(i.tags) t where t ilike pat)
       order by similarity(i.name, term) desc, i.name
       limit lim) r), '[]'::jsonb));
  end if;

  if scopes is null or 'applications' = any(scopes) then
    res := res || jsonb_build_object('applications', coalesce((select jsonb_agg(r) from (
      select a.id, a.reference_no, a.business_name, a.owner_full_name, a.phone, a.status, a.submitted_at
        from applications a
       where a.status <> 'uploading'
         and (a.reference_no ilike pat or a.business_name ilike pat or a.owner_full_name ilike pat
              or a.phone ilike pat or a.email ilike pat or a.payment_code ilike pat)
       order by a.submitted_at desc nulls last
       limit lim) r), '[]'::jsonb));
  end if;

  if scopes is null or 'payments' = any(scopes) then
    res := res || jsonb_build_object('payments', coalesce((select jsonb_agg(r) from (
      select p.id, p.mpesa_code, p.amount, p.status, p.phone, p.business_id, b.name as business_name, p.submitted_at
        from payments p left join businesses b on b.id = p.business_id
       where p.mpesa_code ilike pat or p.phone ilike pat or p.receipt_no ilike pat
       order by p.submitted_at desc
       limit lim) r), '[]'::jsonb));
  end if;

  if scopes is null or 'faqs' = any(scopes) then
    res := res || jsonb_build_object('faqs', coalesce((select jsonb_agg(r) from (
      select f.id, f.question, f.admin_status, f.business_id, b.name as business_name
        from faqs f join businesses b on b.id = f.business_id
       where f.question ilike pat or f.answer ilike pat
       order by f.created_at desc
       limit lim) r), '[]'::jsonb));
  end if;

  return res;
end $$;
revoke all on function public.admin_search(text, text[], int) from public, anon;
grant execute on function public.admin_search(text, text[], int) to authenticated;

create or replace function public.notify_admin_on_submit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
    insert into public.admin_notifications(kind, title, body, link)
    values ('application_submitted', 'Application ' || new.reference_no, new.business_name, '/admin/applications/' || new.id);
  end if;
  return new;
end $$;

drop trigger if exists t_app_notify on public.applications;
create trigger t_app_notify after insert or update of status on public.applications
  for each row execute function public.notify_admin_on_submit();

create or replace function public.notify_admin_on_payment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'submitted' then
    insert into public.admin_notifications(kind, title, body, link)
    values ('payment_submitted', 'M-Pesa code ' || coalesce(new.mpesa_code, ''), 'KES ' || new.amount, '/admin/payments');
  end if;
  return new;
end $$;

drop trigger if exists t_payment_notify on public.payments;
create trigger t_payment_notify after insert on public.payments
  for each row execute function public.notify_admin_on_payment();

DO $$
BEGIN
  BEGIN
    alter publication supabase_realtime add table public.applications, public.payments, public.flags, public.reports, public.messages, public.admin_notifications;
  EXCEPTION WHEN duplicate_object THEN null;
  END;
END $$;

insert into public.site_settings(key, value) values
  ('grace_days', '1'),
  ('strike_threshold', '3'),
  ('quiet_hours', '{"start":"21:00","end":"07:00"}'),
  ('mpesa', '{"type":"till","number":"","name":"EpicMKT"}')
on conflict (key) do nothing;

create or replace function public.admin_audit_action(p_action text, p_target_type text, p_target_id uuid, p_before jsonb, p_after jsonb, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.audit_log(actor_id, actor_email, action, target_type, target_id, before, after, reason)
  values (auth.uid(), (select email from auth.users where id = auth.uid()), p_action, p_target_type, p_target_id, p_before, p_after, p_reason);
end $$;

create or replace function public.admin_set_business_visibility(p_id uuid, p_visible boolean, p_reason text default null) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.businesses
     set status = case when p_visible then 'live' else 'unlisted' end,
         status_reason = p_reason,
         updated_at = now()
   where id = p_id;
  perform public.write_audit('business.visibility', 'business', p_id, null, jsonb_build_object('visible', p_visible, 'reason', p_reason), p_reason);
  return true;
end $$;

create or replace function public.admin_set_flag_status(p_id uuid, p_status text, p_note text default null) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.flags
     set status = p_status,
         note = coalesce(p_note, note),
         resolved_at = case when p_status in ('resolved','dismissed') then now() else null end
   where id = p_id;
  perform public.write_audit('flag.status', 'flag', p_id, null, jsonb_build_object('status', p_status, 'note', p_note), p_note);
  return true;
end $$;

-- ensure the admin user can be set as owner in the SQL editor:
-- update public.admins set role = 'owner', email = 'you@example.com', display_name = 'Your Name' where user_id = (select id from auth.users where email = 'you@example.com');
