-- B3a/B3b: the admin Businesses table and the business detail page.
--
-- Everything here is admin-only. Reads need public.is_admin(); every write goes through a security definer RPC
-- that checks the role, requires a reason where the action is dangerous, and appends audit_log through
-- public.admin_audit_action (never from the browser). The browser role cannot write these tables directly.
--
-- Customer visibility has ONE definition: public.business_is_visible (0008). business_visibility() below only adds the
-- human reason, and a test asserts the two never disagree.

alter table public.businesses
  add column if not exists assigned_agent uuid references auth.users(id) on delete set null;
create index if not exists businesses_assigned_agent_idx on public.businesses (assigned_agent) where assigned_agent is not null;
create index if not exists businesses_deleted_idx on public.businesses (deleted_at) where deleted_at is not null;

-- ---------------------------------------------------------------------------
-- Internal notes (admins only, never shown to sellers or customers)
-- ---------------------------------------------------------------------------
create table if not exists public.business_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_email text,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists business_notes_business_idx on public.business_notes (business_id, pinned desc, created_at desc);
alter table public.business_notes enable row level security;
drop policy if exists "admin read business_notes" on public.business_notes;
create policy "admin read business_notes" on public.business_notes for select to authenticated using (public.is_admin());
revoke all on public.business_notes from public, anon, authenticated;
grant select on public.business_notes to authenticated;
grant all on public.business_notes to service_role;

-- ---------------------------------------------------------------------------
-- Customer visibility: the verdict plus the reason an admin can read out to a seller
-- ---------------------------------------------------------------------------
create or replace function public.business_visibility(b public.businesses) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'visible', public.business_is_visible(b),
    'code', case
      when b.deleted_at is not null or b.status = 'deleted' then 'deleted'
      when b.status = 'pending' then 'pending'
      when b.status = 'suspended' then 'suspended'
      when b.status = 'paused' then 'paused'
      when b.status = 'expired' then 'expired'
      when b.paid_until is null then 'unpaid'
      when public.listing_state(b.paid_until) = 'expired' then 'expired'
      when public.listing_state(b.paid_until) = 'grace' then 'grace'
      else 'visible'
    end,
    'reason', case
      when b.deleted_at is not null or b.status = 'deleted' then 'In the recycle bin. Customers cannot see it.'
      when b.status = 'pending' then 'Not activated yet. Customers cannot see it.'
      when b.status = 'suspended' then 'Suspended by an admin' || coalesce(': ' || b.status_reason, '') || '. Customers cannot see it.'
      when b.status = 'paused' then 'Unlisted' || coalesce(': ' || b.status_reason, '') || '. Customers cannot see it.'
      when b.status = 'expired' then 'The paid month and the day of grace have ended. Customers cannot see it.'
      when b.paid_until is null then 'No payment has been confirmed yet. Customers cannot see it.'
      when public.listing_state(b.paid_until) = 'expired' then 'The paid month and the day of grace have ended. Customers cannot see it.'
      when public.listing_state(b.paid_until) = 'grace' then 'In the day of grace after the paid month. Customers can still see it until it ends.'
      else 'Live and paid. Customers can see it.'
    end);
$$;

-- 0..100: listing (30) + profile (30) + catalogue (20) + recent edits (10) + no open flags (10).
create or replace function public.business_health(b public.businesses) returns integer
language sql stable as $$
  select (
      case when public.business_is_visible(b) then (case when public.listing_state(b.paid_until) = 'grace' then 15 else 30 end) else 0 end
    + (case when nullif(b.logo_path, '') is not null then 8 else 0 end)
    + (case when nullif(b.cover_path, '') is not null then 6 else 0 end)
    + (case when nullif(btrim(coalesce(b.description, '')), '') is not null then 6 else 0 end)
    + (case when nullif(btrim(coalesce(b.tagline, '')), '') is not null then 4 else 0 end)
    + (case when b.hours is not null and b.hours <> '{}'::jsonb then 6 else 0 end)
    + (select case when n >= 5 then 20 when n >= 1 then 10 else 0 end from (select count(*) as n from public.items i where i.business_id = b.id and i.visible) c)
    + (case when b.last_edit_at >= now() - interval '30 days' then 10 when b.last_edit_at >= now() - interval '90 days' then 5 else 0 end)
    + (select greatest(0, 10 - 5 * count(*))::int from public.flags f where f.business_id = b.id and f.status in ('open', 'replied'))
  );
$$;

-- ---------------------------------------------------------------------------
-- The list
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_businesses(
  p_tab text default 'all', p_q text default null, p_filters jsonb default '{}'::jsonb,
  p_sort text default 'name', p_dir text default 'asc', p_limit int default 25, p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_where text;
  v_tab_where text;
  v_order text;
  v_dir text := case when lower(coalesce(p_dir, 'asc')) = 'desc' then 'desc' else 'asc' end;
  v_limit int := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_term text := btrim(coalesce(p_q, ''));
  v_pat text;
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_out jsonb;
  v_counts jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_tab_where := case coalesce(p_tab, 'all')
    when 'all' then 'b.deleted_at is null'
    when 'live' then 'b.status = ''live'' and b.deleted_at is null and b.lstate in (''active'', ''grace'')'
    when 'expiring' then 'b.status = ''live'' and b.deleted_at is null and b.lstate = ''active'' and b.dleft <= 7'
    when 'grace' then 'b.status = ''live'' and b.deleted_at is null and b.lstate = ''grace'''
    when 'expired' then 'b.deleted_at is null and b.status in (''live'', ''expired'') and b.lstate = ''expired'''
    when 'paused' then 'b.deleted_at is null and b.status = ''paused'''
    when 'suspended' then 'b.deleted_at is null and b.status = ''suspended'''
    when 'pending' then 'b.deleted_at is null and b.status = ''pending'''
    when 'featured' then 'b.deleted_at is null and b.featured'
    when 'recycle' then 'b.deleted_at is not null'
    else null end;
  if v_tab_where is null then raise exception 'invalid_tab'; end if;
  v_where := v_tab_where;

  if char_length(v_term) >= 1 then
    v_pat := '%' || replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_where := v_where || format(' and (b.name ilike %1$L or b.slug ilike %1$L or b.seller_id ilike %1$L or b.phone ilike %1$L or b.email ilike %1$L or b.owner_name ilike %1$L or b.town ilike %1$L)', v_pat);
  end if;
  if nullif(f ->> 'plan', '') is not null then v_where := v_where || format(' and b.plan_key = %L', f ->> 'plan'); end if;
  if nullif(f ->> 'category', '') is not null then v_where := v_where || format(' and b.category_id = %L', f ->> 'category'); end if;
  if nullif(f ->> 'town', '') is not null then v_where := v_where || format(' and b.town ilike %L', f ->> 'town'); end if;
  if nullif(f ->> 'verification', '') is not null then v_where := v_where || format(' and b.verification_level = %L', f ->> 'verification'); end if;
  if f ? 'featured' and jsonb_typeof(f -> 'featured') = 'boolean' then v_where := v_where || format(' and b.featured = %L::boolean', f ->> 'featured'); end if;
  if nullif(f ->> 'tag', '') is not null then v_where := v_where || format(' and %L = any(b.tags)', f ->> 'tag'); end if;
  if nullif(f ->> 'agent', '') is not null then v_where := v_where || format(' and b.assigned_agent = %L::uuid', f ->> 'agent'); end if;
  if nullif(f ->> 'unassigned', '') is not null and (f ->> 'unassigned') = 'true' then v_where := v_where || ' and b.assigned_agent is null'; end if;
  if nullif(f ->> 'minHealth', '') is not null then v_where := v_where || format(' and b.health >= %s', (f ->> 'minHealth')::int); end if;
  if nullif(f ->> 'maxHealth', '') is not null then v_where := v_where || format(' and b.health <= %s', (f ->> 'maxHealth')::int); end if;
  if nullif(f ->> 'paidFrom', '') is not null then v_where := v_where || format(' and b.paid_until >= public.nairobi_midnight(%L::date)', f ->> 'paidFrom'); end if;
  if nullif(f ->> 'paidTo', '') is not null then v_where := v_where || format(' and b.paid_until < public.nairobi_midnight(%L::date + 1)', f ->> 'paidTo'); end if;
  if nullif(f ->> 'hasFlags', '') is not null and (f ->> 'hasFlags') = 'true' then v_where := v_where || ' and b.open_flags > 0'; end if;

  v_order := case coalesce(p_sort, 'name')
    when 'name' then 'lower(b.name) ' || v_dir
    when 'paid_until' then 'b.paid_until ' || v_dir || ' nulls last'
    when 'health' then 'b.health ' || v_dir
    when 'town' then 'lower(b.town) ' || v_dir || ' nulls last'
    when 'created_at' then 'b.created_at ' || v_dir
    when 'last_login_at' then 'b.last_login_at ' || v_dir || ' nulls last'
    when 'open_flags' then 'b.open_flags ' || v_dir
    else null end;
  if v_order is null then raise exception 'invalid_sort'; end if;
  v_order := v_order || ', b.id';

  execute format($q$
    with b as (
      select x.*, public.listing_state(x.paid_until) as lstate, public.days_left(x.paid_until) as dleft,
             public.business_health(x) as health, public.business_visibility(x) as visibility,
             (select count(*) from public.flags fl where fl.business_id = x.id and fl.status in ('open', 'replied'))::int as open_flags
        from public.businesses x
    ), filtered as (select * from b where %s)
    select jsonb_build_object(
      'total', (select count(*) from filtered),
      'rows', coalesce((select jsonb_agg(r) from (
        select b.id, b.name, b.slug, b.seller_id, b.status, b.status_reason, b.plan_key, b.category_id, b.town, b.phone, b.email,
               b.owner_name, b.paid_until, b.dleft as days_left, b.lstate as listing_state, b.verification_level, b.featured,
               b.tags, b.assigned_agent, b.health, b.open_flags, b.strikes, b.deleted_at, b.last_login_at, b.created_at,
               b.visibility
          from filtered b order by %s limit %s offset %s) r), '[]'::jsonb))
  $q$, v_where, v_order, v_limit, v_offset) into v_out;

  select jsonb_build_object(
    'all', count(*) filter (where deleted_at is null),
    'live', count(*) filter (where status = 'live' and deleted_at is null and lstate in ('active', 'grace')),
    'expiring', count(*) filter (where status = 'live' and deleted_at is null and lstate = 'active' and dleft <= 7),
    'grace', count(*) filter (where status = 'live' and deleted_at is null and lstate = 'grace'),
    'expired', count(*) filter (where deleted_at is null and status in ('live', 'expired') and lstate = 'expired'),
    'paused', count(*) filter (where deleted_at is null and status = 'paused'),
    'suspended', count(*) filter (where deleted_at is null and status = 'suspended'),
    'pending', count(*) filter (where deleted_at is null and status = 'pending'),
    'featured', count(*) filter (where deleted_at is null and featured),
    'recycle', count(*) filter (where deleted_at is not null))
    into v_counts
    from (select x.status, x.deleted_at, x.featured, public.listing_state(x.paid_until) as lstate, public.days_left(x.paid_until) as dleft
            from public.businesses x) b;

  return v_out || jsonb_build_object('counts', v_counts);
end $$;
revoke all on function public.admin_list_businesses(text, text, jsonb, text, text, int, int) from public, anon;
grant execute on function public.admin_list_businesses(text, text, jsonb, text, text, int, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The detail page
-- ---------------------------------------------------------------------------
create or replace function public.admin_business_detail(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  b public.businesses;
  v_cat text;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into b from public.businesses where id = p_id;
  if not found then raise exception 'not_found'; end if;
  select name into v_cat from public.categories where id = b.category_id;
  return jsonb_build_object(
    'business', jsonb_build_object(
      'id', b.id, 'seller_id', b.seller_id, 'slug', b.slug, 'name', b.name,
      'category_id', b.category_id, 'category_name', v_cat, 'plan_key', b.plan_key,
      'status', b.status, 'status_reason', b.status_reason, 'verification_level', b.verification_level,
      'featured', b.featured, 'featured_until', b.featured_until, 'featured_rank', b.featured_rank,
      'paid_until', b.paid_until, 'first_paid_at', b.first_paid_at, 'monthly_price', b.monthly_price,
      'tagline', b.tagline, 'description', b.description, 'phone', b.phone, 'whatsapp', b.whatsapp, 'email', b.email,
      'owner_name', b.owner_name, 'county', b.county, 'town', b.town, 'address', b.address, 'lat', b.lat, 'lng', b.lng,
      'delivery_area', b.delivery_area, 'socials', b.socials, 'amenities', b.amenities, 'payment_methods', b.payment_methods,
      'tags', to_jsonb(b.tags), 'announcement', b.announcement, 'logo_path', b.logo_path, 'cover_path', b.cover_path,
      'hours', b.hours, 'exceptions', b.exceptions, 'partial_closures', b.partial_closures, 'override', b.override,
      'strikes', b.strikes, 'must_change_password', b.must_change_password, 'assigned_agent', b.assigned_agent,
      'application_id', b.application_id, 'last_login_at', b.last_login_at, 'last_edit_at', b.last_edit_at,
      'created_at', b.created_at, 'updated_at', b.updated_at, 'deleted_at', b.deleted_at),
    'listing_state', public.listing_state(b.paid_until),
    'days_left', public.days_left(b.paid_until),
    'visibility', public.business_visibility(b),
    'health', public.business_health(b),
    'counts', jsonb_build_object(
      'items', (select count(*) from public.items i where i.business_id = b.id),
      'faqs', (select count(*) from public.faqs f where f.business_id = b.id),
      'offers', (select count(*) from public.offers o where o.business_id = b.id),
      'open_flags', (select count(*) from public.flags f where f.business_id = b.id and f.status in ('open', 'replied')),
      'open_reports', (select count(*) from public.reports r where r.business_id = b.id and r.status = 'open'),
      'unconfirmed_payments', (select count(*) from public.payments p where p.business_id = b.id and p.status = 'submitted'),
      'pending_changes', (select count(*) from public.change_requests c where c.business_id = b.id and c.status = 'pending')));
end $$;
revoke all on function public.admin_business_detail(uuid) from public, anon;
grant execute on function public.admin_business_detail(uuid) to authenticated, service_role;

-- One reader for the lazy tabs. Documents list metadata only: storage paths are never returned, and opening a file goes
-- through the existing application review flow (admin_log_document_view).
create or replace function public.admin_business_tab(p_id uuid, p_tab text, p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  b public.businesses;
  v_out jsonb;
  v_staff jsonb;
  v_slots jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into b from public.businesses where id = p_id;
  if not found then raise exception 'not_found'; end if;

  if p_tab = 'payments' then
    select coalesce(jsonb_agg(r), '[]'::jsonb) into v_out from (
      select p.id, p.mpesa_code, p.receipt_no, p.amount_kes, p.months, p.status, p.kind, p.plan_key, p.method, p.phone,
             p.decline_reason, p.submitted_at, p.confirmed_at, p.created_at
        from public.payments p where p.business_id = p_id
       order by coalesce(p.submitted_at, p.created_at) desc limit v_limit) r;
  elsif p_tab = 'messages' then
    select coalesce(jsonb_agg(r), '[]'::jsonb) into v_out from (
      select m.id, m.channel, m.status, m.subject, m.body, m.template_key, m.to_address, m.error, m.attempts, m.sent_at, m.created_at
        from public.messages m where m.business_id = p_id
       order by m.created_at desc limit v_limit) r;
  elsif p_tab = 'activity' then
    select coalesce(jsonb_agg(r), '[]'::jsonb) into v_out from (
      select a.id, a.action, a.actor_role, a.actor_email, a.reason, a.before, a.after, a.data, a.created_at
        from public.audit_log a
       where a.business_id = p_id or (a.target_type = 'business' and a.target_id = p_id::text)
       order by a.created_at desc, a.id desc limit v_limit) r;
  elsif p_tab = 'documents' then
    select jsonb_build_object(
      'application_id', b.application_id,
      'reference_no', (select a.reference_no from public.applications a where a.id = b.application_id),
      'documents', coalesce((select jsonb_agg(r) from (
        select d.id, d.slot_key, d.original_name, d.mime, d.size_bytes, d.verified, d.created_at
          from public.application_documents d where d.application_id = b.application_id
         order by d.slot_key) r), '[]'::jsonb)) into v_out;
  elsif p_tab = 'notes' then
    select coalesce(jsonb_agg(r), '[]'::jsonb) into v_out from (
      select n.id, n.body, n.pinned, n.author_email, n.created_at
        from public.business_notes n where n.business_id = p_id
       order by n.pinned desc, n.created_at desc limit v_limit) r;
  elsif p_tab = 'team' then
    -- staff_members / timetable_slots arrive with the seller team feature. Until then the tab is simply empty.
    v_staff := '[]'::jsonb;
    v_slots := '[]'::jsonb;
    if to_regclass('public.staff_members') is not null then
      execute 'select coalesce(jsonb_agg(to_jsonb(s) order by s.sort, s.created_at), ''[]''::jsonb) from public.staff_members s where s.business_id = $1'
        into v_staff using p_id;
    end if;
    if to_regclass('public.timetable_slots') is not null then
      execute 'select coalesce(jsonb_agg(to_jsonb(t) order by t.day_of_week, t.start_time), ''[]''::jsonb) from public.timetable_slots t where t.business_id = $1'
        into v_slots using p_id;
    end if;
    v_out := jsonb_build_object('staff', v_staff, 'timetable', v_slots);
  else
    raise exception 'invalid_tab';
  end if;
  return v_out;
end $$;
revoke all on function public.admin_business_tab(uuid, text, int) from public, anon;
grant execute on function public.admin_business_tab(uuid, text, int) to authenticated, service_role;
