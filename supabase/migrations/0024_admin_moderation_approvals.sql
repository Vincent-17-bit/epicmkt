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
