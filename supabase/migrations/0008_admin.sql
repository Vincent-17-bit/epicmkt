-- 0008_admin.sql - admin backend, role-aware security, audit trail, moderation and messaging.
--
-- This is the canonical admin migration. It runs on top of 0001-0007 and is built to be:
--
--   * Lossless    Nothing is dropped, renamed or narrowed. Existing rows keep their values; no column type shrinks.
--   * Convergent  Safe to run on a fresh database, on a database that already holds production data, and to run twice.
--                 Every step detects what is already there (add column if not exists, drop/create for policies and triggers).
--   * Atomic      The whole file is one transaction: a failure leaves the database exactly as it was.
--   * Compatible  The seller portal (0004-0007) and the admin backend (this file) read and write the SAME tables
--                 with different column names. Where a name differs but the meaning is the same, both columns exist
--                 and a trigger keeps them equal:
--                     businesses.user_id        <-> owner_user_id
--                     payments.amount_kes       <-> amount            payments.decline_reason <-> reject_reason
--                     flags.due_at              <-> seller_due_at     flags.replied_at        <-> seller_replied_at
--                     item_media.path           <-> storage_path
--                     change_requests.field     <-> field_path
--                     audit_log.entity/entity_id <-> target_type/target_id
--                     faqs/offers.hidden_by_admin + removed_by_admin <-> admin_status
--
-- Where this file and 0004-0007 disagree about a type or a vocabulary, the wider one wins so existing data stays valid:
--   businesses.paid_until   stays timestamptz (billing logic is built on it)      items.price*  stay numeric(12,2)
--   change_requests.old_value/new_value stay text                                  faqs.question/answer keep the 200/1000 limits
--   reports.details keeps the 1000 limit                                           messages.dedupe_key stays unique PER BUSINESS
--   status columns accept the union of both vocabularies (e.g. businesses.status keeps 'pending' and 'expired').
-- Constraints that existing data might violate (slug format, one business per application, admin_status vocabulary) are
-- added only when every existing row complies; otherwise a WARNING is raised and the data is left untouched.
--
-- New foreign keys to auth.users use ON DELETE SET NULL, so removing an admin account never blocks.

set local lock_timeout = '15s';
set local statement_timeout = '10min';

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Session-local helpers (they vanish with the session; nothing persistent is left behind)
-- ---------------------------------------------------------------------------

-- Replace the single-column CHECK on p_col with a named one. Used only to WIDEN a vocabulary, so it cannot reject existing rows.
create or replace function pg_temp.m8_check(p_table regclass, p_col text, p_name text, p_expr text) returns void
language plpgsql as $m8$
declare
  r record;
  v_att smallint;
begin
  select attnum into v_att from pg_attribute where attrelid = p_table and attname = p_col and not attisdropped;
  if v_att is null then raise exception 'm8_check: no column %.%', p_table, p_col; end if;
  for r in select conname from pg_constraint where conrelid = p_table and contype = 'c' and conkey = array[v_att]::smallint[] loop
    execute format('alter table %s drop constraint %I', p_table, r.conname);
  end loop;
  execute format('alter table %s add constraint %I check (%s)', p_table, p_name, p_expr);
end $m8$;

-- Add a CHECK only if every existing row already satisfies it; otherwise warn and leave the data alone.
create or replace function pg_temp.m8_check_if_valid(p_table regclass, p_name text, p_expr text) returns void
language plpgsql as $m8$
declare n bigint;
begin
  if exists (select 1 from pg_constraint where conrelid = p_table and conname = p_name) then
    execute format('alter table %s drop constraint %I', p_table, p_name);
  end if;
  execute format('select count(*) from %s where not coalesce((%s), true)', p_table, p_expr) into n;
  if n > 0 then
    raise warning '0008: skipped constraint % on %: % existing row(s) violate it. Fix the data and add it by hand.', p_name, p_table, n;
  else
    execute format('alter table %s add constraint %I check (%s)', p_table, p_name, p_expr);
  end if;
end $m8$;

-- Make sure a foreign key on p_col -> p_ref(id) exists with the wanted ON DELETE action.
create or replace function pg_temp.m8_fk(p_table regclass, p_col text, p_ref regclass, p_action text, p_name text) returns void
language plpgsql as $m8$
declare
  v_att smallint;
  r record;
  v_ok boolean := false;
begin
  select attnum into v_att from pg_attribute where attrelid = p_table and attname = p_col and not attisdropped;
  for r in select conname, confdeltype::text as act from pg_constraint
           where conrelid = p_table and contype = 'f' and confrelid = p_ref and conkey = array[v_att]::smallint[] loop
    if r.act = p_action then v_ok := true;
    else execute format('alter table %s drop constraint %I', p_table, r.conname);
    end if;
  end loop;
  if not v_ok then
    execute format('alter table %s add constraint %I foreign key (%I) references %s(id) on delete %s', p_table, p_name, p_col, p_ref,
      case p_action when 'n' then 'set null' when 'c' then 'cascade' else 'no action' end);
  end if;
end $m8$;

-- Enable or disable a trigger by name if it exists. Used so backfills do not bump updated_at or re-run side effects.
create or replace function pg_temp.m8_trg(p_table regclass, p_name text, p_enable boolean) returns void
language plpgsql as $m8$
begin
  if exists (select 1 from pg_trigger where tgrelid = p_table and tgname = p_name and not tgisinternal) then
    execute format('alter table %s %s trigger %I', p_table, case when p_enable then 'enable' else 'disable' end, p_name);
  end if;
end $m8$;

-- ---------------------------------------------------------------------------
-- Admin roles, time and grace helpers
-- ---------------------------------------------------------------------------
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

-- A malformed setting must never break every visibility check, so it falls back to one day; the range is clamped.
create or replace function public.grace_days() returns int
language sql stable security definer set search_path = public as
$$
  select coalesce((
    select least(30, case when (s.value #>> '{}') ~ '^[0-9]{1,3}$' then (s.value #>> '{}')::int else 1 end)
    from public.site_settings s where s.key = 'grace_days'
  ), 1);
$$;

-- ---------------------------------------------------------------------------
-- Applications: reviewer tracking
-- ---------------------------------------------------------------------------
alter table public.applications add column if not exists reviewer_id uuid references auth.users(id) on delete set null;
alter table public.applications add column if not exists review_started_at timestamptz;

-- ---------------------------------------------------------------------------
-- Audit log: seller-side and admin-side columns side by side, append-only
-- ---------------------------------------------------------------------------
alter table public.audit_log
  add column if not exists actor_email text,
  add column if not exists target_type text,
  add column if not exists target_id uuid,
  add column if not exists before jsonb,
  add column if not exists after jsonb,
  add column if not exists reason text,
  add column if not exists ip text;

create index if not exists audit_target_idx on public.audit_log (target_type, target_id, created_at desc);

-- Fill the other representation on every insert. actor_role has no column default on purpose: it is derived here
-- (a default would be applied before this trigger and hide the derivation).
create or replace function public.audit_log_fill() returns trigger
language plpgsql security definer set search_path = public as $m8$
begin
  if new.target_type is null then new.target_type := new.entity; end if;
  if new.entity is null then new.entity := new.target_type; end if;
  if new.target_id is null and new.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    new.target_id := new.entity_id::uuid;
  end if;
  if new.entity_id is null and new.target_id is not null then new.entity_id := new.target_id::text; end if;
  if new.actor_role is null then
    new.actor_role := case
      when new.actor_id is null then 'system'
      when exists (select 1 from public.admins a where a.user_id = new.actor_id) then 'admin'
      else 'seller' end;
  end if;
  return new;
end $m8$;

-- Append-only. The single permitted change is the foreign key's ON DELETE SET NULL detaching a deleted business,
-- so a business can still be removed while its audit rows stay.
create or replace function public.audit_log_immutable() returns trigger
language plpgsql as $m8$
begin
  if tg_op = 'UPDATE' then
    if old.business_id is not null and new.business_id is null
       and (to_jsonb(new) - 'business_id') = (to_jsonb(old) - 'business_id') then
      return new;
    end if;
  end if;
  raise exception 'audit_log is append-only';
end $m8$;

do $m8$
begin
  -- backfill the new target columns from the old ones (the trigger is off for the duration, then back on)
  perform pg_temp.m8_trg('public.audit_log', 't_audit_no_update', false);
  update public.audit_log set target_type = entity where target_type is null and entity is not null;
  update public.audit_log set target_id = entity_id::uuid
   where target_id is null
     and entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  perform pg_temp.m8_trg('public.audit_log', 't_audit_no_update', true);
end $m8$;

drop trigger if exists t_audit_a_fill on public.audit_log;
create trigger t_audit_a_fill before insert on public.audit_log
  for each row execute function public.audit_log_fill();
drop trigger if exists t_audit_no_update on public.audit_log;
create trigger t_audit_no_update before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();
drop trigger if exists t_audit_no_truncate on public.audit_log;
create trigger t_audit_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_log_immutable();

alter table public.audit_log enable row level security;
drop policy if exists "admin all audit_log" on public.audit_log;
drop policy if exists "admin read audit" on public.audit_log;
create policy "admin read audit" on public.audit_log for select to authenticated using (public.is_admin());
revoke insert, update, delete, truncate on public.audit_log from public, anon, authenticated;
grant select on public.audit_log to authenticated;

-- Admin-side audit entry point. Overloads the seller-side write_audit(uuid, text, text, text, jsonb) from 0005.
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
grant execute on function public.write_audit(text, text, uuid, jsonb, jsonb, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Businesses
-- ---------------------------------------------------------------------------
alter table public.businesses
  add column if not exists owner_user_id uuid unique references auth.users(id) on delete set null,
  add column if not exists owner_name text,
  add column if not exists monthly_price integer,
  add column if not exists status_reason text,
  add column if not exists featured_until timestamptz,
  add column if not exists featured_rank int,
  add column if not exists strikes int not null default 0 check (strikes >= 0),
  add column if not exists must_change_password boolean not null default false,
  add column if not exists first_paid_at timestamptz,
  add column if not exists last_login_at timestamptz,
  add column if not exists last_edit_at timestamptz;
-- Existing sellers already have a password; only sellers created from now on start with a temporary one.
alter table public.businesses alter column must_change_password set default true;

do $m8$
begin
  perform pg_temp.m8_trg('public.businesses', 't_businesses_touch', false);
  update public.businesses set owner_user_id = user_id where owner_user_id is null and user_id is not null;
  update public.businesses set user_id = owner_user_id where user_id is null and owner_user_id is not null;
  update public.businesses b set owner_name = a.owner_full_name
    from public.applications a where b.owner_name is null and a.id = b.application_id;
  update public.businesses set owner_name = name where owner_name is null;
  update public.businesses b set monthly_price = coalesce(
      (select p.price_kes from public.plans p where p.category_id = b.category_id and p.plan_key = b.plan_key),
      (select a.price_at_submission from public.applications a where a.id = b.application_id),
      0)
    where b.monthly_price is null;
  update public.businesses b set first_paid_at = (
      select min(coalesce(p.confirmed_at, p.created_at)) from public.payments p where p.business_id = b.id and p.status = 'confirmed')
    where b.first_paid_at is null;
  update public.businesses b set last_login_at = (
      select max(e.created_at) from public.login_events e where e.business_id = b.id and e.success)
    where b.last_login_at is null;
  perform pg_temp.m8_trg('public.businesses', 't_businesses_touch', true);
end $m8$;
alter table public.businesses alter column owner_name set not null;
alter table public.businesses alter column monthly_price set not null;

do $m8$ begin perform pg_temp.m8_check('public.businesses', 'status', 'businesses_status_check',
  $$status in ('pending','live','paused','suspended','expired','unlisted','deleted')$$); end $m8$;
do $m8$ begin perform pg_temp.m8_check_if_valid('public.businesses', 'businesses_slug_format_check', $$slug ~ '^[a-z0-9-]{3,60}$'$$); end $m8$;

do $m8$
begin
  if exists (select 1 from public.businesses where application_id is not null group by application_id having count(*) > 1) then
    raise warning '0008: skipped unique index on businesses.application_id: some applications have more than one business';
  else
    create unique index if not exists businesses_application_id_key on public.businesses (application_id);
  end if;
end $m8$;

create index if not exists businesses_name_trgm on public.businesses using gin (name gin_trgm_ops);
create index if not exists businesses_phone_idx on public.businesses (phone);
create index if not exists businesses_status_paid_idx on public.businesses (status, paid_until);
create index if not exists businesses_category_town_idx on public.businesses (category_id, town);

-- Keeps user_id and owner_user_id equal, fills the admin-side NOT NULL columns for rows created the seller way,
-- and stamps last_edit_at for seller edits.
create or replace function public.businesses_sync() returns trigger
language plpgsql security definer set search_path = public as $m8$
begin
  if tg_op = 'INSERT' then
    if new.owner_user_id is null then new.owner_user_id := new.user_id; end if;
    if new.user_id is null then new.user_id := new.owner_user_id; end if;
    if new.owner_name is null then
      select a.owner_full_name into new.owner_name from public.applications a where a.id = new.application_id;
      new.owner_name := coalesce(new.owner_name, new.name);
    end if;
    if new.monthly_price is null then
      select p.price_kes into new.monthly_price from public.plans p where p.category_id = new.category_id and p.plan_key = new.plan_key;
      if new.monthly_price is null then
        select a.price_at_submission into new.monthly_price from public.applications a where a.id = new.application_id;
      end if;
      new.monthly_price := coalesce(new.monthly_price, 0);
    end if;
  else
    if new.user_id is distinct from old.user_id and new.owner_user_id is distinct from old.owner_user_id
       and new.user_id is distinct from new.owner_user_id then
      raise exception 'user_id and owner_user_id must be changed together';
    elsif new.user_id is distinct from old.user_id then
      new.owner_user_id := new.user_id;
    elsif new.owner_user_id is distinct from old.owner_user_id then
      new.user_id := new.owner_user_id;
    end if;
    if public.actor_role() = 'seller' then new.last_edit_at := now(); end if;
  end if;
  return new;
end $m8$;
drop trigger if exists t_businesses_a_sync on public.businesses;
create trigger t_businesses_a_sync before insert or update on public.businesses
  for each row execute function public.businesses_sync();

-- paid_until is a timestamptz (0006): compare Nairobi calendar days, exactly as listing_state() does.
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
    where id = bid and owner_user_id = auth.uid() and deleted_at is null
  );
$$;

-- ---------------------------------------------------------------------------
-- Catalogue: items, media, FAQs, offers
-- ---------------------------------------------------------------------------
alter table public.items
  add column if not exists short_description text,
  add column if not exists item_type text not null default 'product' check (item_type in ('product','service','package','class')),
  add column if not exists sale_starts date,
  add column if not exists sale_ends date,
  add column if not exists badge text check (badge in ('Popular','New','Best value')),
  add column if not exists tags text[] not null default '{}',
  add column if not exists variants jsonb not null default '[]',
  add column if not exists specs jsonb not null default '{}',
  add column if not exists extra jsonb not null default '{}';
do $m8$ begin perform pg_temp.m8_check('public.items', 'availability', 'items_availability_check',
  $$availability in ('available','limited_stock','out_of_stock','unavailable','seasonal','by_appointment','coming_soon')$$); end $m8$;
create index if not exists items_name_trgm on public.items using gin (name gin_trgm_ops);
create index if not exists items_tags_idx on public.items using gin (tags);

alter table public.item_media
  add column if not exists storage_path text,
  add column if not exists poster_path text,
  add column if not exists alt text,
  add column if not exists status text not null default 'ready' check (status in ('processing','ready','failed')),
  add column if not exists removed_by_admin boolean not null default false,
  add column if not exists admin_reason text;
update public.item_media set storage_path = path where storage_path is null;
alter table public.item_media alter column storage_path set not null;

create or replace function public.item_media_sync() returns trigger
language plpgsql security definer set search_path = public as $m8$
begin
  if tg_op = 'INSERT' then
    new.storage_path := coalesce(new.storage_path, new.path);
    new.path := coalesce(new.path, new.storage_path);
    if new.business_id is null then select i.business_id into new.business_id from public.items i where i.id = new.item_id; end if;
    if new.mime is null then
      new.mime := case lower(substring(coalesce(new.path, '') from '\.([A-Za-z0-9]+)$'))
        when 'webp' then 'image/webp' when 'jpg' then 'image/jpeg' when 'jpeg' then 'image/jpeg' when 'png' then 'image/png'
        when 'mp4' then 'video/mp4' when 'webm' then 'video/webm' else 'application/octet-stream' end;
    end if;
  else
    if new.path is distinct from old.path then new.storage_path := new.path;
    elsif new.storage_path is distinct from old.storage_path then new.path := new.storage_path;
    end if;
  end if;
  return new;
end $m8$;
drop trigger if exists t_item_media_a_sync on public.item_media;
create trigger t_item_media_a_sync before insert or update on public.item_media
  for each row execute function public.item_media_sync();

-- FAQs and offers: admin_status mirrors hidden_by_admin / removed_by_admin.
alter table public.faqs add column if not exists visible boolean not null default true;
alter table public.faqs alter column admin_status set default 'ok';
alter table public.offers alter column admin_status set default 'ok';
alter table public.offers
  add column if not exists discount_type text check (discount_type in ('percent','amount')),
  add column if not exists discount_value integer check (discount_value > 0),
  add column if not exists item_ids uuid[] not null default '{}';
-- 0008 requires a discount; offers created before it have none, so the pair is required to be consistent, not present.
do $m8$ begin perform pg_temp.m8_check_if_valid('public.offers', 'offers_discount_pair_check', $$(discount_type is null) = (discount_value is null)$$); end $m8$;

do $m8$
begin
  perform pg_temp.m8_trg('public.faqs', 't_faqs_touch', false);
  perform pg_temp.m8_trg('public.offers', 't_offers_touch', false);
  update public.faqs set admin_status = case when removed_by_admin then 'removed' when hidden_by_admin then 'hidden' else 'ok' end
    where admin_status is null;
  update public.offers set admin_status = case when removed_by_admin then 'removed' when hidden_by_admin then 'hidden' else 'ok' end
    where admin_status is null;
  perform pg_temp.m8_trg('public.faqs', 't_faqs_touch', true);
  perform pg_temp.m8_trg('public.offers', 't_offers_touch', true);
end $m8$;
alter table public.faqs alter column admin_status set not null;
alter table public.offers alter column admin_status set not null;
do $m8$ begin perform pg_temp.m8_check_if_valid('public.faqs', 'faqs_admin_status_check', $$admin_status in ('ok','hidden','removed')$$); end $m8$;
do $m8$ begin perform pg_temp.m8_check_if_valid('public.offers', 'offers_admin_status_check', $$admin_status in ('ok','hidden','removed')$$); end $m8$;

create or replace function public.moderation_sync() returns trigger
language plpgsql as $m8$
declare
  v_status_changed boolean;
  v_flags_changed boolean;
begin
  new.admin_status := coalesce(new.admin_status, 'ok');
  if tg_op = 'INSERT' then
    v_status_changed := new.admin_status <> 'ok';
    v_flags_changed := new.hidden_by_admin or new.removed_by_admin;
  else
    v_status_changed := new.admin_status is distinct from old.admin_status;
    v_flags_changed := new.hidden_by_admin is distinct from old.hidden_by_admin or new.removed_by_admin is distinct from old.removed_by_admin;
  end if;
  if v_status_changed and new.admin_status in ('ok','hidden','removed') then
    new.hidden_by_admin := new.admin_status = 'hidden';
    new.removed_by_admin := new.admin_status = 'removed';
  elsif v_flags_changed then
    new.admin_status := case when new.removed_by_admin then 'removed' when new.hidden_by_admin then 'hidden' else 'ok' end;
  end if;
  return new;
end $m8$;
drop trigger if exists t_faqs_moderation on public.faqs;
create trigger t_faqs_moderation before insert or update on public.faqs for each row execute function public.moderation_sync();
drop trigger if exists t_offers_moderation on public.offers;
create trigger t_offers_moderation before insert or update on public.offers for each row execute function public.moderation_sync();

-- One guard for every admin-owned column. It replaces the 0005 version: it keeps its strictness (sellers get an error,
-- on insert as well as update) and extends it to item_media. 'ok' is the neutral admin_status on faqs and offers.
create or replace function public.protect_admin_cols() returns trigger
language plpgsql as $m8$
declare
  o jsonb;
  n jsonb := to_jsonb(new);
  k text;
  cols text[] := case tg_table_name
    when 'item_media' then array['removed_by_admin','admin_reason']
    else array['hidden_by_admin','admin_hide_reason','admin_status','admin_reason','removed_by_admin'] end;
begin
  if public.actor_role() <> 'seller' then return new; end if;
  if tg_op = 'INSERT' then
    foreach k in array cols loop
      if (n ->> k) is not null and (n ->> k) <> 'false'
         and not (k = 'admin_status' and tg_table_name in ('faqs','offers') and (n ->> k) = 'ok') then
        raise exception 'admin_columns_protected' using errcode = '42501';
      end if;
    end loop;
  else
    o := to_jsonb(old);
    foreach k in array cols loop
      if o -> k is distinct from n -> k then
        raise exception 'admin_columns_protected' using errcode = '42501';
      end if;
    end loop;
  end if;
  return new;
end $m8$;
drop trigger if exists t_media_protect on public.item_media;
create trigger t_media_protect before insert or update on public.item_media
  for each row execute function public.protect_admin_cols();

-- ---------------------------------------------------------------------------
-- Flags
-- ---------------------------------------------------------------------------
alter table public.flags
  add column if not exists target_type text check (target_type in ('business','item','faq','media','offer','application')),
  add column if not exists target_id uuid,
  add column if not exists severity text not null default 'medium' check (severity in ('low','medium','high')),
  add column if not exists note text,
  add column if not exists seller_due_at timestamptz,
  add column if not exists seller_replied_at timestamptz,
  add column if not exists assigned_to uuid references auth.users(id) on delete set null;
alter table public.flags alter column business_id drop not null;

update public.flags set
  target_type = case when faq_id is not null then 'faq' when item_id is not null then 'item' else 'business' end,
  target_id = coalesce(faq_id, item_id, business_id)
where target_type is null;
update public.flags set seller_due_at = due_at where seller_due_at is null and due_at is not null;
update public.flags set seller_replied_at = replied_at where seller_replied_at is null and replied_at is not null;
alter table public.flags alter column target_type set not null;
alter table public.flags alter column target_id set not null;
do $m8$ begin perform pg_temp.m8_check('public.flags', 'status', 'flags_status_check',
  $$status in ('open','replied','investigating','resolved','dismissed')$$); end $m8$;
create index if not exists flags_open_idx on public.flags (status, created_at desc);

create or replace function public.flags_sync() returns trigger
language plpgsql as $m8$
begin
  if tg_op = 'INSERT' then
    if new.target_type is null then
      new.target_type := case when new.faq_id is not null then 'faq' when new.item_id is not null then 'item' else 'business' end;
    end if;
    if new.target_id is null then new.target_id := coalesce(new.faq_id, new.item_id, new.business_id); end if;
    new.seller_due_at := coalesce(new.seller_due_at, new.due_at);
    new.due_at := coalesce(new.due_at, new.seller_due_at);
    new.seller_replied_at := coalesce(new.seller_replied_at, new.replied_at);
    new.replied_at := coalesce(new.replied_at, new.seller_replied_at);
  else
    if new.due_at is distinct from old.due_at then new.seller_due_at := new.due_at;
    elsif new.seller_due_at is distinct from old.seller_due_at then new.due_at := new.seller_due_at; end if;
    if new.replied_at is distinct from old.replied_at then new.seller_replied_at := new.replied_at;
    elsif new.seller_replied_at is distinct from old.seller_replied_at then new.replied_at := new.seller_replied_at; end if;
  end if;
  return new;
end $m8$;
drop trigger if exists t_flags_a_sync on public.flags;
create trigger t_flags_a_sync before insert or update on public.flags for each row execute function public.flags_sync();

-- 0006 only closed a flag on 'resolved'; a dismissed flag is closed too, and an admin-set resolved_at must survive.
create or replace function public.flags_stamp() returns trigger
language plpgsql as $m8$
begin
  if new.status in ('resolved','dismissed') then
    if new.resolved_at is null then new.resolved_at := now(); end if;
  else
    new.resolved_at := null;
  end if;
  return new;
end $m8$;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
create or replace function public.report_type_from_reason(r text) returns text
language sql immutable as $$
  select case lower(coalesce(r, ''))
    when 'wrong-price' then 'wrong_price' when 'wrong_price' then 'wrong_price'
    when 'closed' then 'closed_but_listed_open' when 'closed_but_listed_open' then 'closed_but_listed_open'
    when 'scam' then 'fake' when 'fake' then 'fake'
    when 'inappropriate' then 'offensive' when 'offensive' then 'offensive'
    else 'other' end
$$;
create or replace function public.report_reason_from_type(t text) returns text
language sql immutable as $$
  select case t when 'wrong_price' then 'wrong-price' when 'closed_but_listed_open' then 'closed'
    when 'fake' then 'scam' when 'offensive' then 'inappropriate' else coalesce(t, 'other') end
$$;

alter table public.reports
  add column if not exists report_type text,
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists admin_note text,
  add column if not exists resolved_at timestamptz;
update public.reports set report_type = public.report_type_from_reason(reason) where report_type is null;
alter table public.reports alter column report_type set not null;
do $m8$ begin perform pg_temp.m8_check('public.reports', 'report_type', 'reports_report_type_check',
  $$report_type in ('wrong_price','closed_but_listed_open','fake','offensive','other')$$); end $m8$;
do $m8$ begin perform pg_temp.m8_check('public.reports', 'status', 'reports_status_check',
  $$status in ('open','reviewed','investigating','resolved','dismissed')$$); end $m8$;
create index if not exists reports_open_idx on public.reports (status, created_at desc);

create or replace function public.reports_sync() returns trigger
language plpgsql as $m8$
begin
  if new.report_type is null then new.report_type := public.report_type_from_reason(new.reason); end if;
  if new.reason is null then new.reason := public.report_reason_from_type(new.report_type); end if;
  return new;
end $m8$;
drop trigger if exists t_reports_a_sync on public.reports;
create trigger t_reports_a_sync before insert on public.reports for each row execute function public.reports_sync();

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
create sequence if not exists public.receipt_seq start 1000;

alter table public.payments
  add column if not exists amount integer check (amount >= 0),
  add column if not exists application_id uuid references public.applications(id) on delete set null,
  add column if not exists months int not null default 1 check (months between 1 and 24),
  add column if not exists phone text,
  add column if not exists confirmed_by uuid references auth.users(id) on delete set null,
  add column if not exists notes text,
  add column if not exists reject_reason text;
alter table public.payments alter column business_id drop not null;

do $m8$
begin
  perform pg_temp.m8_trg('public.payments', 't_payments_stamp', false);
  update public.payments set amount = amount_kes where amount is null;
  update public.payments set reject_reason = decline_reason where reject_reason is null and decline_reason is not null;
  update public.payments set submitted_at = created_at where submitted_at is null;
  perform pg_temp.m8_trg('public.payments', 't_payments_stamp', true);
end $m8$;
alter table public.payments alter column amount set not null;
alter table public.payments alter column submitted_at set default now();
alter table public.payments alter column submitted_at set not null;
-- A payment record outlives the business it was made for.
do $m8$ begin perform pg_temp.m8_fk('public.payments', 'business_id', 'public.businesses', 'n', 'payments_business_id_fkey'); end $m8$;
do $m8$ begin perform pg_temp.m8_check('public.payments', 'status', 'payments_status_check',
  $$status in ('submitted','confirmed','rejected','refunded')$$); end $m8$;
create index if not exists payments_code_idx on public.payments (mpesa_code);
create index if not exists payments_status_submitted_idx on public.payments (status, submitted_at desc);

create or replace function public.payments_sync() returns trigger
language plpgsql as $m8$
begin
  if tg_op = 'INSERT' then
    new.amount := coalesce(new.amount, new.amount_kes);
    new.amount_kes := coalesce(new.amount_kes, new.amount);
    new.reject_reason := coalesce(new.reject_reason, new.decline_reason);
    new.decline_reason := coalesce(new.decline_reason, left(new.reject_reason, 300));
  else
    if new.amount_kes is distinct from old.amount_kes then new.amount := new.amount_kes;
    elsif new.amount is distinct from old.amount then new.amount_kes := new.amount; end if;
    if new.decline_reason is distinct from old.decline_reason then new.reject_reason := new.decline_reason;
    elsif new.reject_reason is distinct from old.reject_reason then new.decline_reason := left(new.reject_reason, 300); end if;
  end if;
  return new;
end $m8$;
drop trigger if exists t_payments_a_sync on public.payments;
create trigger t_payments_a_sync before insert or update on public.payments for each row execute function public.payments_sync();

-- 0006 froze a confirmed payment completely; a confirmed payment may now be refunded, nothing else.
create or replace function public.payments_stamp() returns trigger
language plpgsql security definer set search_path = public as $m8$
begin
  new.updated_at := now();
  if new.status = 'confirmed' then
    if new.receipt_no is null then new.receipt_no := public.next_receipt_no(now()); end if;
    if new.confirmed_at is null then new.confirmed_at := now(); end if;
  end if;
  if tg_op = 'UPDATE' and old.status = 'confirmed' and new.status not in ('confirmed','refunded') then
    raise exception 'payment_already_confirmed' using errcode = 'P0001';
  end if;
  return new;
end $m8$;

create or replace function public.payments_first_paid() returns trigger
language plpgsql security definer set search_path = public as $m8$
begin
  if new.status = 'confirmed' and new.business_id is not null then
    update public.businesses b set first_paid_at = coalesce(new.confirmed_at, now())
     where b.id = new.business_id and b.first_paid_at is null;
  end if;
  return null;
end $m8$;
drop trigger if exists t_payments_first_paid on public.payments;
create trigger t_payments_first_paid after insert or update of status on public.payments
  for each row execute function public.payments_first_paid();

-- ---------------------------------------------------------------------------
-- Messages: the seller inbox (in_app) and the outbound queue (sms, email) in one table
-- ---------------------------------------------------------------------------
alter table public.messages
  add column if not exists application_id uuid references public.applications(id) on delete set null,
  add column if not exists channel text not null default 'in_app' check (channel in ('sms','email','in_app','whatsapp_link')),
  add column if not exists template_key text,
  add column if not exists to_address text,
  add column if not exists provider_id text,
  add column if not exists cost_kes numeric(8,2),
  add column if not exists error text,
  add column if not exists attempts int not null default 0,
  add column if not exists transactional boolean not null default true,
  add column if not exists scheduled_at timestamptz not null default now(),
  add column if not exists sent_at timestamptz,
  add column if not exists status text not null default 'queued' check (status in ('queued','sent','delivered','failed'));
alter table public.messages alter column business_id drop not null;
alter table public.messages alter column subject drop not null;
do $m8$ begin perform pg_temp.m8_fk('public.messages', 'business_id', 'public.businesses', 'n', 'messages_business_id_fkey'); end $m8$;

-- Messages written before this migration are inbox entries the seller could already read: delivered when created.
update public.messages set status = 'delivered', sent_at = created_at, scheduled_at = created_at
 where channel = 'in_app' and status = 'queued' and sent_at is null and to_address is null and created_by is null;
create index if not exists messages_queue_idx on public.messages (status, scheduled_at);

-- An in-app message needs no sender: it is delivered the moment it is stored.
create or replace function public.messages_deliver_in_app() returns trigger
language plpgsql as $m8$
begin
  if new.channel = 'in_app' and new.status = 'queued' and new.sent_at is null then
    new.status := 'delivered';
    new.sent_at := now();
  end if;
  return new;
end $m8$;
drop trigger if exists t_messages_a_deliver on public.messages;
create trigger t_messages_a_deliver before insert on public.messages
  for each row execute function public.messages_deliver_in_app();

-- ---------------------------------------------------------------------------
-- Admin notifications
-- ---------------------------------------------------------------------------
alter table public.admin_notifications
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists link text,
  add column if not exists read_by uuid[] not null default '{}';
update public.admin_notifications set title = initcap(replace(kind, '_', ' ')) where title is null;
alter table public.admin_notifications alter column title set not null;

create or replace function public.admin_notifications_fill() returns trigger
language plpgsql as $m8$
begin
  new.title := coalesce(new.title, initcap(replace(new.kind, '_', ' ')));
  return new;
end $m8$;
drop trigger if exists t_admin_notifications_a_fill on public.admin_notifications;
create trigger t_admin_notifications_a_fill before insert on public.admin_notifications
  for each row execute function public.admin_notifications_fill();

-- 0005's notify_admin, plus one rule: the payment trigger below already announces a submitted payment, so the seller
-- RPC's own call for the same payment is dropped instead of notifying twice.
create or replace function public.notify_admin(p_kind text, p_business uuid, p_data jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $m8$
begin
  if p_kind = 'payment_submitted' and p_data ? 'payment_id'
     and exists (select 1 from public.admin_notifications n
                  where n.kind = 'payment_submitted' and n.data ->> 'payment_id' = p_data ->> 'payment_id') then
    return;
  end if;
  insert into public.admin_notifications (kind, business_id, data) values (p_kind, p_business, coalesce(p_data, '{}'));
end $m8$;

-- ---------------------------------------------------------------------------
-- Change requests
-- ---------------------------------------------------------------------------
alter table public.change_requests
  add column if not exists field_path text,
  add column if not exists reason text;
update public.change_requests set field_path = field where field_path is null;
alter table public.change_requests alter column field_path set not null;
-- 0004 limited field to six names; the seller RPC still enforces that list. The column itself now takes any path.
do $m8$ begin perform pg_temp.m8_check('public.change_requests', 'field', 'change_requests_field_check', $$char_length(field) between 1 and 100$$); end $m8$;

create or replace function public.change_requests_sync() returns trigger
language plpgsql as $m8$
begin
  if tg_op = 'INSERT' then
    new.field_path := coalesce(new.field_path, new.field);
    new.field := coalesce(new.field, new.field_path);
  else
    if new.field is distinct from old.field then new.field_path := new.field;
    elsif new.field_path is distinct from old.field_path then new.field := new.field_path; end if;
  end if;
  return new;
end $m8$;
drop trigger if exists t_change_requests_a_sync on public.change_requests;
create trigger t_change_requests_a_sync before insert or update on public.change_requests
  for each row execute function public.change_requests_sync();

-- ---------------------------------------------------------------------------
-- New admin tables
-- ---------------------------------------------------------------------------
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
  updated_by uuid references auth.users(id) on delete set null,
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

-- ---------------------------------------------------------------------------
-- Public read helpers.
-- Each answers "may the anonymous public see this row?" in one place. They are SECURITY DEFINER so a policy never
-- depends on the caller's column privileges, and they return a boolean only, so they leak nothing.
-- ---------------------------------------------------------------------------
create or replace function public.business_is_public(bid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.businesses b where b.id = bid and public.business_is_visible(b));
$$;
create or replace function public.item_is_public(iid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.items i
                  where i.id = iid and i.visible and not i.hidden_by_admin and not i.removed_by_admin
                    and public.business_is_public(i.business_id));
$$;
create or replace function public.media_is_public(mid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.item_media m
                  where m.id = mid and m.status = 'ready' and not m.removed_by_admin and public.item_is_public(m.item_id));
$$;
create or replace function public.faq_is_public(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.faqs f
                  where f.id = fid and f.visible and f.admin_status = 'ok'
                    and not f.hidden_by_admin and not f.removed_by_admin and public.business_is_public(f.business_id));
$$;
create or replace function public.offer_is_public(oid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.offers o
                  where o.id = oid and o.active and o.admin_status = 'ok'
                    and not o.hidden_by_admin and not o.removed_by_admin and public.business_is_public(o.business_id));
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
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

-- The broad "any admin" policies from 0001 and 0004 would silently cancel the role-aware ones below (policies are
-- OR-ed), so they are removed. Every existing admin row defaults to role 'owner', so no current admin loses access.
drop policy if exists "admin all categories" on public.categories;
drop policy if exists "admin all plans" on public.plans;
drop policy if exists "admin all global limits" on public.global_limits;
drop policy if exists "admin all legal docs" on public.legal_docs;
drop policy if exists "admin all settings" on public.site_settings;
drop policy if exists "admin all applications" on public.applications;
drop policy if exists "admin all documents" on public.application_documents;
drop policy if exists "admin all flags" on public.application_flags;
drop policy if exists "admin all events" on public.application_events;
drop policy if exists "admin all businesses" on public.businesses;
drop policy if exists "admin all items" on public.items;
drop policy if exists "admin all item_media" on public.item_media;
drop policy if exists "admin all faqs" on public.faqs;
drop policy if exists "admin all offers" on public.offers;
drop policy if exists "admin all flags" on public.flags;
drop policy if exists "admin all reports" on public.reports;
drop policy if exists "admin all payments" on public.payments;
drop policy if exists "admin all messages" on public.messages;
drop policy if exists "admin all change_requests" on public.change_requests;
drop policy if exists "admin all admin_notifications" on public.admin_notifications;

-- Public read. Non-tenant reference data is readable by everyone; tenant data is readable by anon only.
-- (Granting it to 'authenticated' as well would show every seller every other seller's rows, and break the seller
-- portal's single-row reads, which rely on row level security returning only the seller's own row.)
drop policy if exists "public read active categories" on public.categories;
create policy "public read active categories" on public.categories for select to anon, authenticated using (active);
drop policy if exists "public read plans" on public.plans;
create policy "public read plans" on public.plans for select to anon, authenticated
  using (exists (select 1 from public.categories c where c.id = category_id and c.active));
drop policy if exists "public read global limits" on public.global_limits;
create policy "public read global limits" on public.global_limits for select to anon, authenticated using (true);
drop policy if exists "public read legal docs" on public.legal_docs;
create policy "public read legal docs" on public.legal_docs for select to anon, authenticated using (true);
drop policy if exists "public read site config" on public.site_config;
create policy "public read site config" on public.site_config for select to anon, authenticated using (true);
drop policy if exists "public read published pages" on public.content_pages;
create policy "public read published pages" on public.content_pages for select to anon, authenticated using (published);

drop policy if exists "public read visible businesses" on public.businesses;
create policy "public read visible businesses" on public.businesses for select to anon using (public.business_is_public(id));
drop policy if exists "public read visible items" on public.items;
create policy "public read visible items" on public.items for select to anon using (public.item_is_public(id));
drop policy if exists "public read visible media" on public.item_media;
create policy "public read visible media" on public.item_media for select to anon using (public.media_is_public(id));
drop policy if exists "public read visible faqs" on public.faqs;
create policy "public read visible faqs" on public.faqs for select to anon using (public.faq_is_public(id));
drop policy if exists "public read offers" on public.offers;
create policy "public read offers" on public.offers for select to anon using (public.offer_is_public(id));

-- Admin, by role.
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
create policy "admin role businesses" on public.businesses for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin role items" on public.items;
create policy "admin role items" on public.items for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin role item media" on public.item_media;
create policy "admin role item media" on public.item_media for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin role faqs" on public.faqs;
create policy "admin role faqs" on public.faqs for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin role offers" on public.offers;
create policy "admin role offers" on public.offers for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin role flags" on public.flags;
create policy "admin role flags" on public.flags for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin role reports" on public.reports;
create policy "admin role reports" on public.reports for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin role payments" on public.payments;
create policy "admin role payments" on public.payments for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin role message templates" on public.message_templates;
create policy "admin role message templates" on public.message_templates for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin role messages" on public.messages;
create policy "admin role messages" on public.messages for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin role notifications" on public.admin_notifications;
create policy "admin role notifications" on public.admin_notifications for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin role site config" on public.site_config;
create policy "admin role site config" on public.site_config for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin role content pages" on public.content_pages;
create policy "admin role content pages" on public.content_pages for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin role change requests" on public.change_requests;
create policy "admin role change requests" on public.change_requests for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Sellers. 0004's own-row policies stay as they are. 0008's broader seller policies are not added: "manage own media"
-- would let a seller insert media rows directly and bypass the plan limits and path checks in attach_item_media().
-- The one change: a seller sees only in-app messages. The same table now holds sms and email rows with addresses,
-- provider ids and costs, and 0004's policy (business_id only) would have exposed them.
drop policy if exists "seller reads own messages" on public.messages;
create policy "seller reads own messages" on public.messages for select to authenticated
  using (business_id = public.my_business_id() and channel = 'in_app');

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
-- Supabase grants anon and authenticated everything on new tables by default; row level security is then the only gate.
-- anon gets nothing on tenant tables except a column list that leaves out internal and private fields.
revoke all on public.businesses, public.items, public.item_media, public.faqs, public.offers, public.flags, public.reports,
  public.payments, public.messages, public.change_requests, public.admin_notifications, public.audit_log,
  public.message_templates, public.site_config, public.content_pages from anon;
grant select (id, slug, name, category_id, plan_key, status, verification_level, featured, featured_until, featured_rank,
              tagline, description, phone, whatsapp, email, socials, amenities, payment_methods, delivery_area, county,
              town, address, lat, lng, logo_path, cover_path, tags, announcement, profile, hours, exceptions, override,
              partial_closures, created_at, updated_at)
  on public.businesses to anon;
grant select (id, business_id, name, item_type, section, short_description, description, price_type, price, price_max,
              unit, sale_price, sale_starts, sale_ends, availability, badge, tags, variants, specs, extra, sort, visible,
              created_at, updated_at)
  on public.items to anon;
grant select (id, item_id, business_id, kind, path, storage_path, poster_path, alt, mime, sort, status, width, height,
              duration_sec, variants, created_at)
  on public.item_media to anon;
grant select (id, business_id, question, answer, sort, visible, created_at, updated_at) on public.faqs to anon;
grant select (id, business_id, title, description, discount_type, discount_value, starts_at, ends_at, item_ids, active,
              created_at, updated_at)
  on public.offers to anon;
grant select on public.site_config, public.content_pages to anon;

grant select, insert, update, delete on public.message_templates, public.site_config, public.content_pages to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant select, usage on sequence public.receipt_seq to service_role;
-- the audit trail is append-only for everyone but the trigger-guarded service role
revoke insert, update, delete, truncate on public.audit_log from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin RPCs
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
    'expiring_7d',        (select count(*) from businesses where status = 'live' and deleted_at is null and paid_until is not null
                             and public.nairobi_day(paid_until) between public.nairobi_today() and public.nairobi_today() + 7),
    'in_grace',           (select count(*) from businesses where status = 'live' and deleted_at is null and paid_until is not null
                             and public.nairobi_day(paid_until) < public.nairobi_today()
                             and public.nairobi_today() <= public.nairobi_day(paid_until) + public.grace_days()),
    'expired',            (select count(*) from businesses where status = 'live' and deleted_at is null and paid_until is not null
                             and public.nairobi_today() > public.nairobi_day(paid_until) + public.grace_days()),
    'suspended',          (select count(*) from businesses where status = 'suspended' and deleted_at is null),
    'open_flags',         (select count(*) from flags where status in ('open','investigating')),
    'open_reports',       (select count(*) from reports where status in ('open','investigating')),
    'unconfirmed_payments', (select count(*) from payments where status = 'submitted'),
    'failed_messages',    (select count(*) from messages where status = 'failed'),
    'pending_changes',    (select count(*) from change_requests where status = 'pending')
  ) else '{}'::jsonb end;
$$;

-- search_path includes extensions so similarity() resolves wherever pg_trgm was installed.
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

create or replace function public.admin_audit_action(p_action text, p_target_type text, p_target_id uuid, p_before jsonb, p_after jsonb, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.audit_log(actor_id, actor_email, action, target_type, target_id, before, after, reason)
  values (auth.uid(), (select email from auth.users where id = auth.uid()), p_action, p_target_type, p_target_id, p_before, p_after, p_reason);
end $$;

-- Listing visibility is a switch between 'live' and 'unlisted' only. It cannot revive a deleted, suspended, expired or
-- never-activated business, and it cannot override a seller's own pause.
create or replace function public.admin_set_business_visibility(p_id uuid, p_visible boolean, p_reason text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare cur text;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select status into cur from public.businesses where id = p_id and deleted_at is null for update;
  if cur is null then raise exception 'not_found'; end if;
  if p_visible and cur = 'unlisted' then
    update public.businesses set status = 'live', status_reason = p_reason where id = p_id;
  elsif not p_visible and cur = 'live' then
    update public.businesses set status = 'unlisted', status_reason = p_reason where id = p_id;
  elsif not ((p_visible and cur = 'live') or (not p_visible and cur = 'unlisted')) then
    raise exception 'invalid_status' using detail = format('visibility cannot be changed while the business is %s', cur);
  end if;
  perform public.write_audit('business.visibility', 'business', p_id,
    jsonb_build_object('status', cur), jsonb_build_object('visible', p_visible, 'reason', p_reason), p_reason);
  return true;
end $$;

create or replace function public.admin_set_flag_status(p_id uuid, p_status text, p_note text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare cur text;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('open','investigating','resolved','dismissed') then
    raise exception 'invalid_status';
  end if;
  select status into cur from public.flags where id = p_id for update;
  if cur is null then raise exception 'not_found'; end if;
  update public.flags
     set status = p_status,
         note = coalesce(p_note, note),
         resolved_at = case when p_status in ('resolved','dismissed') then now() else null end
   where id = p_id;
  perform public.write_audit('flag.status', 'flag', p_id,
    jsonb_build_object('status', cur), jsonb_build_object('status', p_status, 'note', p_note), p_note);
  return true;
end $$;

do $m8$
declare fn text;
begin
  foreach fn in array array[
    'admin_open_application(uuid)', 'admin_return_to_queue(uuid)', 'admin_log_document_view(uuid, text)', 'admin_counts()',
    'admin_search(text, text[], integer)', 'admin_audit_action(text, text, uuid, jsonb, jsonb, text)',
    'admin_set_business_visibility(uuid, boolean, text)', 'admin_set_flag_status(uuid, text, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end $m8$;

-- ---------------------------------------------------------------------------
-- Notifications to admins
-- ---------------------------------------------------------------------------
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
    insert into public.admin_notifications(kind, business_id, title, body, link, data)
    values ('payment_submitted', new.business_id, 'M-Pesa code ' || coalesce(new.mpesa_code, ''), 'KES ' || new.amount, '/admin/payments',
            jsonb_build_object('payment_id', new.id, 'kind', new.kind));
  end if;
  return new;
end $$;
drop trigger if exists t_payment_notify on public.payments;
create trigger t_payment_notify after insert on public.payments
  for each row execute function public.notify_admin_on_payment();

-- ---------------------------------------------------------------------------
-- Realtime: one table at a time (a single multi-table statement fails whole if any one is already a member)
-- ---------------------------------------------------------------------------
do $m8$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['applications','payments','flags','reports','messages','admin_notifications'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $m8$;

-- ---------------------------------------------------------------------------
-- Defaults. Existing values are never overwritten.
-- ---------------------------------------------------------------------------
insert into public.site_settings(key, value) values
  ('grace_days', '1'),
  ('strike_threshold', '3'),
  ('quiet_hours', '{"start":"21:00","end":"07:00"}'),
  ('mpesa', '{"type":"till","number":"","name":"EpicMKT"}')
on conflict (key) do nothing;

-- To make the first admin an owner, run this once in the SQL editor after creating the user in Auth:
--   update public.admins set role = 'owner', email = 'you@example.com', display_name = 'Your Name'
--    where user_id = (select id from auth.users where email = 'you@example.com');
