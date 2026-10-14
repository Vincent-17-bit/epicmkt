-- Admin backend (phase B0).
-- Additive over 0001-0007: it never re-declares a table that an earlier migration owns, it only adds
-- columns, role-aware policies, admin RPCs and the three admin-only tables. Safe to re-run.
--
-- Schema contract for the admin edge functions (what the columns really are):
--   audit_log       entity/entity_id are mirrored to target_type/target_id by a trigger; before/after/reason are columns.
--   payments        amount_kes, status submitted|confirmed|rejected, kind, mpesa_code, decline_reason (0004 + 0006).
--   messages        one table for seller notifications (channel 'in_app') and the outbound SMS/email log.
--   flags           status open|replied|resolved. reports: status open|reviewed|dismissed.
--   change_requests field in (name, category_id, phone, town, pin, licence), old_value/new_value are text.
--   Grace is fixed at one day (public.listing_state, shared/src/billing.js). It is not a setting.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Admin roles
-- ---------------------------------------------------------------------------
alter table public.admins add column if not exists role text not null default 'owner'
  check (role in ('owner','reviewer','finance','support'));
alter table public.admins add column if not exists email text;
alter table public.admins add column if not exists display_name text;

-- owner passes every role check, exactly like requireAdmin() in supabase/functions/_shared/admin.ts.
create or replace function public.has_role(roles text[]) returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from public.admins a
    where a.user_id = auth.uid()
      and (a.role = 'owner' or a.role = any(roles))
  );
$$;
revoke all on function public.has_role(text[]) from public, anon;
grant execute on function public.has_role(text[]) to authenticated, service_role;

create or replace function public.nairobi_today() returns date
language sql stable as $$ select (now() at time zone 'Africa/Nairobi')::date $$;

drop policy if exists "admin reads self" on public.admins;
create policy "admin reads self" on public.admins for select to authenticated
  using (user_id = auth.uid() or public.has_role(array['owner']));
grant select on public.admins to authenticated;
grant all on public.admins to service_role;

-- ---------------------------------------------------------------------------
-- Applications: reviewer
-- ---------------------------------------------------------------------------
alter table public.applications add column if not exists reviewer_id uuid references auth.users(id) on delete set null;
alter table public.applications add column if not exists review_started_at timestamptz;

-- ---------------------------------------------------------------------------
-- Businesses: admin columns (the table itself is owned by 0004)
-- ---------------------------------------------------------------------------
alter table public.businesses
  add column if not exists owner_name text,
  add column if not exists monthly_price integer check (monthly_price is null or monthly_price >= 0),
  add column if not exists status_reason text,
  add column if not exists strikes integer not null default 0 check (strikes >= 0),
  add column if not exists featured_until timestamptz,
  add column if not exists featured_rank integer,
  add column if not exists first_paid_at timestamptz,
  add column if not exists last_login_at timestamptz,
  add column if not exists last_edit_at timestamptz;

create index if not exists businesses_name_trgm on public.businesses using gin (name extensions.gin_trgm_ops);
create index if not exists businesses_phone_idx on public.businesses (phone);
create index if not exists businesses_status_paid_idx on public.businesses (status, paid_until);
create index if not exists businesses_category_town_idx on public.businesses (category_id, town);
create index if not exists items_name_trgm on public.items using gin (name extensions.gin_trgm_ops);

-- Visible to customers: live, not deleted, and inside the paid month or the one day of grace.
create or replace function public.business_is_visible(b public.businesses) returns boolean
language sql stable as $$
  select b.status = 'live'
    and b.deleted_at is null
    and public.listing_state(b.paid_until) in ('active', 'grace');
$$;

-- ---------------------------------------------------------------------------
-- Audit log: richer columns, mirrored names, append-only for browser roles
-- ---------------------------------------------------------------------------
alter table public.audit_log
  add column if not exists actor_email text,
  add column if not exists target_type text,
  add column if not exists target_id text,
  add column if not exists before jsonb,
  add column if not exists after jsonb,
  add column if not exists reason text,
  add column if not exists ip_hash text;
create index if not exists audit_target_idx on public.audit_log (target_type, target_id, created_at desc);

-- entity/entity_id (seller side, 0004) and target_type/target_id (admin side) are one fact.
create or replace function public.audit_log_normalize() returns trigger
language plpgsql as $$
begin
  new.target_type := coalesce(new.target_type, new.entity);
  new.target_id   := coalesce(new.target_id, new.entity_id);
  new.entity      := coalesce(new.entity, new.target_type);
  new.entity_id   := coalesce(new.entity_id, new.target_id);
  return new;
end $$;
drop trigger if exists t_audit_normalize on public.audit_log;
create trigger t_audit_normalize before insert on public.audit_log for each row execute function public.audit_log_normalize();

-- Browser roles may read the log but never write it. Only the service role (edge functions) and
-- security definer functions append. The log is never updated or deleted by application code.
drop policy if exists "admin all audit_log" on public.audit_log;
drop policy if exists "admin read audit_log" on public.audit_log;
create policy "admin read audit_log" on public.audit_log for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.audit_log from public, anon, authenticated;
grant select on public.audit_log to authenticated;

-- Internal writer used by the admin RPCs below. Not callable from the browser.
create or replace function public.admin_audit_action(p_action text, p_target_type text, p_target_id text,
  p_before jsonb, p_after jsonb, p_reason text, p_business uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.audit_log(business_id, actor_id, actor_email, actor_role, action, target_type, target_id, before, after, reason)
  values (p_business, auth.uid(), (select u.email from auth.users u where u.id = auth.uid()), 'admin',
          p_action, p_target_type, p_target_id, p_before, p_after, p_reason);
end $$;
revoke all on function public.admin_audit_action(text, text, text, jsonb, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_audit_action(text, text, text, jsonb, jsonb, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Messages: one table for in-app notices and the outbound SMS / email log
-- ---------------------------------------------------------------------------
alter table public.messages alter column business_id drop not null;
alter table public.messages alter column subject drop not null;
alter table public.messages
  add column if not exists application_id uuid references public.applications(id) on delete set null,
  add column if not exists channel text not null default 'in_app' check (channel in ('sms','email','in_app','whatsapp_link')),
  add column if not exists template_key text,
  add column if not exists to_address text,
  add column if not exists status text not null default 'sent' check (status in ('queued','sent','delivered','failed')),
  add column if not exists provider_id text,
  add column if not exists cost_kes numeric(8,2) check (cost_kes is null or cost_kes >= 0),
  add column if not exists error text,
  add column if not exists attempts integer not null default 0 check (attempts >= 0),
  add column if not exists transactional boolean not null default true,
  add column if not exists scheduled_at timestamptz not null default now(),
  add column if not exists sent_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'messages_target_chk') then
    alter table public.messages add constraint messages_target_chk
      check (business_id is not null or application_id is not null or to_address is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'messages_in_app_chk') then
    alter table public.messages add constraint messages_in_app_chk
      check (channel <> 'in_app' or (business_id is not null and subject is not null));
  end if;
end $$;

create index if not exists messages_queue_idx on public.messages (scheduled_at) where status = 'queued';
create index if not exists messages_failed_idx on public.messages (created_at desc) where status = 'failed';
create index if not exists messages_application_idx on public.messages (application_id) where application_id is not null;

-- A seller only ever sees their own in-app notices, never the SMS/email log, costs or provider errors.
drop policy if exists "seller reads own messages" on public.messages;
create policy "seller reads own messages" on public.messages for select to authenticated
  using (channel = 'in_app' and business_id = public.my_business_id());

-- ---------------------------------------------------------------------------
-- Admin-only tables
-- ---------------------------------------------------------------------------
create table if not exists public.message_templates (
  key text primary key check (key ~ '^[a-z0-9_.-]{2,60}$'),
  channel text not null check (channel in ('sms','email','in_app')),
  subject text,
  body_en text not null,
  body_sw text,
  version integer not null default 1,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.site_config (
  key text primary key,
  value jsonb not null,
  version integer not null default 1,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.content_pages (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,60}$'),
  title text not null,
  body_md text not null,
  published boolean not null default true,
  version integer not null default 1,
  seo_title text,
  seo_description text,
  updated_at timestamptz not null default now()
);

alter table public.message_templates enable row level security;
alter table public.site_config enable row level security;
alter table public.content_pages enable row level security;

-- ---------------------------------------------------------------------------
-- Role-aware policies (defense in depth: every browser write also goes through an edge function)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  -- Catalogue and settings: owner only.
  foreach t in array array['categories','plans','global_limits','legal_docs','site_settings'] loop
    execute format('drop policy if exists %I on public.%I', 'admin all ' || replace(t, '_', ' '), t);
    execute format('drop policy if exists %I on public.%I', 'admin all ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'admin role ' || t, t);
    execute format('create policy %I on public.%I for all to authenticated using (public.has_role(array[''owner''])) with check (public.has_role(array[''owner'']))', 'admin role ' || t, t);
  end loop;
  -- Applications hold ID numbers and documents: owner and reviewer only.
  foreach t in array array['applications','application_documents','application_flags','application_events'] loop
    execute format('drop policy if exists %I on public.%I', 'admin role ' || t, t);
    execute format('create policy %I on public.%I for all to authenticated using (public.has_role(array[''owner'',''reviewer''])) with check (public.has_role(array[''owner'',''reviewer'']))', 'admin role ' || t, t);
  end loop;
end $$;
drop policy if exists "admin all settings" on public.site_settings;
drop policy if exists "admin all documents" on public.application_documents;
drop policy if exists "admin all flags" on public.application_flags;
drop policy if exists "admin all events" on public.application_events;
drop policy if exists "admin all applications" on public.applications;
drop policy if exists "admin all categories" on public.categories;
drop policy if exists "admin all plans" on public.plans;
drop policy if exists "admin all global limits" on public.global_limits;
drop policy if exists "admin all legal docs" on public.legal_docs;

drop policy if exists "admin read application files" on storage.objects;
create policy "admin read application files" on storage.objects for select to authenticated
  using (bucket_id = 'applications' and public.has_role(array['owner','reviewer']));

-- Payments: every admin can read, only owner and finance can write.
drop policy if exists "admin all payments" on public.payments;
drop policy if exists "admin read payments" on public.payments;
drop policy if exists "admin write payments" on public.payments;
create policy "admin read payments" on public.payments for select to authenticated using (public.is_admin());
create policy "admin write payments" on public.payments for all to authenticated
  using (public.has_role(array['owner','finance'])) with check (public.has_role(array['owner','finance']));

drop policy if exists "admin all message_templates" on public.message_templates;
drop policy if exists "admin read message_templates" on public.message_templates;
drop policy if exists "admin write message_templates" on public.message_templates;
create policy "admin read message_templates" on public.message_templates for select to authenticated using (public.is_admin());
create policy "admin write message_templates" on public.message_templates for all to authenticated
  using (public.has_role(array['owner'])) with check (public.has_role(array['owner']));

drop policy if exists "public read site config" on public.site_config;
drop policy if exists "admin write site config" on public.site_config;
create policy "public read site config" on public.site_config for select to anon, authenticated using (true);
create policy "admin write site config" on public.site_config for all to authenticated
  using (public.has_role(array['owner'])) with check (public.has_role(array['owner']));

drop policy if exists "public read published pages" on public.content_pages;
drop policy if exists "admin all content pages" on public.content_pages;
create policy "public read published pages" on public.content_pages for select to anon, authenticated using (published);
create policy "admin all content pages" on public.content_pages for all to authenticated
  using (public.has_role(array['owner'])) with check (public.has_role(array['owner']));

grant select on public.site_config, public.content_pages to anon;
grant select, insert, update, delete on public.message_templates, public.site_config, public.content_pages to authenticated;
grant all on public.message_templates, public.site_config, public.content_pages to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on function public.hit_rate_limit(text, int, int) to service_role;

-- ---------------------------------------------------------------------------
-- Admin RPCs (callable from the admin browser; every one checks the role itself)
-- ---------------------------------------------------------------------------
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
    perform public.admin_audit_action('application.open', 'application', p_id::text,
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
  if cur is null then raise exception 'not_found'; end if;
  if cur = 'under_review' then
    update public.applications
       set status = 'submitted', reviewer_id = null, review_started_at = null
     where id = p_id;
    insert into public.application_events(application_id, actor, type, data)
      values (p_id, 'admin', 'returned_to_queue', jsonb_build_object('by', auth.uid()));
    perform public.admin_audit_action('application.return', 'application', p_id::text,
      jsonb_build_object('status', cur), jsonb_build_object('status', 'submitted'), null);
    return 'submitted';
  end if;
  return cur;
end $$;

create or replace function public.admin_log_document_view(p_id uuid, p_slot text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(array['owner','reviewer']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.application_events(application_id, actor, type, data)
    values (p_id, 'admin', 'document_viewed', jsonb_build_object('by', auth.uid(), 'slot', p_slot));
end $$;

create or replace function public.admin_counts() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then jsonb_build_object(
    'submitted',            (select count(*) from applications where status = 'submitted'),
    'under_review',         (select count(*) from applications where status = 'under_review'),
    'changes_requested',    (select count(*) from applications where status = 'changes_requested'),
    'awaiting_payment',     (select count(*) from applications where status = 'approved'),
    'payment_confirming',   (select count(*) from applications where status = 'payment_confirming'),
    'live',                 (select count(*) from businesses b where public.business_is_visible(b)),
    'expiring_7d',          (select count(*) from businesses b where b.status = 'live' and b.deleted_at is null
                               and public.listing_state(b.paid_until) = 'active' and public.days_left(b.paid_until) <= 7),
    'in_grace',             (select count(*) from businesses b where b.status = 'live' and b.deleted_at is null
                               and public.listing_state(b.paid_until) = 'grace'),
    'expired',              (select count(*) from businesses b where b.deleted_at is null and b.status in ('live', 'expired')
                               and public.listing_state(b.paid_until) = 'expired'),
    'suspended',            (select count(*) from businesses where status = 'suspended' and deleted_at is null),
    'open_flags',           (select count(*) from flags where status in ('open', 'replied')),
    'open_reports',         (select count(*) from reports where status = 'open'),
    'unconfirmed_payments', (select count(*) from payments where status = 'submitted'),
    'failed_messages',      (select count(*) from messages where status = 'failed'),
    'pending_changes',      (select count(*) from change_requests where status = 'pending')
  ) else '{}'::jsonb end;
$$;
revoke all on function public.admin_counts() from public, anon;
grant execute on function public.admin_counts() to authenticated, service_role;

create or replace function public.admin_search(q text, scopes text[] default null, lim int default 8) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
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
             (select count(*) from flags f where f.business_id = b.id and f.status in ('open', 'replied')) as open_flags
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
             (select count(*) from reports rp where rp.item_id = i.id and rp.status = 'open') as open_reports,
             (select count(*) from flags f where f.item_id = i.id and f.status in ('open', 'replied')) as open_flags
        from items i join businesses b on b.id = i.business_id
       where i.name ilike pat or i.description ilike pat or i.section ilike pat or b.name ilike pat
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
      select p.id, p.mpesa_code, p.amount_kes, p.status, p.kind, p.business_id, b.name as business_name, b.phone, p.submitted_at
        from payments p join businesses b on b.id = p.business_id
       where p.mpesa_code ilike pat or p.receipt_no ilike pat or b.phone ilike pat or b.name ilike pat
       order by coalesce(p.submitted_at, p.created_at) desc
       limit lim) r), '[]'::jsonb));
  end if;

  if scopes is null or 'faqs' = any(scopes) then
    res := res || jsonb_build_object('faqs', coalesce((select jsonb_agg(r) from (
      select f.id, f.question, f.business_id, b.name as business_name
        from faqs f join businesses b on b.id = f.business_id
       where f.question ilike pat or f.answer ilike pat
       order by f.created_at desc
       limit lim) r), '[]'::jsonb));
  end if;

  return res;
end $$;
revoke all on function public.admin_search(text, text[], int) from public, anon;
grant execute on function public.admin_search(text, text[], int) to authenticated, service_role;

create or replace function public.admin_set_business_visibility(p_id uuid, p_visible boolean, p_reason text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  cur text;
  nxt text := case when p_visible then 'live' else 'paused' end;
begin
  if not public.has_role(array['owner','reviewer','support']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select status into cur from public.businesses where id = p_id and deleted_at is null for update;
  if cur is null then raise exception 'not_found'; end if;
  if cur not in ('live', 'paused') then raise exception 'invalid_status'; end if;
  update public.businesses
     set status = nxt, status_reason = case when p_visible then null else nullif(btrim(coalesce(p_reason, '')), '') end
   where id = p_id;
  perform public.admin_audit_action('business.visibility', 'business', p_id::text,
    jsonb_build_object('status', cur), jsonb_build_object('status', nxt), p_reason, p_id);
  return true;
end $$;

create or replace function public.admin_set_flag_status(p_id uuid, p_status text, p_note text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare cur text; biz uuid;
begin
  if not public.has_role(array['owner','reviewer','support']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status not in ('open', 'resolved') then raise exception 'invalid_status'; end if;
  select status, business_id into cur, biz from public.flags where id = p_id for update;
  if cur is null then raise exception 'not_found'; end if;
  update public.flags set status = p_status where id = p_id;
  perform public.admin_audit_action('flag.status', 'flag', p_id::text,
    jsonb_build_object('status', cur), jsonb_build_object('status', p_status), p_note, biz);
  return true;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.admin_open_application(uuid)', 'public.admin_return_to_queue(uuid)', 'public.admin_log_document_view(uuid, text)',
    'public.admin_set_business_visibility(uuid, boolean, text)', 'public.admin_set_flag_status(uuid, text, text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Admin notifications: a new application in the queue (payments already notify from 0006)
-- ---------------------------------------------------------------------------
create or replace function public.notify_admin_on_submit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
    insert into public.admin_notifications(kind, business_id, data)
    values ('application_submitted', null,
      jsonb_build_object('application_id', new.id, 'reference_no', new.reference_no, 'business_name', new.business_name));
  end if;
  return null;
end $$;
drop trigger if exists t_app_notify on public.applications;
create trigger t_app_notify after insert or update of status on public.applications
  for each row execute function public.notify_admin_on_submit();

-- ---------------------------------------------------------------------------
-- Realtime for the admin dashboard (RLS still applies to every subscriber)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['applications','payments','flags','reports','messages','admin_notifications'] loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then null;
      end;
    end loop;
  end if;
end $$;

-- Operational settings used by the admin (grace is NOT here: it is fixed at one day).
insert into public.site_settings(key, value) values
  ('strike_threshold', '3'),
  ('quiet_hours', '{"start":"21:00","end":"07:00"}'),
  ('mpesa', '{"type":"till","number":"","name":"EpicMKT"}')
on conflict (key) do nothing;

-- First admin (run once in the SQL editor, or see scripts/seed-admin.mjs):
-- update public.admins set role = 'owner', email = 'you@example.com', display_name = 'Your Name'
--  where user_id = (select id from auth.users where email = 'you@example.com');
