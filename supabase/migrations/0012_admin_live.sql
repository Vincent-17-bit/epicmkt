-- Admin live data (phase B1): the Businesses table and the Command Center "Live activity" feed.
-- Additive over 0001-0011 and safe to re-run. Every function checks the caller itself (is_admin / has_role),
-- so nothing here is reachable by a seller or by anon.
--
--   admin_businesses_v            one row per business with the derived fields the table needs (state, days left,
--                                 health score, counts). security_invoker, so row-level security still decides.
--   admin_businesses_filtered()   the one place the filters and the search live (rows and tab counts share it).
--   admin_businesses_query()      a page of rows plus the total, already shaped for the admin table.
--   admin_business_tab_counts()   the number on each tab, for the current filters.
--   admin_business_filter_options()  categories, counties/towns and plans that really exist.
--   admin_activity()              the newest real events: notifications and the audit log.

-- ---------------------------------------------------------------------------
-- View: the business row the admin table shows
-- ---------------------------------------------------------------------------
create or replace view public.admin_businesses_v with (security_invoker = true) as
select
  b.id,
  b.seller_id,
  b.slug,
  b.name,
  c.name as category,
  b.county,
  b.town,
  b.owner_name,
  b.phone,
  initcap(b.plan_key) as plan,
  (b.verification_level = 'verified') as verified,
  b.featured,
  (b.deleted_at is not null or b.status = 'deleted') as deleted,
  -- A live business with no paid_until has never been paid for, so it is "pending", not live.
  case when b.status = 'live' and b.paid_until is null then 'pending' else b.status end as ui_status,
  b.paid_until,
  public.nairobi_day(b.paid_until) as paid_day,
  public.days_left(b.paid_until) as days_left,
  -- Same rules as deriveState() in admin/src/lib/status.js: grace is one day, "expiring" is the last 7 days.
  case
    when b.deleted_at is not null or b.status = 'deleted' then 'deleted'
    when b.status <> 'live' then b.status
    when b.paid_until is null then 'pending'
    when public.listing_state(b.paid_until) = 'expired' then 'expired'
    when public.listing_state(b.paid_until) = 'grace' then 'grace'
    when public.days_left(b.paid_until) <= 7 then 'expiring'
    else 'live'
  end as state,
  coalesce(s.items, 0)::int as items,
  coalesce(s.price_age_days, 0)::int as price_age_days,
  coalesce(f.open_flags, 0)::int as open_flags,
  coalesce(r.open_reports, 0)::int as open_reports,
  exists (select 1 from public.payments p where p.business_id = b.id and p.status = 'submitted') as unconfirmed_payment,
  b.strikes,
  b.tags,
  b.last_login_at,
  coalesce(b.last_edit_at, b.updated_at) as last_edit_at,
  b.created_at,
  public.nairobi_day(b.created_at) as created_day,
  -- Profile completeness: eight things a customer would want to see, each worth the same.
  round(100.0 * (
      (coalesce(btrim(b.tagline), '') <> '')::int
    + (coalesce(btrim(b.description), '') <> '')::int
    + (b.logo_path is not null)::int
    + (b.cover_path is not null)::int
    + (coalesce(btrim(b.address), '') <> '')::int
    + (coalesce(btrim(b.whatsapp), '') <> '')::int
    + (b.hours <> '{}'::jsonb)::int
    + (coalesce(s.items, 0) > 0)::int
  ) / 8)::int as completeness,
  coalesce(public.nairobi_today() - public.nairobi_day(b.last_login_at), 30)::int as login_age_days
from public.businesses b
left join public.categories c on c.id = b.category_id
left join lateral (
  select count(*) as items,
         max(public.nairobi_today() - public.nairobi_day(i.price_confirmed_at)) as price_age_days
    from public.items i where i.business_id = b.id
) s on true
left join lateral (
  select count(*) as open_flags from public.flags fl where fl.business_id = b.id and fl.status in ('open', 'replied')
) f on true
left join lateral (
  select count(*) as open_reports from public.reports rp where rp.business_id = b.id and rp.status = 'open'
) r on true;

revoke all on public.admin_businesses_v from public, anon;
grant select on public.admin_businesses_v to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Filters + search (one definition, shared by the rows and the tab counts)
-- ---------------------------------------------------------------------------
-- p_filters uses the same keys as the admin screen: category, county, town, plan, verified, featured, status,
-- daysMin, daysMax, hasFlags, hasUnconfirmed, agent, createdFrom, createdTo. Empty or missing means "no filter".
-- There is no agent column on businesses yet, so "unassigned" matches everything and a named agent matches nothing.
create or replace function public.admin_businesses_filtered(p_filters jsonb default '{}', p_search text default null)
returns setof public.admin_businesses_v
language sql stable security invoker set search_path = public as $$
  select v.*
    from public.admin_businesses_v v
   where public.is_admin()
     and (coalesce(p_filters->>'category', '') = '' or v.category = p_filters->>'category')
     and (coalesce(p_filters->>'county', '')   = '' or v.county   = p_filters->>'county')
     and (coalesce(p_filters->>'town', '')     = '' or v.town     = p_filters->>'town')
     and (coalesce(p_filters->>'plan', '')     = '' or v.plan     = p_filters->>'plan')
     and (coalesce(p_filters->>'verified', '') = '' or v.verified = (p_filters->>'verified' = 'yes'))
     and (coalesce(p_filters->>'featured', '') = '' or v.featured = (p_filters->>'featured' = 'yes'))
     and (coalesce(p_filters->>'status', '')   = '' or v.state    = p_filters->>'status')
     and (coalesce(p_filters->>'daysMin', '') = '' or v.days_left >= (p_filters->>'daysMin')::numeric)
     and (coalesce(p_filters->>'daysMax', '') = '' or v.days_left <= (p_filters->>'daysMax')::numeric)
     and (coalesce(p_filters->>'hasFlags', 'false') <> 'true' or v.open_flags > 0)
     and (coalesce(p_filters->>'hasUnconfirmed', 'false') <> 'true' or v.unconfirmed_payment)
     and (coalesce(p_filters->>'agent', '') in ('', '__none__'))
     and (coalesce(p_filters->>'createdFrom', '') = '' or v.created_day >= (p_filters->>'createdFrom')::date)
     and (coalesce(p_filters->>'createdTo', '')   = '' or v.created_day <= (p_filters->>'createdTo')::date)
     and (btrim(coalesce(p_search, '')) = '' or
          v.name ilike '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
       or v.phone ilike '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
       or v.seller_id ilike '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
       or v.slug ilike '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
       or v.owner_name ilike '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%')
$$;

-- A tab is a set of derived states. "unlisted" has no database status yet, so that tab is simply empty.
create or replace function public.admin_business_in_tab(p_tab text, p_state text, p_open_flags integer)
returns boolean language sql immutable as $$
  select case coalesce(nullif(p_tab, ''), 'all')
    when 'all' then p_state <> 'deleted'
    when 'live' then p_state in ('live', 'expiring', 'grace')
    when 'flagged' then p_open_flags > 0 and p_state <> 'deleted'
    when 'expiring' then p_state = 'expiring'
    when 'grace' then p_state = 'grace'
    when 'expired' then p_state = 'expired'
    when 'paused' then p_state = 'paused'
    when 'suspended' then p_state = 'suspended'
    when 'deleted' then p_state = 'deleted'
    else false
  end
$$;

-- ---------------------------------------------------------------------------
-- A page of businesses: { total, rows: [...] }, rows shaped like the admin table expects
-- ---------------------------------------------------------------------------
create or replace function public.admin_businesses_query(
  p_tab text default 'all', p_search text default null, p_sort text default 'paidUntil', p_dir text default 'asc',
  p_filters jsonb default '{}', p_limit integer default 50, p_offset integer default 0
) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_order text;
  v_dir text := case when lower(coalesce(p_dir, 'asc')) = 'desc' then 'desc' else 'asc' end;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 5000);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total bigint;
  v_rows jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Only these columns can be sorted on: the key is looked up here, never pasted into the query.
  v_order := case p_sort
    when 'name' then 'lower(name)'
    when 'items' then 'items'
    when 'healthScore' then 'health_score'
    when 'lastLogin' then 'last_login_at'
    when 'createdAt' then 'created_at'
    when 'lastEdit' then 'last_edit_at'
    when 'strikes' then 'strikes'
    else 'paid_until'
  end;
  if v_order = 'health_score' then
    v_order := 'round(completeness * 0.35 + greatest(0, least(100, 100 - price_age_days * 2.5)) * 0.25'
            || ' + greatest(0, least(100, 100 - login_age_days * 4)) * 0.25'
            || ' + greatest(0, least(100, 100 - open_reports * 35)) * 0.15)';
  end if;

  select count(*) into v_total
    from public.admin_businesses_filtered(p_filters, p_search) v
   where public.admin_business_in_tab(p_tab, v.state, v.open_flags);

  execute format($q$
    select coalesce(jsonb_agg(r.j order by r.rn), '[]'::jsonb) from (
      select row_number() over (order by %1$s %2$s nulls last, id) as rn,
        jsonb_build_object(
          'id', id, 'sellerId', seller_id, 'slug', slug, 'name', name, 'category', coalesce(category, ''),
          'county', coalesce(county, ''), 'town', coalesce(town, ''), 'ownerName', coalesce(owner_name, ''),
          'phone', coalesce(phone, ''), 'plan', plan, 'verified', verified, 'featured', featured,
          'status', ui_status, 'paidUntil', to_char(paid_day, 'YYYY-MM-DD'), 'items', items,
          'openFlags', open_flags, 'strikes', strikes, 'completeness', completeness,
          'priceAgeDays', price_age_days, 'loginAgeDays', login_age_days, 'openReports', open_reports,
          'healthScore', round(completeness * 0.35 + greatest(0, least(100, 100 - price_age_days * 2.5)) * 0.25
                             + greatest(0, least(100, 100 - login_age_days * 4)) * 0.25
                             + greatest(0, least(100, 100 - open_reports * 35)) * 0.15),
          'lastLogin', last_login_at, 'lastEdit', last_edit_at, 'createdAt', created_at,
          'agent', null, 'tags', to_jsonb(tags), 'deleted', deleted, 'unconfirmedPayment', unconfirmed_payment
        ) as j
      from public.admin_businesses_filtered($1, $2) v
      where public.admin_business_in_tab($3, v.state, v.open_flags)
      order by %1$s %2$s nulls last, id
      limit $4 offset $5
    ) r
  $q$, v_order, v_dir)
  into v_rows
  using p_filters, p_search, p_tab, v_limit, v_offset;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end $$;

-- ---------------------------------------------------------------------------
-- Tab counts for the current filters (search is not applied, like the mock)
-- ---------------------------------------------------------------------------
create or replace function public.admin_business_tab_counts(p_filters jsonb default '{}') returns jsonb
language plpgsql stable security invoker set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'all',       count(*) filter (where public.admin_business_in_tab('all', v.state, v.open_flags)),
      'live',      count(*) filter (where public.admin_business_in_tab('live', v.state, v.open_flags)),
      'expiring',  count(*) filter (where public.admin_business_in_tab('expiring', v.state, v.open_flags)),
      'grace',     count(*) filter (where public.admin_business_in_tab('grace', v.state, v.open_flags)),
      'expired',   count(*) filter (where public.admin_business_in_tab('expired', v.state, v.open_flags)),
      'paused',    count(*) filter (where public.admin_business_in_tab('paused', v.state, v.open_flags)),
      'suspended', count(*) filter (where public.admin_business_in_tab('suspended', v.state, v.open_flags)),
      'unlisted',  0,
      'flagged',   count(*) filter (where public.admin_business_in_tab('flagged', v.state, v.open_flags)),
      'deleted',   count(*) filter (where public.admin_business_in_tab('deleted', v.state, v.open_flags))
    )
    from public.admin_businesses_filtered(p_filters, null) v
  );
end $$;

-- ---------------------------------------------------------------------------
-- Filter dropdowns: only values that exist
-- ---------------------------------------------------------------------------
create or replace function public.admin_business_filter_options() returns jsonb
language plpgsql stable security invoker set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'categories', coalesce((select jsonb_agg(name order by name) from public.categories where active), '[]'::jsonb),
    'counties', coalesce((
      select jsonb_agg(jsonb_build_object('name', county, 'towns', towns) order by county)
        from (select b.county, jsonb_agg(distinct b.town order by b.town) filter (where b.town is not null) as towns
                from public.businesses b where b.county is not null group by b.county) t
    ), '[]'::jsonb),
    'plans', jsonb_build_array('Standard', 'Premium'),
    'agents', '[]'::jsonb
  );
end $$;

-- ---------------------------------------------------------------------------
-- Live activity: the newest real events, newest first
-- ---------------------------------------------------------------------------
-- Two sources, both written by the system itself: admin_notifications (a seller or an applicant did something)
-- and audit_log (an admin or a job did something). Audit rows that a notification already covers are left out
-- so one payment is one line. New applications are shown to owner and reviewer only, like the queue itself.
create or replace function public.admin_activity(p_limit integer default 15) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_limit integer := least(greatest(coalesce(p_limit, 15), 1), 50);
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.at desc, x.id desc) from (
      select * from (
        select 'n:' || n.id::text as id, n.created_at as at, n.kind, n.business_id,
               coalesce(b.name, n.data->>'business_name') as business_name,
               null::text as actor, n.data
          from public.admin_notifications n
          left join public.businesses b on b.id = n.business_id
         where n.kind <> 'application_submitted' or public.has_role(array['owner', 'reviewer'])
        union all
        select 'a:' || a.id::text, a.created_at, a.action, a.business_id, b.name,
               coalesce(a.actor_email, a.actor_role),
               coalesce(a.data, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('reason', a.reason))
          from public.audit_log a
          left join public.businesses b on b.id = a.business_id
         where a.action not in ('payment_submitted', 'change_requested', 'flag_replied', 'deletion_requested')
      ) u
      order by u.at desc, u.id desc
      limit v_limit
    ) x
  ), '[]'::jsonb);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.admin_businesses_filtered(jsonb, text)',
    'public.admin_business_in_tab(text, text, integer)',
    'public.admin_businesses_query(text, text, text, text, jsonb, integer, integer)',
    'public.admin_business_tab_counts(jsonb)',
    'public.admin_business_filter_options()',
    'public.admin_activity(integer)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- The feed updates as things happen: realtime for the audit log (RLS still limits it to admins).
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['audit_log', 'businesses'] loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then null;
      end;
    end loop;
  end if;
end $$;
