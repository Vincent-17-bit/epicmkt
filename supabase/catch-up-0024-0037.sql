-- EpicMKT: bring the admin database up to date (migrations 0024 to 0037).
-- Fixes: Expiry Radar, Settings, Plans and Categories failing with
--   "Could not find the function public.admin_... in the schema cache".
-- Safe to run more than once: these migrations only create or replace, add if missing, or skip if present.
-- Run it in the Supabase SQL editor (or `psql`) on the project the admin site points to.

-- Preflight: the base schema (migrations 0001 to 0023) must already be there.
do $$
declare v_missing text;
begin
  select string_agg(x, ', ') into v_missing from unnest(array[
    'public.is_admin()', 'public.has_role(text[])', 'public.my_business_id()', 'public.days_left(timestamptz, timestamptz)',
    'public.nairobi_day(timestamptz)', 'public.post_seller_message(uuid, text, text, text, jsonb, text)'
  ]) x where to_regprocedure(x) is null;
  if v_missing is not null or to_regclass('public.site_settings') is null or to_regclass('public.messages') is null
     or to_regclass('public.change_requests') is null or to_regclass('public.admins') is null then
    raise exception 'Base schema incomplete (missing: %). Apply migrations 0001 to 0023 first (supabase db push).', coalesce(v_missing, 'tables');
  end if;
end $$;

-- ============================================================
-- 0024_admin_moderation_approvals.sql
-- ============================================================
-- 0024_admin_moderation_approvals.sql
-- B3c Moderation, flags and catalogue; B4b Expiry Radar; B4c Approvals (seller change requests).
--
-- Same rules as 0023: reads and writes go through security definer functions that check the admin role
-- themselves, every change writes the audit log through public.admin_audit_action(), and the file is safe to
-- run more than once.
--   moderation, catalogue : owner, reviewer, support
--   approvals             : owner, reviewer
--   expiry radar          : any admin (finance chases renewals too)

-- ---------------------------------------------------------------------------
-- Moderation: flags (questions we put to a seller) and reports (from customers)
-- ---------------------------------------------------------------------------
create or replace function public.admin_flags_query(
  p_status text default 'open', p_search text default null, p_limit integer default 50, p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_total bigint;
  v_rows jsonb;
begin
  if not public.has_role(array['owner', 'reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status is not null and p_status not in ('all', 'open', 'replied', 'resolved') then raise exception 'invalid_status'; end if;

  select count(*) into v_total
    from public.flags f join public.businesses b on b.id = f.business_id
   where (coalesce(p_status, 'all') = 'all' or f.status = p_status)
     and (v_search is null or b.name ilike '%' || v_search || '%' or f.reason ilike '%' || v_search || '%');

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) into v_rows from (
    select f.id, f.business_id, b.name as business_name, f.item_id, i.name as item_name, f.reason, f.status,
           f.seller_message, f.seller_reply, f.replied_at, f.due_at, f.created_at, f.resolved_at,
           (f.status <> 'resolved' and f.due_at is not null and f.due_at < now()) as overdue
      from public.flags f
      join public.businesses b on b.id = f.business_id
      left join public.items i on i.id = f.item_id
     where (coalesce(p_status, 'all') = 'all' or f.status = p_status)
       and (v_search is null or b.name ilike '%' || v_search || '%' or f.reason ilike '%' || v_search || '%')
     order by f.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
  ) x;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end $$;

create or replace function public.admin_reports_query(
  p_status text default 'open', p_search text default null, p_limit integer default 50, p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_total bigint;
  v_rows jsonb;
begin
  if not public.has_role(array['owner', 'reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status is not null and p_status not in ('all', 'open', 'reviewed', 'dismissed') then raise exception 'invalid_status'; end if;

  select count(*) into v_total
    from public.reports r join public.businesses b on b.id = r.business_id
   where (coalesce(p_status, 'all') = 'all' or r.status = p_status)
     and (v_search is null or b.name ilike '%' || v_search || '%' or r.reason ilike '%' || v_search || '%');

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) into v_rows from (
    select r.id, r.business_id, b.name as business_name, r.item_id, i.name as item_name, r.reason, r.details, r.status, r.created_at,
           -- How many times this business was reported (open ones): a pile-up is the signal that matters.
           (select count(*) from public.reports o where o.business_id = r.business_id and o.status = 'open') as open_for_business
      from public.reports r
      join public.businesses b on b.id = r.business_id
      left join public.items i on i.id = r.item_id
     where (coalesce(p_status, 'all') = 'all' or r.status = p_status)
       and (v_search is null or b.name ilike '%' || v_search || '%' or r.reason ilike '%' || v_search || '%')
     order by r.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
  ) x;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end $$;

create or replace function public.admin_moderation_counts() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(array['owner', 'reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'flags_open',    (select count(*) from public.flags where status = 'open'),
    'flags_replied', (select count(*) from public.flags where status = 'replied'),
    'flags_overdue', (select count(*) from public.flags where status <> 'resolved' and due_at is not null and due_at < now()),
    'reports_open',  (select count(*) from public.reports where status = 'open'),
    'items_hidden',  (select count(*) from public.items where hidden_by_admin)
  );
end $$;

create or replace function public.admin_set_report_status(p_id uuid, p_status text, p_note text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare cur text; biz uuid;
begin
  if not public.has_role(array['owner', 'reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('open', 'reviewed', 'dismissed') then raise exception 'invalid_status'; end if;
  select status, business_id into cur, biz from public.reports where id = p_id for update;
  if cur is null then raise exception 'not_found'; end if;
  if cur = p_status then return true; end if;
  update public.reports set status = p_status where id = p_id;
  perform public.admin_audit_action('report.status', 'report', p_id::text,
    jsonb_build_object('status', cur), jsonb_build_object('status', p_status), nullif(btrim(coalesce(p_note, '')), ''), biz);
  return true;
end $$;

-- Put a question to a seller about the business or one of its items. The existing trigger on flags tells the
-- seller (notify_on_flag_question), so nothing is posted here.
create or replace function public.admin_raise_flag(
  p_business uuid, p_item uuid, p_reason text, p_message text, p_due_days integer default 3
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_message text := btrim(coalesce(p_message, ''));
  v_id uuid;
begin
  if not public.has_role(array['owner', 'reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.businesses where id = p_business) then raise exception 'not_found'; end if;
  if p_item is not null and not exists (select 1 from public.items where id = p_item and business_id = p_business) then
    raise exception 'not_found';
  end if;
  if char_length(v_reason) not between 3 and 500 or char_length(v_message) not between 3 and 500 then raise exception 'invalid_input'; end if;
  if coalesce(p_due_days, 3) not between 1 and 30 then raise exception 'invalid_input'; end if;

  insert into public.flags (business_id, item_id, reason, seller_message, due_at, created_by)
  values (p_business, p_item, v_reason, v_message, now() + make_interval(days => coalesce(p_due_days, 3)), auth.uid())
  returning id into v_id;
  perform public.admin_audit_action('flag.raise', 'flag', v_id::text, null,
    jsonb_build_object('item_id', p_item, 'due_days', coalesce(p_due_days, 3)), v_reason, p_business);
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Catalogue: every item across every business
-- ---------------------------------------------------------------------------
create or replace function public.admin_catalog_query(
  p_search text default null, p_state text default 'all', p_category text default null,
  p_limit integer default 50, p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_category text := nullif(btrim(coalesce(p_category, '')), '');
  v_total bigint;
  v_rows jsonb;
begin
  if not public.has_role(array['owner', 'reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(p_state, 'all') not in ('all', 'visible', 'hidden', 'flagged', 'draft') then raise exception 'invalid_state'; end if;

  select count(*) into v_total
    from public.items i join public.businesses b on b.id = i.business_id
   where (v_search is null or i.name ilike '%' || v_search || '%' or b.name ilike '%' || v_search || '%')
     and (v_category is null or b.category_id = v_category)
     and case coalesce(p_state, 'all')
           when 'hidden'  then i.hidden_by_admin
           when 'draft'   then i.draft
           when 'visible' then i.visible and not i.draft and not i.hidden_by_admin
           when 'flagged' then exists (select 1 from public.flags f where f.item_id = i.id and f.status <> 'resolved')
                            or exists (select 1 from public.reports r where r.item_id = i.id and r.status = 'open')
           else true end;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) into v_rows from (
    select i.id, i.name, i.section, i.price, i.price_type, i.sale_price, i.availability, i.visible, i.draft,
           i.hidden_by_admin, i.admin_hide_reason, i.created_at,
           b.id as business_id, b.name as business_name, b.category_id,
           (select count(*) from public.flags f where f.item_id = i.id and f.status <> 'resolved') as open_flags,
           (select count(*) from public.reports r where r.item_id = i.id and r.status = 'open') as open_reports
      from public.items i join public.businesses b on b.id = i.business_id
     where (v_search is null or i.name ilike '%' || v_search || '%' or b.name ilike '%' || v_search || '%')
       and (v_category is null or b.category_id = v_category)
       and case coalesce(p_state, 'all')
             when 'hidden'  then i.hidden_by_admin
             when 'draft'   then i.draft
             when 'visible' then i.visible and not i.draft and not i.hidden_by_admin
             when 'flagged' then exists (select 1 from public.flags f where f.item_id = i.id and f.status <> 'resolved')
                              or exists (select 1 from public.reports r where r.item_id = i.id and r.status = 'open')
             else true end
     order by i.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
  ) x;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end $$;

-- Hide or show up to 100 items in one go. Each one is audited and the seller told, exactly as for a single item.
create or replace function public.admin_bulk_set_items_hidden(p_ids uuid[], p_hidden boolean, p_reason text default null) returns integer
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_n integer := 0;
begin
  if not public.has_role(array['owner', 'reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 or array_length(p_ids, 1) > 100 then raise exception 'invalid_input'; end if;
  for v_id in select distinct unnest(p_ids) loop
    perform public.admin_set_item_hidden(v_id, p_hidden, p_reason);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ---------------------------------------------------------------------------
-- Approvals: the changes sellers ask for (name, category, phone, town, PIN, licence)
-- ---------------------------------------------------------------------------
create or replace function public.admin_change_requests_query(
  p_status text default 'pending', p_limit integer default 50, p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_total bigint; v_rows jsonb;
begin
  if not public.has_role(array['owner', 'reviewer']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status is not null and p_status not in ('all', 'pending', 'approved', 'rejected', 'cancelled') then raise exception 'invalid_status'; end if;

  select count(*) into v_total from public.change_requests c where coalesce(p_status, 'all') = 'all' or c.status = p_status;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) into v_rows from (
    select c.id, c.business_id, b.name as business_name, c.field, c.old_value, c.new_value, c.status, c.admin_note,
           c.decided_at, c.created_at, c.extra_due_kes, c.new_monthly_price, c.applies_from_next_renewal,
           -- Category ids are slugs: show the names next to them.
           case when c.field = 'category_id' then (select name from public.categories where id = c.old_value) end as old_label,
           case when c.field = 'category_id' then (select name from public.categories where id = c.new_value) end as new_label
      from public.change_requests c join public.businesses b on b.id = c.business_id
     where coalesce(p_status, 'all') = 'all' or c.status = p_status
     order by (c.status = 'pending') desc, c.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
  ) x;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end $$;

create or replace function public.admin_decide_change_request(p_id uuid, p_approve boolean, p_note text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  c public.change_requests;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_label text;
begin
  if not public.has_role(array['owner', 'reviewer']) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from public.change_requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if c.status <> 'pending' then raise exception 'already_decided'; end if;
  if not coalesce(p_approve, false) and (v_note is null or char_length(v_note) < 5) then raise exception 'reason_required'; end if;

  if p_approve then
    case c.field
      when 'name'        then update public.businesses set name = c.new_value where id = c.business_id;
      when 'phone'       then update public.businesses set phone = c.new_value where id = c.business_id;
      when 'town'        then update public.businesses set town = c.new_value where id = c.business_id;
      when 'pin'         then update public.businesses set pin = c.new_value where id = c.business_id;
      when 'licence'     then update public.businesses set licence = c.new_value where id = c.business_id;
      when 'category_id' then
        if not exists (select 1 from public.categories where id = c.new_value and active) then raise exception 'invalid_category'; end if;
        update public.businesses set category_id = c.new_value where id = c.business_id;
      else raise exception 'invalid_field';
    end case;
  end if;

  update public.change_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         admin_note = v_note, decided_by = auth.uid(), decided_at = now()
   where id = p_id;

  perform public.admin_audit_action(case when p_approve then 'change.approve' else 'change.reject' end, 'change_request', p_id::text,
    jsonb_build_object('field', c.field, 'value', c.old_value), jsonb_build_object('field', c.field, 'value', c.new_value), v_note, c.business_id);

  v_label := case c.field when 'category_id' then 'category' when 'pin' then 'PIN' else c.field end;
  perform public.post_seller_message(c.business_id, 'change',
    case when p_approve then 'Your ' || v_label || ' change was approved' else 'Your ' || v_label || ' change was not approved' end,
    case when p_approve then 'The new ' || v_label || ' is now on your listing.'
         else 'We could not approve the change to your ' || v_label || '. ' || v_note end,
    jsonb_build_object('change_request_id', p_id, 'field', c.field), 'change:' || p_id::text);
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- Expiry Radar: who is about to lapse, in grace, or just lapsed
-- ---------------------------------------------------------------------------
create or replace function public.admin_expiry_radar(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_days integer := least(greatest(coalesce(p_days, 30), 1), 90);
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.paid_until asc)
    from (
      select b.id, b.name, b.category_id, b.plan_key, b.phone, b.whatsapp, b.monthly_price, b.paid_until, b.status,
             public.days_left(b.paid_until) as days_left,
             public.listing_state(b.paid_until) as state,
             (select max(p.confirmed_at) from public.payments p where p.business_id = b.id and p.status = 'confirmed') as last_payment_at,
             (select max(m.created_at) from public.messages m
               where m.business_id = b.id and m.kind in ('reminder', 'grace', 'expiry')) as last_reminder_at,
             exists (select 1 from public.payments p where p.business_id = b.id and p.status in ('submitted', 'awaiting_confirmation', 'needs_assignment')) as payment_waiting
        from public.businesses b
       where b.status in ('live', 'expired') and b.deleted_at is null and b.paid_until is not null
         and public.days_left(b.paid_until) <= v_days
         and public.days_left(b.paid_until) >= -30
    ) x
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Who may call what: signed-in users only; each function checks the admin role itself.
-- ---------------------------------------------------------------------------
revoke all on function public.admin_flags_query(text, text, integer, integer), public.admin_reports_query(text, text, integer, integer),
  public.admin_moderation_counts(), public.admin_set_report_status(uuid, text, text),
  public.admin_raise_flag(uuid, uuid, text, text, integer),
  public.admin_catalog_query(text, text, text, integer, integer), public.admin_bulk_set_items_hidden(uuid[], boolean, text),
  public.admin_change_requests_query(text, integer, integer), public.admin_decide_change_request(uuid, boolean, text),
  public.admin_expiry_radar(integer)
  from public, anon;
grant execute on function public.admin_flags_query(text, text, integer, integer), public.admin_reports_query(text, text, integer, integer),
  public.admin_moderation_counts(), public.admin_set_report_status(uuid, text, text),
  public.admin_raise_flag(uuid, uuid, text, text, integer),
  public.admin_catalog_query(text, text, text, integer, integer), public.admin_bulk_set_items_hidden(uuid[], boolean, text),
  public.admin_change_requests_query(text, integer, integer), public.admin_decide_change_request(uuid, boolean, text),
  public.admin_expiry_radar(integer)
  to authenticated, service_role;

-- ============================================================
-- 0025_admin_messaging_console.sql
-- ============================================================
-- 0025_admin_messaging_console.sql
-- B5a message log and templates; B5b Automation (the cron jobs: see them, pause them, run them now).
--
-- Roles: the log and retrying are owner, reviewer or support (the people who message sellers); templates may be
-- read by any admin and changed by the owner only; the automation controls are owner only, the status is readable
-- by any admin. Every change writes the audit log. Safe to run more than once.
--
-- The cron functions touch pg_cron, pg_net and Vault only through dynamic SQL after checking they exist, so this
-- migration applies on a project where they are not enabled yet; the Automation screen then says "not installed"
-- instead of failing. The real schedule is supabase/cron/schedule.sql.

-- ---------------------------------------------------------------------------
-- Message log (delivery records for SMS and email, and admin in-app sends)
-- ---------------------------------------------------------------------------
create or replace function public.admin_message_log_query(
  p_channel text default 'all', p_status text default 'all', p_search text default null,
  p_limit integer default 50, p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_total bigint;
  v_rows jsonb;
begin
  if not public.has_role(array['owner', 'reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(p_channel, 'all') not in ('all', 'sms', 'email', 'in_app') then raise exception 'invalid_channel'; end if;
  if coalesce(p_status, 'all') not in ('all', 'queued', 'sent', 'delivered', 'failed') then raise exception 'invalid_status'; end if;

  select count(*) into v_total
    from public.messages m left join public.businesses b on b.id = m.business_id
   where m.sender <> 'seller'
     and (coalesce(p_channel, 'all') = 'all' or m.channel = p_channel)
     and (coalesce(p_status, 'all') = 'all' or m.status = p_status)
     and (v_search is null or m.subject ilike '%' || v_search || '%' or m.to_address ilike '%' || v_search || '%'
          or m.template_key ilike '%' || v_search || '%' or b.name ilike '%' || v_search || '%');

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) into v_rows from (
    select m.id, m.created_at, m.channel, m.status, m.kind, m.subject, m.template_key, m.to_address, m.transactional,
           m.business_id, b.name as business_name, m.application_id, m.attempts, m.error, m.cost_kes, m.scheduled_at, m.sent_at
      from public.messages m left join public.businesses b on b.id = m.business_id
     where m.sender <> 'seller'
       and (coalesce(p_channel, 'all') = 'all' or m.channel = p_channel)
       and (coalesce(p_status, 'all') = 'all' or m.status = p_status)
       and (v_search is null or m.subject ilike '%' || v_search || '%' or m.to_address ilike '%' || v_search || '%'
            or m.template_key ilike '%' || v_search || '%' or b.name ilike '%' || v_search || '%')
     order by m.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
  ) x;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end $$;

create or replace function public.admin_message_summary(p_days integer default 7) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_days integer := least(greatest(coalesce(p_days, 7), 1), 90);
begin
  if not public.has_role(array['owner', 'reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'days', v_days,
    'by_status', coalesce((
      select jsonb_object_agg(s.status, s.n) from (
        select m.status, count(*) as n from public.messages m
         where m.sender <> 'seller' and m.channel in ('sms', 'email') and m.created_at >= now() - make_interval(days => v_days)
         group by m.status) s), '{}'::jsonb),
    'cost_kes', coalesce((select sum(m.cost_kes) from public.messages m
       where m.channel = 'sms' and m.created_at >= now() - make_interval(days => v_days)), 0),
    'queued_now', (select count(*) from public.messages m where m.status = 'queued' and m.channel in ('sms', 'email')),
    'due_now', (select count(*) from public.messages m where m.status = 'queued' and m.channel in ('sms', 'email') and m.scheduled_at <= now()),
    'oldest_due_at', (select min(m.scheduled_at) from public.messages m where m.status = 'queued' and m.channel in ('sms', 'email') and m.scheduled_at <= now()),
    'failed_now', (select count(*) from public.messages m where m.status = 'failed' and m.created_at >= now() - make_interval(days => v_days))
  );
end $$;

create or replace function public.admin_retry_message(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare m public.messages;
begin
  if not public.has_role(array['owner', 'reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into m from public.messages where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if m.status <> 'failed' then raise exception 'not_failed'; end if;
  update public.messages set status = 'queued', attempts = 0, error = null, scheduled_at = now() where id = p_id;
  perform public.admin_audit_action('message.retry', 'message', p_id::text,
    jsonb_build_object('status', 'failed', 'error', m.error), jsonb_build_object('status', 'queued'), null, m.business_id);
  return true;
end $$;

-- Put every message that failed in the last p_days days back in the queue (at most 200 at a time).
create or replace function public.admin_retry_failed_messages(p_days integer default 7) returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if not public.has_role(array['owner', 'reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  with picked as (
    select id from public.messages
     where status = 'failed' and created_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90))
     order by created_at desc limit 200 for update skip locked
  ), upd as (
    update public.messages m set status = 'queued', attempts = 0, error = null, scheduled_at = now()
      from picked where m.id = picked.id returning m.id
  )
  select count(*) into v_n from upd;
  if v_n > 0 then
    perform public.admin_audit_action('message.retry_failed', 'message_batch', null, null, jsonb_build_object('count', v_n), null, null);
  end if;
  return v_n;
end $$;

-- ---------------------------------------------------------------------------
-- Templates
-- ---------------------------------------------------------------------------
create or replace function public.admin_templates_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.key)
    from (
      select t.key, t.channel, t.subject, t.body_en, t.body_sw, t.transactional, t.version, t.updated_at,
             (select count(*) from public.messages m where m.template_key = t.key and m.created_at >= now() - interval '30 days') as used_30d
        from public.message_templates t
    ) x
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_save_template(
  p_key text, p_channel text, p_subject text, p_body_en text, p_body_sw text default null, p_transactional boolean default false
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_key text := btrim(coalesce(p_key, ''));
  v_subject text := nullif(btrim(coalesce(p_subject, '')), '');
  v_en text := btrim(coalesce(p_body_en, ''));
  v_sw text := nullif(btrim(coalesce(p_body_sw, '')), '');
  old public.message_templates;
  v_version integer;
begin
  if not public.has_role(array['owner']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_key !~ '^[a-z0-9_.-]{2,60}$' then raise exception 'invalid_key'; end if;
  if p_channel not in ('sms', 'email', 'in_app') then raise exception 'invalid_channel'; end if;
  if char_length(v_en) not between 1 and 4000 or (v_sw is not null and char_length(v_sw) > 4000) then raise exception 'invalid_input'; end if;
  if p_channel = 'sms' and (char_length(v_en) > 612 or char_length(coalesce(v_sw, '')) > 612) then raise exception 'sms_too_long'; end if;
  if p_channel = 'email' and v_subject is null then raise exception 'subject_required'; end if;

  select * into old from public.message_templates where key = v_key for update;
  if found then
    if old.channel <> p_channel then raise exception 'channel_locked'; end if; -- jobs and sends rely on the channel
    update public.message_templates
       set subject = v_subject, body_en = v_en, body_sw = v_sw, transactional = coalesce(p_transactional, false),
           version = old.version + 1, updated_by = auth.uid(), updated_at = now()
     where key = v_key returning version into v_version;
  else
    insert into public.message_templates (key, channel, subject, body_en, body_sw, transactional, updated_by)
    values (v_key, p_channel, v_subject, v_en, v_sw, coalesce(p_transactional, false), auth.uid())
    returning version into v_version;
  end if;

  perform public.admin_audit_action(case when old.key is null then 'template.create' else 'template.update' end, 'template', v_key,
    case when old.key is null then null else jsonb_build_object('version', old.version, 'body_en', old.body_en, 'subject', old.subject) end,
    jsonb_build_object('version', v_version, 'body_en', v_en, 'subject', v_subject), null, null);
  return v_version;
end $$;

-- ---------------------------------------------------------------------------
-- Automation: the two scheduled jobs
-- ---------------------------------------------------------------------------
create or replace function public.admin_job_names() returns text[]
language sql immutable as $$ select array['dispatch-messages', 'daily-lifecycle'] $$;

create or replace function public.admin_automation_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_installed boolean := to_regclass('cron.job') is not null;
  v_runs boolean := to_regclass('cron.job_run_details') is not null;
  v_jobs jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  if v_installed then
    execute format($q$
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', j.jobname, 'schedule', j.schedule, 'active', j.active,
        'last_run', %s) order by j.jobname), '[]'::jsonb)
      from cron.job j
      where j.jobname = any (public.admin_job_names())
    $q$, case when v_runs then $r$(
        select jsonb_build_object('status', d.status, 'started_at', d.start_time, 'ended_at', d.end_time, 'message', left(d.return_message, 300))
          from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1)$r$
      else 'null' end) into v_jobs;
  end if;

  return jsonb_build_object(
    'cron_installed', v_installed,
    'net_installed', to_regnamespace('net') is not null,
    'expected', to_jsonb(public.admin_job_names()),
    'jobs', v_jobs,
    'queue', jsonb_build_object(
      'queued', (select count(*) from public.messages where status = 'queued' and channel in ('sms', 'email')),
      'due_now', (select count(*) from public.messages where status = 'queued' and channel in ('sms', 'email') and scheduled_at <= now()),
      'oldest_due_at', (select min(scheduled_at) from public.messages where status = 'queued' and channel in ('sms', 'email') and scheduled_at <= now()),
      'failed_7d', (select count(*) from public.messages where status = 'failed' and created_at >= now() - interval '7 days')),
    'last_sent_at', (select max(sent_at) from public.messages where channel in ('sms', 'email') and status in ('sent', 'delivered')),
    'last_reminder_at', (select max(created_at) from public.messages where kind in ('reminder', 'grace', 'expiry'))
  );
end $$;

create or replace function public.admin_set_job_active(p_name text, p_active boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_was boolean;
begin
  if not public.has_role(array['owner']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not (p_name = any (public.admin_job_names())) then raise exception 'unknown_job'; end if;
  if to_regclass('cron.job') is null then raise exception 'cron_not_installed'; end if;
  execute 'select jobid, active from cron.job where jobname = $1' into v_id, v_was using p_name;
  if v_id is null then raise exception 'job_not_scheduled'; end if;
  if v_was is distinct from coalesce(p_active, false) then
    execute 'select cron.alter_job($1, active := $2)' using v_id, coalesce(p_active, false);
    perform public.admin_audit_action(case when p_active then 'job.resume' else 'job.pause' end, 'job', p_name,
      jsonb_build_object('active', v_was), jsonb_build_object('active', coalesce(p_active, false)), null, null);
  end if;
  return true;
end $$;

-- Run a job right now, exactly as the schedule does (same URL, same secret from Vault). Returns the pg_net request id.
create or replace function public.admin_run_job(p_name text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text; v_req bigint;
begin
  if not public.has_role(array['owner']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not (p_name = any (public.admin_job_names())) then raise exception 'unknown_job'; end if;
  if to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') is null or to_regclass('vault.decrypted_secrets') is null then
    raise exception 'automation_not_configured';
  end if;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'project_url'$q$ into v_url;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'$q$ into v_secret;
  if v_url is null or v_secret is null then raise exception 'automation_not_configured'; end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 55000)'
    into v_req using v_url || '/functions/v1/' || p_name,
    jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret), '{}'::jsonb;
  perform public.admin_audit_action('job.run', 'job', p_name, null, jsonb_build_object('request_id', v_req), null, null);
  return v_req;
end $$;

-- ---------------------------------------------------------------------------
-- Who may call what: signed-in users only; each function checks the admin role itself.
-- ---------------------------------------------------------------------------
revoke all on function public.admin_message_log_query(text, text, text, integer, integer), public.admin_message_summary(integer),
  public.admin_retry_message(uuid), public.admin_retry_failed_messages(integer), public.admin_templates_list(),
  public.admin_save_template(text, text, text, text, text, boolean), public.admin_job_names(), public.admin_automation_status(),
  public.admin_set_job_active(text, boolean), public.admin_run_job(text)
  from public, anon;
grant execute on function public.admin_message_log_query(text, text, text, integer, integer), public.admin_message_summary(integer),
  public.admin_retry_message(uuid), public.admin_retry_failed_messages(integer), public.admin_templates_list(),
  public.admin_save_template(text, text, text, text, text, boolean), public.admin_job_names(), public.admin_automation_status(),
  public.admin_set_job_active(text, boolean), public.admin_run_job(text)
  to authenticated, service_role;

-- ============================================================
-- 0026_admin_plans.sql
-- ============================================================
-- 0026_admin_plans.sql
-- B6a Plans and pricing: edit a plan's price, three headline benefits and badge, with an immutable history.
--
-- Roles: any admin may read plans and their history; the owner and finance change them.
-- A price change needs a reason. Existing sellers keep the monthly price stored on their business (see
-- businesses.monthly_price); a plan change applies to new applications, and the list says how many live
-- businesses are on each plan so nobody is surprised. Every save writes the audit log. Safe to run again.

create table if not exists public.plan_versions (
  id          bigint generated always as identity primary key,
  category_id text not null,
  plan_key    text not null,
  snapshot    jsonb not null,
  reason      text,
  changed_by  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists plan_versions_lookup_idx on public.plan_versions (category_id, plan_key, created_at desc);
alter table public.plan_versions enable row level security;
revoke all on public.plan_versions from public, anon, authenticated; -- read only through admin_plan_history()

-- Written by trigger only, so no path (SQL editor included) can change a plan without leaving a snapshot.
create or replace function public.snapshot_plan_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.plan_versions (category_id, plan_key, snapshot, reason, changed_by)
  values (new.category_id, new.plan_key, to_jsonb(new), nullif(current_setting('app.change_reason', true), ''), auth.uid());
  return new;
end $$;
drop trigger if exists t_plans_version on public.plans;
create trigger t_plans_version after insert or update on public.plans for each row execute function public.snapshot_plan_version();

create or replace function public.admin_plans_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.sort, x.category_name, x.plan_key)
    from (
      select c.id as category_id, c.name as category_name, c.grp, c.sort, c.active as category_active,
             p.plan_key, p.price_kes, p.top_benefits, p.badge, p.updated_at,
             (select count(*) from public.businesses b where b.category_id = c.id and b.plan_key = p.plan_key and b.status = 'live') as live_businesses,
             (select coalesce(sum(b.monthly_price), 0) from public.businesses b where b.category_id = c.id and b.plan_key = p.plan_key and b.status = 'live') as live_monthly_kes,
             (select count(*) from public.plan_versions v where v.category_id = c.id and v.plan_key = p.plan_key) as versions
        from public.categories c join public.plans p on p.category_id = c.id
    ) x
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_save_plan(
  p_category text, p_plan text, p_price integer, p_benefits jsonb, p_badge text default null, p_reason text default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  old public.plans;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_badge text := nullif(btrim(coalesce(p_badge, '')), '');
  v_benefits jsonb;
begin
  if not public.has_role(array['owner', 'finance']) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into old from public.plans where category_id = p_category and plan_key = p_plan for update;
  if not found then raise exception 'plan_not_found'; end if;
  if p_price is null or p_price not between 0 and 100000 then raise exception 'invalid_price'; end if;
  if v_badge is not null and v_badge not in ('Best value', 'Popular') then raise exception 'invalid_badge'; end if;
  if jsonb_typeof(p_benefits) <> 'array' or jsonb_array_length(p_benefits) <> 3 then raise exception 'three_benefits_required'; end if;
  -- Trim each benefit and refuse blanks or very long lines.
  select jsonb_agg(btrim(b)) into v_benefits from jsonb_array_elements_text(p_benefits) b;
  if exists (select 1 from jsonb_array_elements_text(v_benefits) b where char_length(b) not between 2 and 80) then raise exception 'invalid_benefit'; end if;
  if p_price is distinct from old.price_kes and (v_reason is null or char_length(v_reason) < 5) then raise exception 'reason_required'; end if;
  if p_price = old.price_kes and v_benefits = old.top_benefits and v_badge is not distinct from old.badge then return 0; end if; -- nothing changed

  perform set_config('app.change_reason', coalesce(v_reason, ''), true);
  update public.plans set price_kes = p_price, top_benefits = v_benefits, badge = v_badge, updated_at = now()
   where category_id = p_category and plan_key = p_plan;
  perform public.admin_audit_action('plan.update', 'plan', p_category || ':' || p_plan,
    jsonb_build_object('price_kes', old.price_kes, 'top_benefits', old.top_benefits, 'badge', old.badge),
    jsonb_build_object('price_kes', p_price, 'top_benefits', v_benefits, 'badge', v_badge), v_reason, null);
  return (select count(*)::int from public.plan_versions where category_id = p_category and plan_key = p_plan);
end $$;

create or replace function public.admin_plan_history(p_category text, p_plan text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
    from (
      select v.id, v.created_at, v.reason, (v.snapshot->>'price_kes')::int as price_kes, v.snapshot->'top_benefits' as top_benefits,
             v.snapshot->>'badge' as badge, (select a.email from public.admins a where a.user_id = v.changed_by) as changed_by_email
        from public.plan_versions v where v.category_id = p_category and v.plan_key = p_plan
       order by v.created_at desc limit 50
    ) x
  ), '[]'::jsonb);
end $$;

revoke all on function public.admin_plans_list(), public.admin_save_plan(text, text, integer, jsonb, text, text), public.admin_plan_history(text, text) from public, anon;
grant execute on function public.admin_plans_list(), public.admin_save_plan(text, text, integer, jsonb, text, text), public.admin_plan_history(text, text) to authenticated, service_role;

-- ============================================================
-- 0027_admin_categories.sql
-- ============================================================
-- 0027_admin_categories.sql
-- B6b Categories and the template builder.
--
-- A category carries the extra questions asked on the seller application (`template`) and the extra documents
-- required for it (`extra_docs`). A broken template would break the public application form, so the shape is
-- validated here, not just in the screen. Owner only for changes (catalogue.edit); any admin may read.
-- Categories are never deleted, only switched off: sellers already in a category keep it.
-- A new category starts switched off with two placeholder plans at KES 0, and cannot be switched on until both
-- plans have a price, so nothing goes live for free by accident. Safe to run again.

create or replace function public.validate_category_template(p_template jsonb) returns void
language plpgsql immutable as $$
declare f jsonb; v_keys text[] := '{}'; v_key text; v_type text; o jsonb;
begin
  if jsonb_typeof(p_template) <> 'array' then raise exception 'invalid_template'; end if;
  if jsonb_array_length(p_template) > 40 then raise exception 'too_many_fields'; end if;
  for f in select * from jsonb_array_elements(p_template) loop
    if jsonb_typeof(f) <> 'object' then raise exception 'invalid_template'; end if;
    v_key := f->>'key'; v_type := f->>'type';
    if v_key is null or v_key !~ '^[a-zA-Z][a-zA-Z0-9]{0,39}$' then raise exception 'invalid_field_key'; end if;
    if v_key = any (v_keys) then raise exception 'duplicate_field_key'; end if;
    v_keys := v_keys || v_key;
    if coalesce(char_length(btrim(f->>'label')), 0) not between 1 and 80 then raise exception 'invalid_field_label'; end if;
    if v_type is null or v_type not in ('text', 'number', 'price', 'boolean', 'select', 'multiselect', 'itemlist') then raise exception 'invalid_field_type'; end if;
    if v_type in ('select', 'multiselect') then
      -- NULL-safe: a missing `options` key must fail, not slip through a NULL comparison.
      if coalesce(jsonb_typeof(f->'options'), '') <> 'array' then raise exception 'options_required'; end if;
      if jsonb_array_length(f->'options') not between 2 and 30 then raise exception 'options_required'; end if;
      for o in select * from jsonb_array_elements(f->'options') loop
        if jsonb_typeof(o) <> 'string' or char_length(btrim(o #>> '{}')) not between 1 and 60 then raise exception 'invalid_option'; end if;
      end loop;
    end if;
  end loop;
  -- A condition must point at a field that exists in this template.
  for f in select * from jsonb_array_elements(p_template) loop
    if f ? 'showIf' then
      if coalesce(jsonb_typeof(f->'showIf'), '') <> 'object'
         or coalesce((f->'showIf'->>'field') = any (v_keys), false) is false
         or (f->'showIf'->>'field') = (f->>'key') then
        raise exception 'invalid_condition';
      end if;
    end if;
  end loop;
end $$;

create or replace function public.validate_category_docs(p_docs jsonb) returns void
language plpgsql immutable as $$
declare d jsonb; v_keys text[] := '{}';
begin
  if jsonb_typeof(p_docs) <> 'array' then raise exception 'invalid_docs'; end if;
  if jsonb_array_length(p_docs) > 10 then raise exception 'too_many_docs'; end if;
  for d in select * from jsonb_array_elements(p_docs) loop
    if jsonb_typeof(d) <> 'object' or (d->>'key') is null or (d->>'key') !~ '^[a-z0-9_]{2,40}$' then raise exception 'invalid_doc_key'; end if;
    if (d->>'key') = any (v_keys) then raise exception 'duplicate_doc_key'; end if;
    v_keys := v_keys || (d->>'key');
    if coalesce(char_length(btrim(d->>'label')), 0) not between 1 and 120 then raise exception 'invalid_doc_label'; end if;
    if (d->>'rule') is null or (d->>'rule') not in ('required', 'conditional') then raise exception 'invalid_doc_rule'; end if;
    if (d->>'rule') = 'conditional' and coalesce(char_length(btrim(d->>'condition')), 0) = 0 then raise exception 'condition_required'; end if;
    if coalesce(char_length(btrim(d->>'why')), 0) not between 1 and 200 then raise exception 'invalid_doc_why'; end if;
  end loop;
end $$;

create or replace function public.admin_categories_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.sort, x.name)
    from (
      select c.id, c.name, c.grp, c.icon, c.tier, c.sort, c.active, c.template, c.extra_docs, c.updated_at,
             (select count(*) from public.businesses b where b.category_id = c.id and b.status = 'live') as live_businesses,
             (select count(*) from public.businesses b where b.category_id = c.id and b.status <> 'deleted') as businesses,
             (select min(p.price_kes) from public.plans p where p.category_id = c.id) as min_price,
             (select count(*) from public.plans p where p.category_id = c.id and p.price_kes > 0) as priced_plans
        from public.categories c
    ) x
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_save_category(
  p_id text, p_name text, p_grp text, p_icon text, p_tier text, p_sort integer, p_active boolean,
  p_template jsonb, p_extra_docs jsonb, p_reason text default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  old public.categories;
  v_name text := btrim(coalesce(p_name, ''));
  v_grp text := btrim(coalesce(p_grp, ''));
  v_icon text := coalesce(nullif(btrim(coalesce(p_icon, '')), ''), 'store');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_new boolean;
begin
  if not public.has_role(array['owner']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(p_id, '') !~ '^[a-z0-9-]{2,50}$' then raise exception 'invalid_id'; end if;
  if char_length(v_name) not between 2 and 80 or char_length(v_grp) not between 2 and 60 then raise exception 'invalid_input'; end if;
  if v_icon !~ '^[a-z0-9-]{2,40}$' then raise exception 'invalid_icon'; end if;
  if p_tier not in ('A', 'B', 'C', 'D') then raise exception 'invalid_tier'; end if;
  perform public.validate_category_template(coalesce(p_template, '[]'::jsonb));
  perform public.validate_category_docs(coalesce(p_extra_docs, '[]'::jsonb));

  select * into old from public.categories where id = p_id for update;
  v_new := not found;

  if v_new then
    insert into public.categories (id, name, grp, icon, tier, sort, active, template, extra_docs)
    values (p_id, v_name, v_grp, v_icon, p_tier, coalesce(p_sort, 0), false, coalesce(p_template, '[]'::jsonb), coalesce(p_extra_docs, '[]'::jsonb));
    insert into public.plans (category_id, plan_key, price_kes, items_limit, top_benefits)
    select p_id, k, 0, null, '["Listed on EpicMKT", "Contact buttons", "Opening hours"]'::jsonb from unnest(array['standard', 'premium']) k;
    if coalesce(p_active, false) then raise exception 'plans_not_priced'; end if;
  else
    if coalesce(p_active, false) and not old.active
       and (select count(*) from public.plans where category_id = p_id and price_kes > 0) < 2 then
      raise exception 'plans_not_priced';
    end if;
    if not coalesce(p_active, false) and old.active and (v_reason is null or char_length(v_reason) < 5) then raise exception 'reason_required'; end if;
    update public.categories
       set name = v_name, grp = v_grp, icon = v_icon, tier = p_tier, sort = coalesce(p_sort, sort), active = coalesce(p_active, false),
           template = coalesce(p_template, '[]'::jsonb), extra_docs = coalesce(p_extra_docs, '[]'::jsonb), updated_at = now()
     where id = p_id;
  end if;

  perform public.admin_audit_action(case when v_new then 'category.create' else 'category.update' end, 'category', p_id,
    case when v_new then null else jsonb_build_object('name', old.name, 'active', old.active, 'tier', old.tier,
      'template_fields', jsonb_array_length(old.template), 'extra_docs', jsonb_array_length(old.extra_docs)) end,
    jsonb_build_object('name', v_name, 'active', case when v_new then false else coalesce(p_active, false) end, 'tier', p_tier,
      'template_fields', jsonb_array_length(coalesce(p_template, '[]'::jsonb)), 'extra_docs', jsonb_array_length(coalesce(p_extra_docs, '[]'::jsonb))),
    v_reason, null);
  return v_new;
end $$;

revoke all on function public.validate_category_template(jsonb), public.validate_category_docs(jsonb),
  public.admin_categories_list(), public.admin_save_category(text, text, text, text, text, integer, boolean, jsonb, jsonb, text) from public, anon;
grant execute on function public.validate_category_template(jsonb), public.validate_category_docs(jsonb),
  public.admin_categories_list(), public.admin_save_category(text, text, text, text, text, integer, boolean, jsonb, jsonb, text) to authenticated, service_role;

-- ============================================================
-- 0028_admin_audit_analytics.sql
-- ============================================================
-- 0028_admin_audit_analytics.sql
-- B8a Audit viewer and Analytics.
--
-- Audit: any admin may read the audit log (the same rule as the table's policy), filtered and paged here so the
-- screen never pulls the whole table. Analytics: aggregates only, for any admin with payments or application
-- access; finance and owner see money, so the revenue block is empty for others. Times are Nairobi days.
-- Safe to run again.

create or replace function public.admin_audit_query(
  p_search text default null, p_action text default null, p_actor text default null,
  p_from date default null, p_to date default null, p_limit integer default 50, p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_action text := nullif(btrim(coalesce(p_action, '')), '');
  v_actor text := nullif(btrim(coalesce(p_actor, '')), '');
  v_from timestamptz := case when p_from is null then null else public.nairobi_midnight(p_from) end;
  v_to timestamptz := case when p_to is null then null else public.nairobi_midnight(p_to + 1) end;
  v_total bigint; v_rows jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_from is not null and v_to is not null and v_to <= v_from then raise exception 'invalid_range'; end if;

  select count(*) into v_total
    from public.audit_log a left join public.businesses b on b.id = a.business_id
   where (v_action is null or a.action = v_action or a.action like v_action || '.%')
     and (v_actor is null or a.actor_email ilike '%' || v_actor || '%')
     and (v_from is null or a.created_at >= v_from) and (v_to is null or a.created_at < v_to)
     and (v_search is null or a.action ilike '%' || v_search || '%' or a.target_id ilike '%' || v_search || '%'
          or a.reason ilike '%' || v_search || '%' or b.name ilike '%' || v_search || '%');

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc), '[]'::jsonb) into v_rows from (
    select a.id, a.created_at, a.action, a.actor_email, a.actor_role, a.target_type, a.target_id, a.reason, a.before, a.after,
           a.business_id, b.name as business_name
      from public.audit_log a left join public.businesses b on b.id = a.business_id
     where (v_action is null or a.action = v_action or a.action like v_action || '.%')
       and (v_actor is null or a.actor_email ilike '%' || v_actor || '%')
       and (v_from is null or a.created_at >= v_from) and (v_to is null or a.created_at < v_to)
       and (v_search is null or a.action ilike '%' || v_search || '%' or a.target_id ilike '%' || v_search || '%'
            or a.reason ilike '%' || v_search || '%' or b.name ilike '%' || v_search || '%')
     order by a.created_at desc, a.id desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
  ) x;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end $$;

-- The groups before the first dot ("payment", "business", "plan"...) for the filter, with counts.
create or replace function public.admin_audit_groups() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('group', g, 'n', n) order by g)
    from (select split_part(action, '.', 1) as g, count(*) as n from public.audit_log where action <> '' group by 1) s
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_analytics(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 7), 365);
  v_today date := public.nairobi_day(now());
  v_start date := public.nairobi_day(now()) - (least(greatest(coalesce(p_days, 30), 7), 365) - 1);
  v_money boolean := public.has_role(array['owner', 'finance']);
  v_apps boolean := public.has_role(array['owner', 'reviewer']);
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'days', v_days, 'from', v_start, 'to', v_today, 'can_see_money', v_money, 'can_see_applications', v_apps,
    'revenue_by_day', case when not v_money then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'kes', coalesce(r.kes, 0), 'payments', coalesce(r.n, 0)) order by d)
        from generate_series(v_start, v_today, interval '1 day') d
        left join (select public.nairobi_day(confirmed_at) as day, sum(amount_kes) as kes, count(*) as n
                     from public.payments where status = 'confirmed' and confirmed_at is not null
                      and public.nairobi_day(confirmed_at) between v_start and v_today group by 1) r on r.day = d::date
    ), '[]'::jsonb) end,
    'revenue_total', case when not v_money then null else coalesce((select sum(amount_kes) from public.payments
       where status = 'confirmed' and confirmed_at is not null and public.nairobi_day(confirmed_at) between v_start and v_today), 0) end,
    'mrr_kes', case when not v_money then null else coalesce((select sum(monthly_price) from public.businesses where status = 'live'), 0) end,
    'new_businesses_by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'n', coalesce(r.n, 0)) order by d)
        from generate_series(v_start, v_today, interval '1 day') d
        left join (select public.nairobi_day(created_at) as day, count(*) as n from public.businesses
                    where status <> 'deleted' and public.nairobi_day(created_at) between v_start and v_today group by 1) r on r.day = d::date
    ), '[]'::jsonb),
    'businesses', jsonb_build_object(
      'live', (select count(*) from public.businesses where status = 'live'),
      'expired', (select count(*) from public.businesses where status = 'expired'),
      'suspended', (select count(*) from public.businesses where status = 'suspended'),
      'premium_live', (select count(*) from public.businesses where status = 'live' and plan_key = 'premium')),
    'funnel', case when not v_apps then '{}'::jsonb else (
      select jsonb_build_object(
        'submitted', count(*) filter (where status <> 'uploading'),
        'approved', count(*) filter (where status in ('approved', 'payment_confirming', 'activated')),
        'activated', count(*) filter (where status = 'activated'),
        'rejected', count(*) filter (where status = 'rejected'))
      from public.applications where public.nairobi_day(created_at) between v_start and v_today) end,
    'by_category', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.live desc, x.name)
      from (select c.id, c.name, count(b.id) filter (where b.status = 'live') as live,
                   coalesce(sum(b.monthly_price) filter (where b.status = 'live' and v_money), 0) as monthly_kes
              from public.categories c left join public.businesses b on b.category_id = c.id group by c.id, c.name having count(b.id) filter (where b.status = 'live') > 0) x
    ), '[]'::jsonb),
    -- Of the listings whose paid period ended in the window, how many paid again within a week of it ending.
    'renewals', case when not v_money then '{}'::jsonb else (
      select jsonb_build_object('due', count(*), 'renewed', count(*) filter (where renewed))
        from (select b.id, exists (select 1 from public.payments p where p.business_id = b.id and p.status = 'confirmed'
                       and p.confirmed_at > b.paid_until - interval '1 day') as renewed
                from public.businesses b
               where b.status in ('live', 'expired') and b.paid_until is not null
                 and public.nairobi_day(b.paid_until) between v_start and v_today - 1) q) end
  );
end $$;

revoke all on function public.admin_audit_query(text, text, text, date, date, integer, integer), public.admin_audit_groups(), public.admin_analytics(integer) from public, anon;
grant execute on function public.admin_audit_query(text, text, text, date, date, integer, integer), public.admin_audit_groups(), public.admin_analytics(integer) to authenticated, service_role;

-- ============================================================
-- 0029_grace_and_settings.sql
-- ============================================================
-- 0029_grace_and_settings.sql
-- Grace period you can change (a default for everyone, and an override per business), and the Settings page.
--   * site_settings.grace_days is the default (1). businesses.grace_days, when set, replaces it for that business.
--   * After grace a shop is hidden from customers (business_is_visible) and comes back by itself when a payment is confirmed.
--   * Settings are read and written through security definer functions that check the admin role.

alter table public.businesses
  add column if not exists grace_days integer check (grace_days is null or grace_days between 0 and 90);

insert into public.site_settings (key, value) values
  ('grace_days', '1'),
  ('sms_sender', '"EpicMKT"')
on conflict (key) do nothing;

create or replace function public.default_grace_days() returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((select (s.value #>> '{}')::integer from public.site_settings s where s.key = 'grace_days'), 1)
$$;

create or replace function public.grace_days_of(p_business_grace integer) returns integer
language sql stable as $$ select coalesce(p_business_grace, public.default_grace_days()) $$;

create or replace function public.listing_state(p_paid timestamptz, p_now timestamptz, p_grace integer) returns text
language sql stable as $$
  select case
    when p_paid is null then 'none'
    when public.nairobi_day(p_now) <= public.nairobi_day(p_paid) then 'active'
    when public.nairobi_day(p_now) <= public.nairobi_day(p_paid) + public.grace_days_of(p_grace) then 'grace'
    else 'expired'
  end $$;

create or replace function public.listing_state(p_paid timestamptz, p_now timestamptz default now()) returns text
language sql stable as $$ select public.listing_state(p_paid, p_now, null::integer) $$;

grant execute on function public.listing_state(timestamptz, timestamptz, integer) to authenticated, service_role;

create or replace function public.my_grace_days() returns integer
language sql stable security definer set search_path = public as $$
  select public.grace_days_of(b.grace_days) from public.businesses b where b.id = public.my_business_id()
$$;
revoke all on function public.my_grace_days() from public, anon;
grant execute on function public.my_grace_days() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Settings page
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_settings() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_q jsonb;
begin
  if not public.has_role(array[]::text[]) then raise exception 'forbidden' using errcode = '42501'; end if;
  select value into v_q from public.site_settings where key = 'quiet_hours';
  return jsonb_build_object(
    'graceDays', public.default_grace_days(),
    'strikeThreshold', coalesce((select (value #>> '{}')::integer from public.site_settings where key = 'strike_threshold'), 3),
    'smsSender', coalesce((select value #>> '{}' from public.site_settings where key = 'sms_sender'), 'EpicMKT'),
    'quietStart', coalesce(v_q ->> 'start', '21:00'),
    'quietEnd', coalesce(v_q ->> 'end', '07:00'));
end $$;

create or replace function public.admin_save_settings(p_settings jsonb, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
  v_grace integer;
  v_strike integer;
  v_sender text;
  v_start text;
  v_end text;
begin
  if not public.has_role(array[]::text[]) then raise exception 'forbidden' using errcode = '42501'; end if;
  v_before := public.admin_get_settings();

  begin
    v_grace := (p_settings ->> 'graceDays')::integer;
    v_strike := (p_settings ->> 'strikeThreshold')::integer;
  exception when others then raise exception 'invalid_settings' using errcode = '22023';
  end;
  v_sender := btrim(coalesce(p_settings ->> 'smsSender', ''));
  v_start := btrim(coalesce(p_settings ->> 'quietStart', ''));
  v_end := btrim(coalesce(p_settings ->> 'quietEnd', ''));

  if v_grace is null or v_grace < 0 or v_grace > 30 then raise exception 'invalid_grace_days' using errcode = '22023'; end if;
  if v_strike is null or v_strike < 1 or v_strike > 20 then raise exception 'invalid_strike_threshold' using errcode = '22023'; end if;
  if v_sender !~ '^[A-Za-z0-9]{3,11}$' then raise exception 'invalid_sms_sender' using errcode = '22023'; end if;
  if v_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or v_end !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or v_start = v_end then
    raise exception 'invalid_quiet_hours' using errcode = '22023';
  end if;

  insert into public.site_settings (key, value) values
    ('grace_days', to_jsonb(v_grace)),
    ('strike_threshold', to_jsonb(v_strike)),
    ('sms_sender', to_jsonb(v_sender)),
    ('quiet_hours', jsonb_build_object('start', v_start, 'end', v_end))
  on conflict (key) do update set value = excluded.value, updated_at = now();

  perform public.admin_audit_action('settings.update', 'settings', null, v_before, public.admin_get_settings(),
    nullif(btrim(coalesce(p_reason, '')), ''));
  return public.admin_get_settings();
end $$;

revoke all on function public.admin_get_settings() from public, anon;
revoke all on function public.admin_save_settings(jsonb, text) from public, anon;
grant execute on function public.admin_get_settings() to authenticated, service_role;
grant execute on function public.admin_save_settings(jsonb, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Grace for one business: a number of days replaces the default; null goes back to the default.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_business_grace(p_business uuid, p_days integer, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b public.businesses;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.has_role(array['finance']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_days is not null and (p_days < 0 or p_days > 90) then raise exception 'invalid_grace_days' using errcode = '22023'; end if;
  if p_days is not null and v_reason is null then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into b from public.businesses x where x.id = p_business and x.deleted_at is null for update;
  if not found then raise exception 'target_not_found' using errcode = 'P0002'; end if;

  update public.businesses set grace_days = p_days where id = b.id;
  perform public.admin_audit_action('business.grace', 'business', b.id::text,
    jsonb_build_object('graceDays', b.grace_days), jsonb_build_object('graceDays', p_days), v_reason, b.id);
  return jsonb_build_object('graceDays', p_days, 'effective', public.grace_days_of(p_days),
    'state', public.listing_state(b.paid_until, now(), p_days));
end $$;

revoke all on function public.admin_set_business_grace(uuid, integer, text) from public, anon;
grant execute on function public.admin_set_business_grace(uuid, integer, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Everything below follows the grace period of the business instead of a fixed day.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.business_is_visible(b businesses)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select b.status = 'live'
    and b.deleted_at is null
    and public.listing_state(b.paid_until, now(), b.grace_days) in ('active', 'grace');
$function$;

CREATE OR REPLACE FUNCTION public.admin_counts()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when public.is_admin() then jsonb_build_object(
    'submitted',            (select count(*) from applications where status = 'submitted'),
    'under_review',         (select count(*) from applications where status = 'under_review'),
    'changes_requested',    (select count(*) from applications where status = 'changes_requested'),
    'awaiting_payment',     (select count(*) from applications where status = 'approved'),
    'payment_confirming',   (select count(*) from applications where status = 'payment_confirming'),
    'live',                 (select count(*) from businesses b where public.business_is_visible(b)),
    'expiring_7d',          (select count(*) from businesses b where b.status = 'live' and b.deleted_at is null
                               and public.listing_state(b.paid_until, now(), b.grace_days) = 'active' and public.days_left(b.paid_until) <= 7),
    'in_grace',             (select count(*) from businesses b where b.status = 'live' and b.deleted_at is null
                               and public.listing_state(b.paid_until, now(), b.grace_days) = 'grace'),
    'expired',              (select count(*) from businesses b where b.deleted_at is null and b.status in ('live', 'expired')
                               and public.listing_state(b.paid_until, now(), b.grace_days) = 'expired'),
    'suspended',            (select count(*) from businesses where status = 'suspended' and deleted_at is null),
    'open_flags',           (select count(*) from flags where status in ('open', 'replied')),
    'open_reports',         (select count(*) from reports where status = 'open'),
    'unconfirmed_payments', (select count(*) from payments where status = 'submitted'),
    'failed_messages',      (select count(*) from messages where status = 'failed'),
    'pending_changes',      (select count(*) from change_requests where status = 'pending')
  ) else '{}'::jsonb end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_expiry_radar(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_days integer := least(greatest(coalesce(p_days, 30), 1), 90);
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.paid_until asc)
    from (
      select b.id, b.name, b.category_id, b.plan_key, b.phone, b.whatsapp, b.monthly_price, b.paid_until, b.status,
             public.days_left(b.paid_until) as days_left,
             public.listing_state(b.paid_until, now(), b.grace_days) as state,
             (select max(p.confirmed_at) from public.payments p where p.business_id = b.id and p.status = 'confirmed') as last_payment_at,
             (select max(m.created_at) from public.messages m
               where m.business_id = b.id and m.kind in ('reminder', 'grace', 'expiry')) as last_reminder_at,
             exists (select 1 from public.payments p where p.business_id = b.id and p.status in ('submitted', 'awaiting_confirmation', 'needs_assignment')) as payment_waiting
        from public.businesses b
       where b.status in ('live', 'expired') and b.deleted_at is null and b.paid_until is not null
         and public.days_left(b.paid_until) <= v_days
         and public.days_left(b.paid_until) >= -30
    ) x
  ), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.message_segment(p_segment text, p_now timestamp with time zone DEFAULT now())
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- `return query` does not end a set-returning function, so each branch returns explicitly.
  if p_segment = 'all_live' then
    return query select id from public.businesses where status = 'live';
    return;
  elsif p_segment = 'expiring_7d' then
    return query select id from public.businesses
      where status = 'live' and paid_until is not null
        and public.nairobi_day(paid_until) between public.nairobi_day(p_now) and public.nairobi_day(p_now) + 7;
    return;
  elsif p_segment = 'in_grace' then
    return query select id from public.businesses
      where status <> 'deleted' and paid_until is not null and public.listing_state(paid_until, p_now, grace_days) = 'grace';
    return;
  elsif p_segment = 'expired' then
    return query select id from public.businesses
      where status <> 'deleted' and paid_until is not null and public.listing_state(paid_until, p_now, grace_days) = 'expired';
    return;
  elsif p_segment like 'category:%' then
    return query select id from public.businesses where status = 'live' and category_id = substr(p_segment, 10);
    return;
  elsif p_segment like 'town:%' then
    return query select id from public.businesses where status = 'live' and lower(town) = lower(substr(p_segment, 6));
    return;
  end if;
  raise exception 'unknown_segment' using errcode = '22023';
end $function$;

CREATE OR REPLACE FUNCTION public.payment_quote(p_b businesses, p_purpose text, p_target text, p_category text, p_now timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_purpose text := p_purpose;
  v_old integer;
  v_new integer;
  v_app public.applications;
  v_state text := public.listing_state(p_b.paid_until, p_now, p_b.grace_days);
  v_amount integer;
  v_account text := p_b.seller_id;
  v_plan text := p_b.plan_key;
  v_cat text := p_b.category_id;
  v_quote jsonb;
begin
  select p.price_kes into v_old from public.plans p where p.category_id = p_b.category_id and p.plan_key = p_b.plan_key;
  if v_purpose is null then
    v_purpose := case when p_b.paid_until is null and not exists (select 1 from public.payments x where x.business_id = p_b.id and x.status = 'confirmed') then 'first' else 'renewal' end;
  end if;
  if v_purpose = 'first' then
    select * into v_app from public.applications a where a.id = p_b.application_id;
    v_amount := coalesce(v_app.price_at_submission, v_old);
    v_account := coalesce(v_app.reference_no, p_b.seller_id);
  elsif v_purpose = 'renewal' then
    v_amount := v_old;
  elsif v_purpose = 'upgrade' then
    if p_b.plan_key <> 'standard' or p_target is distinct from 'premium' then raise exception 'invalid_upgrade'; end if;
    if v_state <> 'active' then raise exception 'renew_first'; end if;
    select p.price_kes into v_new from public.plans p where p.category_id = p_b.category_id and p.plan_key = 'premium';
    if v_new is null then raise exception 'invalid_upgrade'; end if;
    v_quote := public.category_change_quote(v_old, v_new, p_b.paid_until, p_now);
    v_amount := (v_quote ->> 'extraDueNow')::integer;
    v_plan := 'premium';
  elsif v_purpose = 'category_change' then
    select p.price_kes into v_new from public.plans p where p.category_id = p_category and p.plan_key = p_b.plan_key;
    if v_new is null then raise exception 'invalid_category'; end if;
    if v_new > coalesce(v_old, 0) and v_state <> 'active' then raise exception 'renew_first'; end if;
    v_quote := public.category_change_quote(coalesce(v_old, 0), v_new, p_b.paid_until, p_now);
    v_amount := (v_quote ->> 'extraDueNow')::integer;
    v_cat := p_category;
  else
    raise exception 'invalid_purpose';
  end if;
  return jsonb_build_object('purpose', v_purpose, 'amount_kes', v_amount, 'account', v_account, 'plan_key', v_plan, 'category_id', v_cat,
    'listing_state', v_state, 'grace_days', public.grace_days_of(p_b.grace_days), 'quote', v_quote);
end $function$;

CREATE OR REPLACE FUNCTION public.seller_request_change(p_field text, p_value text)
 RETURNS change_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid := public.my_business_id();
  v_b public.businesses;
  v_new text := btrim(coalesce(p_value, ''));
  v_old text;
  v_oldp integer;
  v_newp integer;
  v_quote jsonb;
  r public.change_requests;
begin
  perform public.assert_seller_active();
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if p_field is null or p_field not in ('name','category_id','phone','town','pin','licence') then
    raise exception 'field_not_allowed:%', coalesce(p_field, '') using errcode = '42501';
  end if;
  select * into v_b from public.businesses where id = v_id;
  if p_field = 'name' and char_length(v_new) not between 2 and 100 then raise exception 'invalid_name'; end if;
  if p_field = 'category_id' and not exists (select 1 from public.categories c where c.id = v_new and c.active) then raise exception 'invalid_category'; end if;
  if p_field = 'phone' then
    v_new := public.normalize_phone_ke(v_new);
    if v_new is null then raise exception 'invalid_phone'; end if;
  end if;
  if p_field = 'town' and char_length(v_new) not between 2 and 60 then raise exception 'invalid_town'; end if;
  if p_field = 'pin' then
    v_new := upper(v_new);
    if v_new !~ '^[AP][0-9]{9}[A-Z]$' then raise exception 'invalid_pin'; end if;
  end if;
  if p_field = 'licence' and char_length(v_new) not between 3 and 60 then raise exception 'invalid_licence'; end if;
  v_old := to_jsonb(v_b) ->> p_field;
  if v_old is not distinct from v_new then raise exception 'no_change'; end if;

  if p_field = 'category_id' then
    select p.price_kes into v_oldp from public.plans p where p.category_id = v_b.category_id and p.plan_key = v_b.plan_key;
    select p.price_kes into v_newp from public.plans p where p.category_id = v_new and p.plan_key = v_b.plan_key;
    if v_newp is null then raise exception 'invalid_category'; end if;
    if v_newp > coalesce(v_oldp, 0) and public.listing_state(v_b.paid_until, now(), v_b.grace_days) <> 'active' then raise exception 'renew_first'; end if;
    v_quote := public.category_change_quote(coalesce(v_oldp, 0), v_newp, v_b.paid_until);
  end if;

  begin
    insert into public.change_requests (business_id, field, old_value, new_value, extra_due_kes, new_monthly_price, applies_from_next_renewal)
    values (v_id, p_field, v_old, v_new, coalesce((v_quote ->> 'extraDueNow')::integer, 0), (v_quote ->> 'newMonthlyPrice')::integer, true)
    returning * into r;
  exception when unique_violation then
    raise exception 'change_already_pending';
  end;
  perform public.write_audit(v_id, 'change_requested', 'change_request', r.id::text, jsonb_build_object('field', p_field));
  perform public.notify_admin('change_request', v_id, jsonb_build_object('change_id', r.id, 'field', p_field));
  return r;
end $function$;

CREATE OR REPLACE FUNCTION public.seller_quote_category_change(p_category text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid := public.my_business_id();
  v_b public.businesses;
  v_old integer;
  v_new integer;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select * into v_b from public.businesses where id = v_id;
  if not exists (select 1 from public.categories c where c.id = p_category and c.active) then raise exception 'invalid_category'; end if;
  select p.price_kes into v_old from public.plans p where p.category_id = v_b.category_id and p.plan_key = v_b.plan_key;
  select p.price_kes into v_new from public.plans p where p.category_id = p_category and p.plan_key = v_b.plan_key;
  if v_new is null then raise exception 'invalid_category'; end if;
  return public.category_change_quote(coalesce(v_old, 0), v_new, v_b.paid_until)
    || jsonb_build_object('oldMonthlyPrice', v_old, 'dearer', v_new > coalesce(v_old, 0), 'listingState', public.listing_state(v_b.paid_until, now(), v_b.grace_days));
end $function$;

CREATE OR REPLACE FUNCTION public.payment_apply_confirmation(p_id uuid, p_via text DEFAULT 'admin'::text, p_now timestamp with time zone DEFAULT now())
 RETURNS payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p public.payments;
  b public.businesses;
  v_today date := public.nairobi_day(p_now);
  v_paid date;
  v_start date;
  v_end date;
  v_body text;
begin
  if p_via not in ('admin','auto') then raise exception 'invalid_via'; end if;
  select * into p from public.payments x where x.id = p_id for update;
  if not found then raise exception 'payment_not_found'; end if;
  if p.status = 'confirmed' then return p; end if;
  if p.status = 'rejected' then raise exception 'payment_rejected'; end if;
  select * into b from public.businesses x where x.id = p.business_id for update;

  if p.kind in ('first','renewal') then
    v_paid := case when b.paid_until is null then null else public.nairobi_day(b.paid_until) end;
    v_start := case when v_paid is not null and v_today <= v_paid + public.grace_days_of(b.grace_days) then v_paid else v_today end;
    v_end := public.add_calendar_month(v_start);
    update public.businesses x set paid_until = public.nairobi_midnight(v_end),
      status = case when x.status in ('pending','expired') then 'live' else x.status end
    where x.id = b.id;
    v_body := format('We received KES %s. Your listing is paid until %s.', p.amount_kes, to_char(v_end, 'DD Mon YYYY'));
  elsif p.kind = 'upgrade' then
    v_start := v_today;
    v_end := public.nairobi_day(b.paid_until);
    update public.businesses x set plan_key = coalesce(p.plan_key, x.plan_key) where x.id = b.id;
    v_body := format('We received KES %s. You are now on %s until %s.', p.amount_kes, initcap(coalesce(p.plan_key, b.plan_key)), to_char(v_end, 'DD Mon YYYY'));
  else
    v_start := v_today;
    v_end := case when b.paid_until is null then null else public.nairobi_day(b.paid_until) end;
    v_body := format('We received KES %s for your category change. It now waits for admin approval.', p.amount_kes);
  end if;

  update public.payments x set status = 'confirmed', period_start = v_start, period_end = v_end, confirmed_via = p_via, decline_reason = null
  where x.id = p.id returning * into p;
  perform public.post_seller_message(p.business_id, 'payment', 'Payment received', v_body || ' Receipt ' || p.receipt_no || '.',
    jsonb_build_object('payment_id', p.id, 'receipt_no', p.receipt_no), 'payment:' || p.id);
  perform public.write_audit(p.business_id, 'payment_confirmed', 'payment', p.id::text, jsonb_build_object('via', p_via, 'receipt', p.receipt_no));
  return p;
end $function$;

CREATE OR REPLACE FUNCTION public.mpesa_settle_business(p_business uuid, p_tx uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  b public.businesses;
  t public.mpesa_transactions;
  v_price integer;
  v_max integer;
  v_today date := public.nairobi_day(now());
  v_paid date;
  v_start date;
  v_end date;
  v_cap_end date;
  v_months integer;
  v_pay public.payments;
  v_credit numeric;
  v_body text;
  v_ref text;
  v_q jsonb;
  v_need integer;
  v_intent jsonb;
begin
  select * into b from public.businesses where id = p_business for update;
  if not found or b.status = 'deleted' then raise exception 'target_not_found'; end if;
  if p_tx is not null then select * into t from public.mpesa_transactions where id = p_tx; end if;
  v_price := coalesce(b.monthly_price, (select p.price_kes from public.plans p where p.category_id = b.category_id and p.plan_key = b.plan_key));
  if v_price is null or v_price <= 0 then return jsonb_build_object('outcome', 'no_price', 'credit', b.credit_kes); end if;
  v_ref := b.seller_id;

  -- The seller opened an upgrade or category-change payment: that is what this money is for. Apply it when the credit
  -- covers it; until then hold it instead of turning it into a renewal month.
  if b.pay_intent is not null and (b.pay_intent ->> 'set_at')::timestamptz > now() - interval '48 hours' then
    begin
      v_q := public.payment_quote(b, b.pay_intent ->> 'purpose', b.pay_intent ->> 'target_plan', b.pay_intent ->> 'category');
      v_need := (v_q ->> 'amount_kes')::integer;
      if v_need > 0 and b.credit_kes >= v_need then
        v_intent := public.mpesa_apply_purpose(b.id, b.pay_intent ->> 'purpose', b.pay_intent ->> 'target_plan', b.pay_intent ->> 'category', nullif(b.pay_intent ->> 'change_id', '')::uuid);
        select * into b from public.businesses where id = p_business for update;
        -- The upgrade used the money. Anything left over only becomes renewal months if it covers a whole month.
        if b.credit_kes < v_price then
          return v_intent || jsonb_build_object('credit', b.credit_kes, 'business_id', b.id, 'business_name', b.name);
        end if;
      elsif v_need > 0 then
        v_body := format('We received KES %s toward your %s. It costs KES %s, so KES %s more is needed. Pay it to Paybill %s, account %s.',
          trim(to_char(coalesce(t.amount_kes, b.credit_kes), 'FM999G999G990')), case when b.pay_intent ->> 'purpose' = 'upgrade' then 'upgrade' else 'category change' end,
          v_need, trim(to_char(v_need - b.credit_kes, 'FM999G999G990')), coalesce(public.mpesa_paybill(), '-'), v_ref);
        perform public.post_seller_message(b.id, 'payment', 'Payment received, balance due', v_body, jsonb_build_object('credit', b.credit_kes, 'price', v_need),
          'mpesa-hold:' || coalesce(t.id::text, gen_random_uuid()::text));
        perform public.mpesa_queue_sms(b.id, b.application_id, b.phone, 'EpicMKT: ' || v_body, 'mpesa-hold:' || coalesce(t.id::text, gen_random_uuid()::text) || ':sms');
        return jsonb_build_object('outcome', 'held', 'credit', b.credit_kes, 'price', v_need, 'balance', v_need - b.credit_kes, 'business_id', b.id, 'business_name', b.name);
      end if;
    exception when others then
      -- The quote no longer applies (for example the listing expired). Forget the intent and treat the money as a renewal.
      update public.businesses set pay_intent = null where id = b.id;
      select * into b from public.businesses where id = p_business for update;
    end;
  end if;

  v_max := coalesce((select (s.value #>> '{}')::integer from public.site_settings s where s.key = 'max_prepay_months'), 12);
  v_paid := case when b.paid_until is null then null else public.nairobi_day(b.paid_until) end;
  -- Same rule as a manual confirmation: paying on the last day or one day late carries on from the old date.
  v_start := case when v_paid is not null and v_today <= v_paid + public.grace_days_of(b.grace_days) then v_paid else v_today end;
  v_cap_end := (v_today + (v_max || ' months')::interval)::date;
  v_months := floor(b.credit_kes / v_price)::integer;
  v_months := least(v_months, greatest(0, (extract(year from age(v_cap_end, v_start)) * 12 + extract(month from age(v_cap_end, v_start)))::integer));

  if v_months >= 1 then
    v_end := (v_start + (v_months || ' months')::interval)::date;
    insert into public.payments (business_id, application_id, amount_kes, method, reference, mpesa_code, status, kind, plan_key, category_id,
                                 months, period_start, period_end, account_ref, phone, source, confirmed_via, submitted_at, confirmed_at)
    values (b.id, b.application_id, v_months * v_price, 'mpesa', coalesce(t.trans_id, 'CREDIT-' || left(gen_random_uuid()::text, 8)), t.trans_id,
            'confirmed', 'renewal', b.plan_key, b.category_id, v_months, v_start, v_end, t.account, t.payer_phone, 'auto', 'auto',
            coalesce(t.created_at, now()), now())
    returning * into v_pay;
    update public.businesses x set paid_until = public.nairobi_midnight(v_end), credit_kes = x.credit_kes - v_months * v_price,
      status = case when x.status in ('pending', 'expired') then 'live' else x.status end
    where x.id = b.id returning credit_kes into v_credit;
    update public.mpesa_transactions set state = 'applied', payment_id = v_pay.id, applied_at = now()
      where business_id = b.id and state = 'credited';

    v_body := format('We received your M-Pesa payment. %s month%s added: your listing is paid until %s.%s Receipt %s.',
      v_months, case when v_months = 1 then '' else 's' end, to_char(v_end, 'DD Mon YYYY'),
      case when v_credit > 0 then format(' KES %s is kept as credit toward your next payment.', trim(to_char(v_credit, 'FM999G999G990'))) else '' end,
      v_pay.receipt_no);
    perform public.post_seller_message(b.id, 'payment', 'Payment received', v_body,
      jsonb_build_object('payment_id', v_pay.id, 'receipt_no', v_pay.receipt_no, 'months', v_months), 'payment:' || v_pay.id);
    perform public.mpesa_queue_sms(b.id, b.application_id, b.phone, 'EpicMKT: ' || v_body, 'mpesa:' || v_pay.id || ':sms');
    perform public.write_audit(b.id, 'payment_confirmed', 'payment', v_pay.id::text, jsonb_build_object('via', 'auto', 'months', v_months, 'receipt', v_pay.receipt_no));
    return jsonb_build_object('outcome', 'applied', 'months', v_months, 'paid_until', v_end, 'credit', v_credit, 'receipt_no', v_pay.receipt_no,
      'payment_id', v_pay.id, 'business_id', b.id, 'business_name', b.name);
  end if;

  v_credit := b.credit_kes;
  if v_credit >= v_price then
    v_body := format('We received your payment, but your listing is already paid ahead for the maximum of %s months. KES %s is kept as credit and will be used when it is due.',
      v_max, trim(to_char(v_credit, 'FM999G999G990')));
  else
    v_body := format('We received KES %s. One month costs KES %s, so KES %s more is needed. Pay it to Paybill %s, account %s.',
      trim(to_char(coalesce(t.amount_kes, v_credit), 'FM999G999G990')), v_price, trim(to_char(v_price - v_credit, 'FM999G999G990')),
      coalesce(public.mpesa_paybill(), '-'), v_ref);
  end if;
  perform public.post_seller_message(b.id, 'payment', 'Payment received, balance due', v_body,
    jsonb_build_object('credit', v_credit, 'price', v_price), 'mpesa-part:' || coalesce(t.id::text, gen_random_uuid()::text));
  perform public.mpesa_queue_sms(b.id, b.application_id, b.phone, 'EpicMKT: ' || v_body, 'mpesa-part:' || coalesce(t.id::text, gen_random_uuid()::text) || ':sms');
  return jsonb_build_object('outcome', case when v_credit >= v_price then 'capped' else 'part_paid' end, 'credit', v_credit, 'price', v_price,
    'balance', greatest(v_price - v_credit, 0), 'business_id', b.id, 'business_name', b.name);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_business_detail(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      'credit_kes', b.credit_kes, 'grace_days', b.grace_days, 'grace_default', public.default_grace_days(), 'strikes', b.strikes, 'tags', to_jsonb(b.tags),
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
end $function$;

CREATE OR REPLACE FUNCTION public.generate_billing_notices(p_now timestamp with time zone DEFAULT now())
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b record;
  v_left integer;
  v_day text;
  v_n integer := 0;
  v_ok boolean;
  v_g integer;
begin
  for b in select x.id, x.paid_until, x.grace_days from public.businesses x where x.paid_until is not null and x.status in ('live','paused','suspended','expired') loop
    v_left := public.nairobi_day(b.paid_until) - public.nairobi_day(p_now);
    v_g := public.grace_days_of(b.grace_days);
    v_day := to_char(public.nairobi_day(b.paid_until), 'YYYY-MM-DD');
    v_ok := false;
    if v_left in (7, 3, 2) then
      v_ok := public.post_seller_message(b.id, 'reminder', format('Your listing expires in %s days', v_left),
        format('Your subscription runs to %s. Renew before then to stay visible.', to_char(public.nairobi_day(b.paid_until), 'DD Mon YYYY')),
        jsonb_build_object('days_left', v_left), format('reminder:%s:%s', v_left, v_day));
    elsif v_left = 1 then
      v_ok := public.post_seller_message(b.id, 'reminder', 'Your listing expires tomorrow',
        format('Your subscription runs to %s. Renew before then to stay visible.', to_char(public.nairobi_day(b.paid_until), 'DD Mon YYYY')),
        jsonb_build_object('days_left', 1), format('reminder:1:%s', v_day));
    elsif v_left = -1 and v_g > 0 then
      v_ok := public.post_seller_message(b.id, 'grace', format('Your subscription has ended: %s day%s of grace', v_g, case when v_g = 1 then '' else 's' end),
        format('Your listing stays visible for %s. Renew today to avoid being hidden.', case when v_g = 1 then 'one more day' else v_g || ' more days' end), '{}', 'grace:' || v_day);
    elsif v_left < -v_g then
      v_ok := public.post_seller_message(b.id, 'expiry', 'Your subscription has expired',
        'Your listing is hidden from customers. Renew to bring it back.', '{}', 'expiry:' || v_day);
    end if;
    if v_ok then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $function$;

CREATE OR REPLACE FUNCTION public.queue_billing_notices(p_now timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b record;
  v_left integer;
  v_day text;
  v_kind text;
  v_key text;
  v_subject text;
  v_body text;
  v_name text;
  v_inapp integer;
  v_queued integer := 0;
  v_n integer;
  v_g integer;
begin
  v_inapp := public.generate_billing_notices(p_now);

  for b in
    select x.id, x.name, x.paid_until, x.phone, x.email, x.grace_days
      from public.businesses x
     where x.paid_until is not null and x.status in ('live', 'paused', 'suspended', 'expired')
  loop
    v_left := public.nairobi_day(b.paid_until) - public.nairobi_day(p_now);
    v_day := to_char(public.nairobi_day(b.paid_until), 'YYYY-MM-DD');
    v_g := public.grace_days_of(b.grace_days);
    v_name := left(b.name, 40);
    v_kind := null;

    if v_left in (7, 3, 1) then
      v_kind := 'reminder';
      v_key := format('reminder:%s:%s', v_left, v_day);
      v_subject := format('Your listing expires in %s day%s', v_left, case when v_left = 1 then '' else 's' end);
      v_body := format('EpicMKT: "%s" expires in %s day%s (%s). Renew to stay visible.',
        v_name, v_left, case when v_left = 1 then '' else 's' end, to_char(public.nairobi_day(b.paid_until), 'DD Mon YYYY'));
    elsif v_left = -1 and v_g > 0 then
      v_kind := 'grace';
      v_key := 'grace:' || v_day;
      v_subject := format('Your subscription has ended: %s day%s of grace', v_g, case when v_g = 1 then '' else 's' end);
      v_body := format('EpicMKT: your subscription for "%s" has ended. You have %s day%s of grace. Renew today to stay visible.', v_name, v_g, case when v_g = 1 then '' else 's' end);
    elsif v_left between -(v_g + 3) and -(v_g + 1) then
      -- Only the first days after grace; sellers who lapsed long ago are not texted when this first runs.
      v_kind := 'expiry';
      v_key := 'expiry:' || v_day;
      v_subject := 'Your subscription has expired';
      v_body := format('EpicMKT: "%s" is now hidden from customers. Renew to bring it back.', v_name);
    end if;

    if v_kind is null then continue; end if;

    insert into public.messages (business_id, channel, kind, template_key, to_address, subject, body, status, transactional, scheduled_at, read_at, dedupe_key, data)
    values (b.id, 'sms', v_kind, 'billing_' || v_kind, b.phone, v_subject, v_body, 'queued', true, p_now, p_now, v_key || ':sms',
            jsonb_build_object('days_left', v_left))
    on conflict (business_id, dedupe_key) where dedupe_key is not null do nothing;
    get diagnostics v_n = row_count;
    v_queued := v_queued + v_n;

    if b.email is not null and b.email <> '' then
      insert into public.messages (business_id, channel, kind, template_key, to_address, subject, body, status, transactional, scheduled_at, read_at, dedupe_key, data)
      values (b.id, 'email', v_kind, 'billing_' || v_kind, b.email, v_subject, v_body, 'queued', true, p_now, p_now, v_key || ':email',
              jsonb_build_object('days_left', v_left))
      on conflict (business_id, dedupe_key) where dedupe_key is not null do nothing;
      get diagnostics v_n = row_count;
      v_queued := v_queued + v_n;
    end if;
  end loop;

  return jsonb_build_object('inApp', v_inapp, 'queued', v_queued);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_businesses_query(p_tab text DEFAULT 'all'::text, p_search text DEFAULT NULL::text, p_sort text DEFAULT 'paidUntil'::text, p_dir text DEFAULT 'asc'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
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
          'state', state, 'agent', null, 'tags', to_jsonb(tags), 'deleted', deleted, 'unconfirmedPayment', unconfirmed_payment
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
end $function$;

create or replace view public.admin_businesses_v with (security_invoker = true) as
 SELECT b.id,
    b.seller_id,
    b.slug,
    b.name,
    c.name AS category,
    b.county,
    b.town,
    b.owner_name,
    b.phone,
    initcap(b.plan_key) AS plan,
    (b.verification_level = 'verified'::text) AS verified,
    b.featured,
    ((b.deleted_at IS NOT NULL) OR (b.status = 'deleted'::text)) AS deleted,
        CASE
            WHEN ((b.status = 'live'::text) AND (b.paid_until IS NULL)) THEN 'pending'::text
            ELSE b.status
        END AS ui_status,
    b.paid_until,
    nairobi_day(b.paid_until) AS paid_day,
    days_left(b.paid_until) AS days_left,
        CASE
            WHEN ((b.deleted_at IS NOT NULL) OR (b.status = 'deleted'::text)) THEN 'deleted'::text
            WHEN (b.status <> 'live'::text) THEN b.status
            WHEN (b.paid_until IS NULL) THEN 'pending'::text
            WHEN (listing_state(b.paid_until, now(), b.grace_days) = 'expired'::text) THEN 'expired'::text
            WHEN (listing_state(b.paid_until, now(), b.grace_days) = 'grace'::text) THEN 'grace'::text
            WHEN (days_left(b.paid_until) <= 7) THEN 'expiring'::text
            ELSE 'live'::text
        END AS state,
    (COALESCE(s.items, (0)::bigint))::integer AS items,
    COALESCE(s.price_age_days, 0) AS price_age_days,
    (COALESCE(f.open_flags, (0)::bigint))::integer AS open_flags,
    (COALESCE(r.open_reports, (0)::bigint))::integer AS open_reports,
    (EXISTS ( SELECT 1
           FROM payments p
          WHERE ((p.business_id = b.id) AND (p.status = 'submitted'::text)))) AS unconfirmed_payment,
    b.strikes,
    b.tags,
    b.last_login_at,
    COALESCE(b.last_edit_at, b.updated_at) AS last_edit_at,
    b.created_at,
    nairobi_day(b.created_at) AS created_day,
    (round(((100.0 * ((((((((((COALESCE(btrim(b.tagline), ''::text) <> ''::text))::integer + ((COALESCE(btrim(b.description), ''::text) <> ''::text))::integer) + ((b.logo_path IS NOT NULL))::integer) + ((b.cover_path IS NOT NULL))::integer) + ((COALESCE(btrim(b.address), ''::text) <> ''::text))::integer) + ((COALESCE(btrim(b.whatsapp), ''::text) <> ''::text))::integer) + ((b.hours <> '{}'::jsonb))::integer) + ((COALESCE(s.items, (0)::bigint) > 0))::integer))::numeric) / (8)::numeric)))::integer AS completeness,
    COALESCE((nairobi_today() - nairobi_day(b.last_login_at)), 30) AS login_age_days
   FROM ((((businesses b
     LEFT JOIN categories c ON ((c.id = b.category_id)))
     LEFT JOIN LATERAL ( SELECT count(*) AS items,
            max((nairobi_today() - nairobi_day(i.price_confirmed_at))) AS price_age_days
           FROM items i
          WHERE (i.business_id = b.id)) s ON (true))
     LEFT JOIN LATERAL ( SELECT count(*) AS open_flags
           FROM flags fl
          WHERE ((fl.business_id = b.id) AND (fl.status = ANY (ARRAY['open'::text, 'replied'::text])))) f ON (true))
     LEFT JOIN LATERAL ( SELECT count(*) AS open_reports
           FROM reports rp
          WHERE ((rp.business_id = b.id) AND (rp.status = 'open'::text))) r ON (true));

-- ============================================================
-- 0030_admin_message_delete.sql
-- ============================================================
-- 0030_admin_message_delete.sql
-- Admins can remove one message or a whole conversation from the admin app. Sellers keep their own copy.

alter table public.messages add column if not exists admin_hidden_at timestamptz;
create index if not exists messages_admin_visible on public.messages (business_id, created_at desc) where admin_hidden_at is null;

create or replace function public.admin_unread_messages() returns integer
language sql stable security definer set search_path = public as
$$ select case when public.is_admin() then (select count(*)::integer from public.messages m where m.sender = 'seller' and m.channel = 'in_app' and m.admin_read_at is null and m.admin_hidden_at is null) else 0 end $$;
revoke all on function public.admin_unread_messages() from public, anon;
grant execute on function public.admin_unread_messages() to authenticated, service_role;

create or replace function public.admin_delete_message(p_id uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare v_msg public.messages;
begin
  if not public.has_role(array['reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_msg from public.messages where id = p_id and channel = 'in_app' and business_id is not null and admin_hidden_at is null;
  if not found then raise exception 'message_not_found'; end if;
  update public.messages set admin_hidden_at = now() where id = p_id;
  perform public.admin_audit_action('message.delete', 'message', p_id::text, null,
    jsonb_build_object('business_id', v_msg.business_id, 'sender', v_msg.sender), 'Message deleted', v_msg.business_id);
  return 1;
end $$;
revoke all on function public.admin_delete_message(uuid) from public, anon;
grant execute on function public.admin_delete_message(uuid) to authenticated, service_role;

create or replace function public.admin_delete_conversation(p_business uuid, p_thread uuid default null) returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if not public.has_role(array['reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_business is null then raise exception 'invalid_input'; end if;
  update public.messages set admin_hidden_at = now()
   where business_id = p_business and channel = 'in_app' and admin_hidden_at is null
     and (p_thread is null or thread_id = p_thread);
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'message_not_found'; end if;
  perform public.admin_audit_action('conversation.delete', 'business', p_business::text, null,
    jsonb_build_object('messages', v_n, 'thread_id', p_thread), case when p_thread is null then 'Conversation deleted' else 'Thread deleted' end, p_business);
  return v_n;
end $$;
revoke all on function public.admin_delete_conversation(uuid, uuid) from public, anon;
grant execute on function public.admin_delete_conversation(uuid, uuid) to authenticated, service_role;

-- ============================================================
-- 0031_plan_reprice_applications.sql
-- ============================================================
-- 0031_plan_reprice_applications.sql
-- A plan price change reaches every application that has not been paid in full and activated, at once.
-- Live sellers keep the monthly price on their business. An admin's per-application price override still wins.

create or replace function public.plans_reprice_applications() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a public.applications;
  v_price integer;
begin
  for a in
    select * from public.applications x
     where x.category_id = new.category_id and x.plan_key = new.plan_key and x.status not in ('activated', 'rejected')
     for update
  loop
    update public.applications
       set price_at_submission = new.price_kes,
           plan_snapshot = jsonb_set(coalesce(plan_snapshot, '{}'::jsonb), '{price_kes}', to_jsonb(new.price_kes), true)
     where id = a.id returning * into a;
    v_price := public.mpesa_price(a);

    if a.status = 'payment_confirming' and a.credit_kes < v_price then
      update public.applications set status = 'approved', payment_code = null where id = a.id;
      insert into public.application_events (application_id, actor, type, data)
      values (a.id, 'system', 'price_changed', jsonb_build_object('price', v_price, 'credit', a.credit_kes, 'back_to', 'approved'));
    elsif a.status = 'approved' and v_price > 0 and a.credit_kes >= v_price then
      update public.applications set status = 'payment_confirming',
             payment_code = (select t.trans_id from public.mpesa_transactions t where t.application_id = a.id and t.state = 'credited' order by t.created_at desc limit 1)
       where id = a.id;
      insert into public.application_events (application_id, actor, type, data)
      values (a.id, 'system', 'price_changed', jsonb_build_object('price', v_price, 'credit', a.credit_kes, 'to', 'payment_confirming'));
      perform public.notify_admin('payment_received', null, jsonb_build_object('application_id', a.id, 'business_name', a.business_name, 'ready', true));
    else
      insert into public.application_events (application_id, actor, type, data)
      values (a.id, 'system', 'price_changed', jsonb_build_object('price', v_price));
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists t_plans_reprice on public.plans;
create trigger t_plans_reprice after update of price_kes on public.plans
  for each row when (old.price_kes is distinct from new.price_kes)
  execute function public.plans_reprice_applications();

-- ============================================================
-- 0035_public_exceptions.sql
-- ============================================================
-- 0035_public_exceptions.sql
-- Customers see opening-hours exceptions (closed days, special hours) so "open now" and "opens at" are right.
-- Only the public fields of today and upcoming dates leave the database: id, date, kind, intervals, note.
-- Past dates are dropped here as well, so an old exception never reaches a customer even if it is still stored.
-- The businesses table itself stays closed to anon; these two views are the only way in.

create or replace function public.public_exceptions(p_list jsonb) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(
    (select jsonb_agg(jsonb_build_object('id', e -> 'id', 'date', e -> 'date', 'kind', e -> 'kind', 'intervals', coalesce(e -> 'intervals', '[]'::jsonb), 'note', e -> 'note') order by e ->> 'date')
       from jsonb_array_elements(case when jsonb_typeof(p_list) = 'array' then p_list else '[]'::jsonb end) e
      where e ->> 'date' ~ '^\d{4}-\d{2}-\d{2}$'
        and (e ->> 'date')::date >= public.nairobi_day(now())),
    '[]'::jsonb);
$$;
revoke all on function public.public_exceptions(jsonb) from public;
grant execute on function public.public_exceptions(jsonb) to anon, authenticated, service_role;

-- New columns go last so the existing view definitions stay valid.
create or replace view public.public_businesses with (security_barrier = true) as
select
  b.id, b.slug, b.name, b.category_id, b.plan_key, b.verification_level, b.tagline, b.description,
  b.phone, b.whatsapp, b.socials, b.amenities, b.payment_methods, b.delivery_area,
  b.county, b.town, b.address, b.lat, b.lng, b.logo_path, b.cover_path, b.tags, b.hours, b.created_at,
  public.public_exceptions(b.exceptions) as exceptions
from public.businesses b
where public.business_is_visible(b);
revoke all on public.public_businesses from public;
grant select on public.public_businesses to anon, authenticated, service_role;

-- Flash cards show an open/closed chip from the business hours, so they need the exceptions too.
create or replace view public.public_flash_sales with (security_barrier = true) as
select
  s.id, s.business_id, s.item_id, s.headline, s.starts_at, s.ends_at,
  s.discount_type, s.discount_value, s.variant_overrides, s.quantity_note,
  i.name as item_name, i.description as item_description, i.section as item_section,
  i.price_type as item_price_type, i.unit as item_unit, i.availability as item_availability,
  (select m.path from public.item_media m where m.item_id = i.id and m.kind = 'image' order by m.sort, m.created_at limit 1) as item_image_path,
  i.price as regular_price,
  d.p as sale_price,
  i.price - d.p as savings,
  case when i.price > 0 then round((i.price - d.p) / i.price * 100) else 0 end as discount_percent,
  b.slug as business_slug, b.name as business_name, b.category_id as business_category_id,
  b.town as business_town, b.county as business_county, b.lat as business_lat, b.lng as business_lng,
  b.phone as business_phone, b.whatsapp as business_whatsapp, b.logo_path as business_logo_path,
  b.verification_level as business_verification_level, b.hours as business_hours,
  now() as server_now,
  floor(extract(epoch from (s.ends_at - now())) * 1000)::bigint as remaining_ms,
  public.public_exceptions(b.exceptions) as business_exceptions
from public.flash_sales s
join public.items i on i.id = s.item_id
join public.businesses b on b.id = s.business_id
cross join lateral (select public.flash_discounted_price(s.discount_type, s.discount_value, i.price) as p) d
where s.status in ('scheduled','live')
  and now() >= s.starts_at
  and now() < s.ends_at
  and public.business_is_visible(b)
  and i.visible and not i.hidden_by_admin and not i.removed_by_admin
  and i.availability not in ('out_of_stock','unavailable')
  and i.price is not null and i.price_type in ('fixed','from')
  and d.p > 0 and d.p < i.price;
revoke all on public.public_flash_sales from public;
grant select on public.public_flash_sales to anon, authenticated, service_role;

-- ============================================================
-- 0036_exception_overnight.sql
-- ============================================================
-- 0036_exception_overnight.sql
-- Special-hours intervals may run past midnight: an interval whose end is not after its start (20:00 to 02:00,
-- or 09:00 to 09:00 for a full 24 hours) means "until that time the next day". The after-midnight part counts for
-- the next date. Only exception_normalize changes: the interval_order check is gone, and an overnight interval
-- occupies the rest of its own date, so an interval that starts later the same date overlaps it.
-- shared/src/seller/exceptions.js applies the same rules (a test keeps them equal).

create or replace function public.exception_normalize(p_date date, p_kind text, p_intervals jsonb, p_note text, p_today date) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_ints jsonb := '[]';
  v_prev_end text;
  r record;
  n integer;
begin
  if p_date is null then raise exception 'invalid_date'; end if;
  if p_date < p_today then raise exception 'date_in_past'; end if;
  if p_date > p_today + 730 then raise exception 'date_too_far'; end if;
  if p_kind is null or p_kind not in ('closed','special') then raise exception 'invalid_kind'; end if;
  if v_note is not null and (char_length(v_note) > 120 or v_note ~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]') then raise exception 'invalid_note'; end if;

  if p_kind = 'special' then
    if p_intervals is null or jsonb_typeof(p_intervals) <> 'array' or jsonb_array_length(p_intervals) = 0 then raise exception 'intervals_required'; end if;
    n := jsonb_array_length(p_intervals);
    if n > 3 then raise exception 'too_many_intervals'; end if;
    for r in select e as iv from jsonb_array_elements(p_intervals) e loop
      if jsonb_typeof(r.iv) <> 'array' or jsonb_array_length(r.iv) <> 2
         or jsonb_typeof(r.iv -> 0) <> 'string' or jsonb_typeof(r.iv -> 1) <> 'string'
         or (r.iv ->> 0) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (r.iv ->> 1) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        raise exception 'invalid_time';
      end if;
    end loop;
    for r in select e as iv from jsonb_array_elements(p_intervals) e order by e ->> 0 loop
      if v_prev_end is not null and (r.iv ->> 0) <= v_prev_end then raise exception 'intervals_overlap'; end if;
      v_prev_end := case when (r.iv ->> 1) > (r.iv ->> 0) then r.iv ->> 1 else '24:00' end;
      v_ints := v_ints || jsonb_build_array(r.iv);
    end loop;
  end if;

  return jsonb_build_object('date', p_date::text, 'kind', p_kind, 'intervals', v_ints, 'note', v_note);
end $$;

revoke all on function public.exception_normalize(date, text, jsonb, text, date) from public, anon;
grant execute on function public.exception_normalize(date, text, jsonb, text, date) to authenticated, service_role;

-- ============================================================
-- 0037_public_item_videos.sql
-- ============================================================
-- 0037_public_item_videos.sql
-- Customers can watch an item's videos. public_items already lists image paths; this adds the video paths, in the same
-- order sellers set (sort, then upload time). Only the storage path leaves the database, exactly like image_paths, and
-- only for items that are already public (visible, not draft, not hidden or removed by an admin, business live).
-- The new column goes last so the existing view definition stays valid.

create or replace view public.public_items with (security_barrier = true) as
select
  i.id, i.business_id, i.name, i.description, i.section, i.price, i.price_max, i.price_type, i.unit,
  i.availability, i.sort, i.created_at,
  coalesce((select jsonb_agg(m.path order by m.sort, m.created_at) from public.item_media m where m.item_id = i.id and m.kind = 'image'), '[]'::jsonb) as image_paths,
  coalesce((select jsonb_agg(m.path order by m.sort, m.created_at) from public.item_media m where m.item_id = i.id and m.kind = 'video'), '[]'::jsonb) as video_paths
from public.items i
join public.businesses b on b.id = i.business_id
where public.business_is_visible(b) and i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin;
revoke all on public.public_items from public;
grant select on public.public_items to anon, authenticated, service_role;


-- Make the API see the new functions straight away.
notify pgrst, 'reload schema';

-- Check: all four rows should say true.
select fn, to_regprocedure(fn) is not null as present from unnest(array[
  'public.admin_expiry_radar(integer)', 'public.admin_get_settings()',
  'public.admin_plans_list()', 'public.admin_categories_list()'
]) fn;
