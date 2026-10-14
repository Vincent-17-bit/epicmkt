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

alter table public.audit_log enable row level security;
drop policy if exists "admin read audit" on public.audit_log;
create policy "admin read audit" on public.audit_log for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.audit_log from public, anon, authenticated;

create or replace function public.audit_log_immutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and old.business_id is not null and new.business_id is null
     and (to_jsonb(new) - 'business_id') = (to_jsonb(old) - 'business_id') then
    return new;
  end if;
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

create index if not exists businesses_name_trgm on public.businesses using gin (name gin_trgm_ops);
create index if not exists businesses_phone_idx on public.businesses (phone);
create index if not exists businesses_status_paid_idx on public.businesses (status, paid_until);
create index if not exists businesses_category_town_idx on public.businesses (category_id, town);

create or replace function public.business_is_visible(b public.businesses) returns boolean
language sql stable as $$
  select b.status = 'live'
    and b.deleted_at is null
    and b.paid_until is not null
    and public.nairobi_today() <= public.nairobi_day(b.paid_until) + public.grace_days();
$$;

create or replace function public.owns_business(bid uuid) returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from public.businesses
    where id = bid and user_id = auth.uid() and deleted_at is null
  );
$$;

drop trigger if exists t_businesses_touch on public.businesses;
create trigger t_businesses_touch before update on public.businesses
  for each row execute function public.touch_updated_at();

create index if not exists payments_code_idx on public.payments (mpesa_code);

create table if not exists public.message_templates (
  key text primary key,
  channel text not null check (channel in ('sms','email','in_app')),
  subject text,
  body_en text not null,
  body_sw text,
  version int not null default 1,
  updated_at timestamptz not null default now()
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

drop policy if exists "public read active categories" on public.categories;
create policy "public read active categories" on public.categories for select to anon, authenticated using (active);
drop policy if exists "public read plans" on public.plans;
create policy "public read plans" on public.plans for select to anon, authenticated
  using (exists (select 1 from public.categories c where c.id = category_id and c.active));
drop policy if exists "public read global limits" on public.global_limits;
create policy "public read global limits" on public.global_limits for select to anon, authenticated using (true);
drop policy if exists "public read legal docs" on public.legal_docs;
create policy "public read legal docs" on public.legal_docs for select to anon, authenticated using (true);
drop policy if exists "public read visible businesses" on public.businesses;
create policy "public read visible businesses" on public.businesses for select to anon, authenticated using (public.business_is_visible(businesses));
drop policy if exists "public read site config" on public.site_config;
create policy "public read site config" on public.site_config for select to anon, authenticated using (true);
drop policy if exists "public read published pages" on public.content_pages;
create policy "public read published pages" on public.content_pages for select to anon, authenticated using (published);

drop policy if exists "admin role categories" on public.categories;
create policy "admin role categories" on public.categories for all to authenticated
  using (public.has_role(array['owner'])) with check (public.has_role(array['owner']));
drop policy if exists "admin role plans" on public.plans;
create policy "admin role plans" on public.plans for all to authenticated
  using (public.has_role(array['owner'])) with check (public.has_role(array['owner']));
drop policy if exists "admin role global limits" on public.global_limits;
create policy "admin role global limits" on public.global_limits for all to authenticated
  using (public.has_role(array['owner'])) with check (public.has_role(array['owner']));
drop policy if exists "admin role legal docs" on public.legal_docs;
create policy "admin role legal docs" on public.legal_docs for all to authenticated
  using (public.has_role(array['owner'])) with check (public.has_role(array['owner']));
drop policy if exists "admin role settings" on public.site_settings;
create policy "admin role settings" on public.site_settings for all to authenticated
  using (public.has_role(array['owner'])) with check (public.has_role(array['owner']));
drop policy if exists "admin role applications" on public.applications;
create policy "admin role applications" on public.applications for all to authenticated
  using (public.has_role(array['owner','reviewer'])) with check (public.has_role(array['owner','reviewer']));
drop policy if exists "admin role application docs" on public.application_documents;
create policy "admin role application docs" on public.application_documents for all to authenticated
  using (public.has_role(array['owner','reviewer'])) with check (public.has_role(array['owner','reviewer']));
drop policy if exists "admin role application flags" on public.application_flags;
create policy "admin role application flags" on public.application_flags for all to authenticated
  using (public.has_role(array['owner','reviewer'])) with check (public.has_role(array['owner','reviewer']));
drop policy if exists "admin role application events" on public.application_events;
create policy "admin role application events" on public.application_events for all to authenticated
  using (public.has_role(array['owner','reviewer'])) with check (public.has_role(array['owner','reviewer']));

drop policy if exists "admin role businesses" on public.businesses;
create policy "admin role businesses" on public.businesses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin role items" on public.items;
create policy "admin role items" on public.items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin role item media" on public.item_media;
create policy "admin role item media" on public.item_media for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin role faqs" on public.faqs;
create policy "admin role faqs" on public.faqs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin role offers" on public.offers;
create policy "admin role offers" on public.offers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin role flags" on public.flags;
create policy "admin role flags" on public.flags for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin role reports" on public.reports;
create policy "admin role reports" on public.reports for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin role payments" on public.payments;
create policy "admin role payments" on public.payments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin role message templates" on public.message_templates;
create policy "admin role message templates" on public.message_templates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin role messages" on public.messages;
create policy "admin role messages" on public.messages for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin role notifications" on public.admin_notifications;
create policy "admin role notifications" on public.admin_notifications for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin role site config" on public.site_config;
create policy "admin role site config" on public.site_config for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin role content pages" on public.content_pages;
create policy "admin role content pages" on public.content_pages for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin role change requests" on public.change_requests;
create policy "admin role change requests" on public.change_requests for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

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
    values ('payment_submitted', 'M-Pesa code ' || coalesce(new.mpesa_code, ''), 'KES ' || new.amount_kes, '/admin/payments');
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

-- ensure the admin user can be set as owner in the SQL editor:
-- update public.admins set role = 'owner', email = 'you@example.com', display_name = 'Your Name' where user_id = (select id from auth.users where email = 'you@example.com');
