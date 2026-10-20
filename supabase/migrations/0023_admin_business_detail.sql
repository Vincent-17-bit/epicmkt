-- 0023_admin_business_detail.sql
-- The business detail page: one read function per tab, hiding a single item (moderation), and internal notes.
-- (Hiding an item tells the seller through the existing items trigger, so this file does not message them.)
--
-- Reads are security definer functions so the page works for every admin role without opening whole tables.
-- Roles follow the rest of the admin: any admin may read a business, its payments and its activity; flags,
-- reports and items are owner, reviewer or support (the people who moderate); finance does not see them.
-- Every change writes the audit log through public.admin_audit_action(). Safe to run more than once.

-- ---------------------------------------------------------------------------
-- Internal notes (only admins ever see these)
-- ---------------------------------------------------------------------------
create table if not exists public.business_notes (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  author_id    uuid default auth.uid(),
  author_email text,
  body         text not null check (char_length(btrim(body)) between 1 and 2000),
  pinned       boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists business_notes_business_idx on public.business_notes (business_id, pinned desc, created_at desc);
alter table public.business_notes enable row level security;
revoke all on public.business_notes from anon, authenticated;
-- No policies: the table is reached only through the functions below.

-- ---------------------------------------------------------------------------
-- Overview
-- ---------------------------------------------------------------------------
create or replace function public.admin_business_detail(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  b public.businesses;
  v jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into b from public.businesses where id = p_id;
  if not found then raise exception 'not_found'; end if;

  v := jsonb_build_object(
    'business', jsonb_build_object(
      'id', b.id, 'seller_id', b.seller_id, 'slug', b.slug, 'name', b.name, 'category_id', b.category_id,
      'category_name', (select c.name from public.categories c where c.id = b.category_id),
      'plan_key', b.plan_key, 'status', b.status, 'status_reason', b.status_reason,
      'verification_level', b.verification_level, 'featured', b.featured, 'featured_until', b.featured_until,
      'paid_until', b.paid_until, 'first_paid_at', b.first_paid_at, 'monthly_price', b.monthly_price,
      'credit_kes', b.credit_kes, 'strikes', b.strikes, 'tags', to_jsonb(b.tags),
      'tagline', b.tagline, 'description', b.description, 'owner_name', b.owner_name,
      'phone', b.phone, 'whatsapp', b.whatsapp, 'email', b.email,
      'county', b.county, 'town', b.town, 'address', b.address,
      'last_login_at', b.last_login_at, 'last_edit_at', b.last_edit_at,
      'application_id', b.application_id, 'deleted_at', b.deleted_at, 'created_at', b.created_at
    )
  );

  v := v || jsonb_build_object('stats', jsonb_build_object(
    'items', (select count(*) from public.items i where i.business_id = p_id and not i.draft),
    'items_hidden', (select count(*) from public.items i where i.business_id = p_id and i.hidden_by_admin),
    'open_flags', (select count(*) from public.flags f where f.business_id = p_id and f.status = 'open'),
    'open_reports', (select count(*) from public.reports r where r.business_id = p_id and r.status = 'open'),
    'paid_total_kes', coalesce((select sum(amount_kes) from public.payments p where p.business_id = p_id and p.status = 'confirmed'), 0),
    'payments_waiting', (select count(*) from public.payments p where p.business_id = p_id and p.status in ('submitted', 'awaiting_confirmation', 'needs_assignment')),
    'last_payment_at', (select max(confirmed_at) from public.payments p where p.business_id = p_id and p.status = 'confirmed')
  ));
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Payments tab
-- ---------------------------------------------------------------------------
create or replace function public.admin_business_payments(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.businesses where id = p_id) then raise exception 'not_found'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
    from (
      select p.id, p.created_at, p.amount_kes, p.status, p.kind, p.mpesa_code, p.receipt_no, p.period_end,
             p.months, p.source, p.decline_reason, p.plan_key
      from public.payments p where p.business_id = p_id
      order by p.created_at desc limit 100
    ) x
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Activity tab (the audit log, for this business)
-- ---------------------------------------------------------------------------
create or replace function public.admin_business_activity(p_id uuid, p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.businesses where id = p_id) then raise exception 'not_found'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
    from (
      select a.id, a.created_at, a.action, a.actor_email, a.actor_role, a.target_type, a.reason
      from public.audit_log a where a.business_id = p_id
      order by a.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) x
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Items tab and hiding one item
-- ---------------------------------------------------------------------------
create or replace function public.admin_business_items(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(array['owner', 'reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.businesses where id = p_id) then raise exception 'not_found'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
    from (
      select i.id, i.name, i.section, i.price, i.price_type, i.sale_price, i.availability, i.visible, i.draft,
             i.hidden_by_admin, i.admin_hide_reason, i.created_at
      from public.items i where i.business_id = p_id
      order by i.created_at desc limit 500
    ) x
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_set_item_hidden(p_id uuid, p_hidden boolean, p_reason text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  it public.items;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.has_role(array['owner', 'reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into it from public.items where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if p_hidden and (v_reason is null or char_length(v_reason) < 5) then raise exception 'reason_required'; end if;
  if it.hidden_by_admin = p_hidden then return true; end if; -- already in that state: nothing to do, nothing to audit

  update public.items
     set hidden_by_admin = p_hidden, admin_hide_reason = case when p_hidden then v_reason else null end
   where id = p_id;

  perform public.admin_audit_action(case when p_hidden then 'item.hide' else 'item.unhide' end, 'item', p_id::text,
    jsonb_build_object('hidden_by_admin', it.hidden_by_admin), jsonb_build_object('hidden_by_admin', p_hidden), v_reason, it.business_id);

  -- The seller is told by the existing trigger t_items_removal_notify (notify_on_removal), so nothing is posted here.
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- Flags and reports tab
-- ---------------------------------------------------------------------------
create or replace function public.admin_business_flags(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(array['owner', 'reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.businesses where id = p_id) then raise exception 'not_found'; end if;
  return jsonb_build_object(
    'flags', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select f.id, f.reason, f.status, f.seller_message, f.seller_reply, f.replied_at, f.due_at, f.created_at, f.resolved_at,
               f.item_id, (select i.name from public.items i where i.id = f.item_id) as item_name
        from public.flags f where f.business_id = p_id order by f.created_at desc limit 100
      ) x
    ), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select r.id, r.reason, r.details, r.status, r.created_at, r.item_id,
               (select i.name from public.items i where i.id = r.item_id) as item_name
        from public.reports r where r.business_id = p_id order by r.created_at desc limit 100
      ) x
    ), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Notes tab
-- ---------------------------------------------------------------------------
create or replace function public.admin_business_notes(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.businesses where id = p_id) then raise exception 'not_found'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.pinned desc, x.created_at desc)
    from (
      select n.id, n.body, n.pinned, n.author_email, n.created_at
      from public.business_notes n where n.business_id = p_id
      order by n.pinned desc, n.created_at desc limit 200
    ) x
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_add_business_note(p_id uuid, p_body text, p_pinned boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
  v_email text;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.businesses where id = p_id) then raise exception 'not_found'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then raise exception 'invalid_input'; end if;
  select email into v_email from public.admins where user_id = auth.uid();
  insert into public.business_notes (business_id, author_id, author_email, body, pinned)
  values (p_id, auth.uid(), v_email, v_body, coalesce(p_pinned, false)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_set_business_note_pinned(p_note_id uuid, p_pinned boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.business_notes set pinned = coalesce(p_pinned, false) where id = p_note_id;
  if not found then raise exception 'not_found'; end if;
  return true;
end $$;

-- A note can be removed by its author, or by the owner.
create or replace function public.admin_delete_business_note(p_note_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare n public.business_notes;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into n from public.business_notes where id = p_note_id;
  if not found then raise exception 'not_found'; end if;
  if n.author_id is distinct from auth.uid() and not public.has_role(array['owner']) then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.business_notes where id = p_note_id;
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- Who may call what: signed-in users only; each function checks the admin role itself.
-- ---------------------------------------------------------------------------
revoke all on function public.admin_business_detail(uuid), public.admin_business_payments(uuid),
  public.admin_business_activity(uuid, integer), public.admin_business_items(uuid),
  public.admin_set_item_hidden(uuid, boolean, text), public.admin_business_flags(uuid),
  public.admin_business_notes(uuid), public.admin_add_business_note(uuid, text, boolean),
  public.admin_set_business_note_pinned(uuid, boolean), public.admin_delete_business_note(uuid)
  from public, anon;
grant execute on function public.admin_business_detail(uuid), public.admin_business_payments(uuid),
  public.admin_business_activity(uuid, integer), public.admin_business_items(uuid),
  public.admin_set_item_hidden(uuid, boolean, text), public.admin_business_flags(uuid),
  public.admin_business_notes(uuid), public.admin_add_business_note(uuid, text, boolean),
  public.admin_set_business_note_pinned(uuid, boolean), public.admin_delete_business_note(uuid)
  to authenticated, service_role;
