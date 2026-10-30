-- 0059_bulk_unlist_assign_undo.sql
-- Bulk actions, part 2: Unlist and Assign agent are real, and bulk actions can be undone.
-- Ported from feature/bulk-unlist-assign-undo (its 0017) onto main. It re-declares the business-list functions as they
-- stand after 0014, 0016 and 0029, so it must run after them. Additive and safe to re-run.
--
--   businesses.agent           the staff member looking after a business (a name from admin_agent_names()).
--   Unlist                     a live business becomes "paused" (the status the seller app calls "Paused (unlisted)").
--   Assign agent               sets or clears businesses.agent. Silent: the seller is not told.
--   admin_bulk_undo            what each undoable bulk action changed, kept for 15 minutes.
--   admin_undo_bulk_business_action(token)
--                              puts back only what is still exactly as the action left it. A business someone
--                              changed in the meantime (a payment moved paid_until, say) is skipped, never overwritten.
--   Payments are not touched: a suspended seller can still see the payment details and pay (seller_payment_instructions and
--   the other payment functions are already open to a suspended seller, see 0016).

alter table public.businesses add column if not exists agent text check (agent is null or char_length(agent) between 1 and 100);

-- Names an admin can pick as an agent: every staff member, by display name (or e-mail when there is none).
create or replace function public.admin_agent_names() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_admin()
    then coalesce((select jsonb_agg(n order by n) from (
           select distinct coalesce(nullif(btrim(a.display_name), ''), nullif(btrim(a.email), '')) as n from public.admins a) x
          where n is not null), '[]'::jsonb)
    else '[]'::jsonb end
$$;
revoke all on function public.admin_agent_names() from public, anon;
grant execute on function public.admin_agent_names() to authenticated, service_role;

-- The agent is read straight from businesses, so the admin_businesses_v view (0014, changed by 0029) keeps its shape.

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
     and (coalesce(p_filters->>'agent', '') = ''
          or (p_filters->>'agent' = '__none__' and not exists (select 1 from public.businesses x where x.id = v.id and x.agent is not null))
          or exists (select 1 from public.businesses x where x.id = v.id and x.agent = p_filters->>'agent'))
     and (coalesce(p_filters->>'createdFrom', '') = '' or v.created_day >= (p_filters->>'createdFrom')::date)
     and (coalesce(p_filters->>'createdTo', '')   = '' or v.created_day <= (p_filters->>'createdTo')::date)
     and (btrim(coalesce(p_search, '')) = '' or
          v.name ilike '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
       or v.phone ilike '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
       or v.seller_id ilike '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
       or v.slug ilike '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
       or v.owner_name ilike '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%')
$$;

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
          'state', state, 'agent', (select x.agent from public.businesses x where x.id = v.id), 'tags', to_jsonb(tags), 'deleted', deleted, 'unconfirmedPayment', unconfirmed_payment
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
    'agents', public.admin_agent_names()
  );
end $$;


-- The business tab "unlisted" is the same set as "paused": an unlisted business is a paused one.
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
    when 'unlisted' then p_state = 'paused'
    when 'suspended' then p_state = 'suspended'
    when 'deleted' then p_state = 'deleted'
    else false
  end
$$;

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
      'unlisted',  count(*) filter (where public.admin_business_in_tab('unlisted', v.state, v.open_flags)),
      'flagged',   count(*) filter (where public.admin_business_in_tab('flagged', v.state, v.open_flags)),
      'deleted',   count(*) filter (where public.admin_business_in_tab('deleted', v.state, v.open_flags))
    )
    from public.admin_businesses_filtered(p_filters, null) v
  );
end $$;

-- ---------------------------------------------------------------------------
-- Undo log. Only the security definer functions below touch it.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_bulk_undo (
  token uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  action text not null,
  entries jsonb not null,           -- [{ "id": <business id>, "before": {field: value}, "after": {field: value} }]
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  undone_at timestamptz
);
alter table public.admin_bulk_undo enable row level security;
revoke all on public.admin_bulk_undo from public, anon, authenticated;
grant all on public.admin_bulk_undo to service_role;

-- Which business columns each action changes (and so what an undo may put back).
create or replace function public.admin_bulk_fields(p_action text) returns text[]
language sql immutable as $$
  select case p_action
    when 'suspend' then array['status', 'status_reason']
    when 'unsuspend' then array['status', 'status_reason']
    when 'unlist' then array['status', 'status_reason']
    when 'strike' then array['strikes']
    when 'tag' then array['tags']
    when 'feature' then array['featured']
    when 'extend' then array['paid_until']
    when 'assign' then array['agent']
    else array[]::text[]
  end
$$;

create or replace function public.admin_pick_fields(p_row public.businesses, p_fields text[]) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(k, to_jsonb(p_row) -> k), '{}'::jsonb) from unnest(p_fields) k
$$;

-- ---------------------------------------------------------------------------
-- The bulk action, now with unlist, assign and an undo token
-- ---------------------------------------------------------------------------
create or replace function public.admin_bulk_business_action(p_action text, p_ids uuid[], p_reason text, p_params jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_params jsonb := coalesce(p_params, '{}'::jsonb);
  b public.businesses;
  a public.businesses;
  v_affected integer := 0;
  v_total integer;
  v_channels jsonb;
  v_tag text;
  v_days integer;
  v_hit boolean;
  v_agent text;
  v_fields text[] := public.admin_bulk_fields(p_action);
  v_entries jsonb := '[]'::jsonb;
  v_token uuid;
begin
  if p_action = 'extend' then
    if not public.has_role(array['finance']) then raise exception 'forbidden' using errcode = '42501'; end if;
  elsif not public.has_role(array['reviewer', 'support']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'invalid_input'; end if;
  if cardinality(p_ids) > 500 then raise exception 'too_many_recipients'; end if;
  if char_length(v_reason) < 5 then raise exception 'reason_required'; end if;
  if p_action not in ('suspend', 'unsuspend', 'strike', 'unlist', 'tag', 'feature', 'extend', 'assign', 'message', 'export') then raise exception 'not_supported'; end if;
  v_total := cardinality(p_ids);

  if p_action = 'tag' then
    v_tag := btrim(coalesce(v_params ->> 'tag', ''));
    if char_length(v_tag) not between 1 and 30 or coalesce(v_params ->> 'mode', '') not in ('add', 'remove') then raise exception 'invalid_input'; end if;
  elsif p_action = 'extend' then
    v_days := coalesce((v_params ->> 'days')::integer, 0);
    if v_days not between 1 and 365 then raise exception 'invalid_input'; end if;
  elsif p_action = 'feature' then
    if jsonb_typeof(v_params -> 'featured') <> 'boolean' then raise exception 'invalid_input'; end if;
  elsif p_action = 'assign' then
    -- "agent": null or "" clears the agent. A name must belong to a staff member.
    if jsonb_typeof(v_params -> 'agent') not in ('string', 'null') and v_params ? 'agent' then raise exception 'invalid_input'; end if;
    v_agent := nullif(btrim(coalesce(v_params ->> 'agent', '')), '');
    if v_agent is not null and not (public.admin_agent_names() ? v_agent) then raise exception 'unknown_agent'; end if;
  end if;

  if p_action = 'export' then
    select count(*) into v_affected from public.businesses x where x.id = any (p_ids);
    return jsonb_build_object('affected', v_affected, 'skipped', v_total - v_affected, 'undoToken', null, 'auditId', null);
  end if;

  if p_action = 'message' then
    v_channels := coalesce(v_params -> 'channels', '["inApp"]'::jsonb);
    if jsonb_typeof(v_channels) <> 'array' or jsonb_array_length(v_channels) = 0 then raise exception 'invalid_input'; end if;
    for b in select * from public.businesses x where x.id = any (p_ids) and x.status <> 'deleted' loop
      v_hit := false;
      if v_channels ? 'inApp' then
        perform public.admin_send_message(array[b.id], v_params ->> 'subject', v_params ->> 'body',
          coalesce((v_params ->> 'needsReply')::boolean, false), coalesce(v_params -> 'attachments', '[]'::jsonb), null, v_reason);
        v_hit := true;
      end if;
      if v_channels ? 'sms' and b.phone is not null then
        insert into public.messages (business_id, channel, sender, subject, body, to_address, status, created_by)
        values (b.id, 'sms', 'admin', null, left(btrim(coalesce(v_params ->> 'body', '')), 4000), b.phone, 'queued', auth.uid());
        v_hit := true;
      end if;
      if v_channels ? 'email' and b.email is not null then
        insert into public.messages (business_id, channel, sender, subject, body, to_address, status, created_by)
        values (b.id, 'email', 'admin', coalesce(nullif(btrim(coalesce(v_params ->> 'subject', '')), ''), 'Message from EpicMKT'),
                left(btrim(coalesce(v_params ->> 'body', '')), 4000), b.email, 'queued', auth.uid());
        v_hit := true;
      end if;
      if v_hit then v_affected := v_affected + 1; end if;
    end loop;
    return jsonb_build_object('affected', v_affected, 'skipped', v_total - v_affected, 'undoToken', null, 'auditId', null);
  end if;

  for b in select * from public.businesses x where x.id = any (p_ids) and x.status <> 'deleted' order by x.id for update loop
    if p_action = 'suspend' then
      continue when b.status = 'suspended';
      update public.businesses set status = 'suspended', status_reason = v_reason where id = b.id;
      perform public.post_seller_message(b.id, 'general', 'Your account has been suspended',
        'EpicMKT suspended your account. Reason: ' || v_reason || ' Your listing is hidden and your account is locked until EpicMKT lifts the suspension. You can still see your payment details and pay.', '{}');
    elsif p_action = 'unsuspend' then
      continue when b.status <> 'suspended';
      update public.businesses set status = 'live', status_reason = null where id = b.id;
      perform public.post_seller_message(b.id, 'general', 'Your account is active again', 'EpicMKT lifted the suspension on your account. Reason: ' || v_reason, '{}');
    elsif p_action = 'unlist' then
      continue when b.status <> 'live';
      update public.businesses set status = 'paused', status_reason = v_reason where id = b.id;
      perform public.post_seller_message(b.id, 'general', 'Your listing has been unlisted',
        'EpicMKT unlisted your listing, so customers cannot see it. Reason: ' || v_reason, '{}');
    elsif p_action = 'strike' then
      update public.businesses set strikes = strikes + 1 where id = b.id;
      perform public.post_seller_message(b.id, 'strike', 'You received a strike',
        v_reason || ' You now have ' || (b.strikes + 1) || ' strike' || case when b.strikes + 1 = 1 then '' else 's' end || '.',
        jsonb_build_object('strikes', b.strikes + 1));
    elsif p_action = 'tag' then
      if v_params ->> 'mode' = 'add' then
        continue when v_tag = any (b.tags);
        update public.businesses set tags = array_append(tags, v_tag) where id = b.id;
      else
        continue when not (v_tag = any (b.tags));
        update public.businesses set tags = array_remove(tags, v_tag) where id = b.id;
      end if;
    elsif p_action = 'feature' then
      continue when b.featured = (v_params ->> 'featured')::boolean;
      update public.businesses set featured = (v_params ->> 'featured')::boolean where id = b.id;
    elsif p_action = 'extend' then
      continue when b.paid_until is null;
      update public.businesses set paid_until = paid_until + make_interval(days => v_days) where id = b.id;
    elsif p_action = 'assign' then
      continue when b.agent is not distinct from v_agent;
      update public.businesses set agent = v_agent where id = b.id;
    end if;
    v_affected := v_affected + 1;
    select * into a from public.businesses where id = b.id;
    v_entries := v_entries || jsonb_build_object('id', b.id, 'before', public.admin_pick_fields(b, v_fields), 'after', public.admin_pick_fields(a, v_fields));
    perform public.admin_audit_action('business.' || p_action, 'business', b.id::text,
      jsonb_build_object('status', b.status, 'strikes', b.strikes, 'tags', to_jsonb(b.tags), 'featured', b.featured, 'paid_until', b.paid_until, 'agent', b.agent),
      v_params, v_reason, b.id);
  end loop;

  if v_affected > 0 then
    insert into public.admin_bulk_undo (actor_id, action, entries) values (auth.uid(), p_action, v_entries) returning token into v_token;
  end if;
  return jsonb_build_object('affected', v_affected, 'skipped', v_total - v_affected,
                            'undoToken', case when v_token is null then null else v_token::text end, 'auditId', null);
end $$;
revoke all on function public.admin_bulk_business_action(text, uuid[], text, jsonb) from public, anon;
grant execute on function public.admin_bulk_business_action(text, uuid[], text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Undo. Same person, within 15 minutes, once. Returns { restored, skipped }.
-- ---------------------------------------------------------------------------
create or replace function public.admin_undo_bulk_business_action(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u public.admin_bulk_undo;
  e jsonb;
  b public.businesses;
  f text;
  v_fields text[];
  v_restored integer := 0;
  v_skipped integer := 0;
  v_same boolean;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into u from public.admin_bulk_undo where token = p_token for update;
  if not found or u.actor_id is distinct from auth.uid() then raise exception 'nothing_to_undo'; end if;
  if u.undone_at is not null or u.expires_at < now() then raise exception 'nothing_to_undo'; end if;
  if u.action = 'extend' then
    if not public.has_role(array['finance']) then raise exception 'forbidden' using errcode = '42501'; end if;
  elsif not public.has_role(array['reviewer', 'support']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_fields := public.admin_bulk_fields(u.action);

  for e in select * from jsonb_array_elements(u.entries) loop
    select * into b from public.businesses where id = (e ->> 'id')::uuid for update;
    -- Put back only what is still exactly as the action left it.
    v_same := found;
    if v_same then
      foreach f in array v_fields loop
        if (to_jsonb(b) -> f) is distinct from (e -> 'after' -> f) then v_same := false; end if;
      end loop;
    end if;
    if not v_same then v_skipped := v_skipped + 1; continue; end if;

    if u.action in ('suspend', 'unsuspend', 'unlist') then
      update public.businesses set status = e -> 'before' ->> 'status', status_reason = e -> 'before' ->> 'status_reason' where id = b.id;
      if u.action = 'suspend' then
        perform public.post_seller_message(b.id, 'general', 'Your account is active again', 'EpicMKT reversed the suspension.', '{}');
      elsif u.action = 'unsuspend' then
        perform public.post_seller_message(b.id, 'general', 'Your account is suspended', 'EpicMKT reversed lifting the suspension. Reason: ' || coalesce(e -> 'before' ->> 'status_reason', 'see earlier notice') || ' You can still see your payment details and pay.', '{}');
      else
        perform public.post_seller_message(b.id, 'general', 'Your listing is visible again', 'EpicMKT reversed unlisting your listing.', '{}');
      end if;
    elsif u.action = 'strike' then
      update public.businesses set strikes = (e -> 'before' ->> 'strikes')::integer where id = b.id;
      perform public.post_seller_message(b.id, 'general', 'A strike was removed', 'EpicMKT reversed the strike it gave you. You now have ' || (e -> 'before' ->> 'strikes') || '.', '{}');
    elsif u.action = 'tag' then
      update public.businesses set tags = coalesce((select array_agg(t) from jsonb_array_elements_text(e -> 'before' -> 'tags') t), '{}') where id = b.id;
    elsif u.action = 'feature' then
      update public.businesses set featured = (e -> 'before' ->> 'featured')::boolean where id = b.id;
    elsif u.action = 'extend' then
      update public.businesses set paid_until = (e -> 'before' ->> 'paid_until')::timestamptz where id = b.id;
    elsif u.action = 'assign' then
      update public.businesses set agent = e -> 'before' ->> 'agent' where id = b.id;
    end if;
    v_restored := v_restored + 1;
    perform public.admin_audit_action('business.undo', 'business', b.id::text, e -> 'after', e -> 'before', 'Undo of ' || u.action, b.id);
  end loop;

  update public.admin_bulk_undo set undone_at = now() where token = u.token;
  return jsonb_build_object('restored', v_restored, 'skipped', v_skipped);
end $$;
revoke all on function public.admin_undo_bulk_business_action(uuid) from public, anon;
grant execute on function public.admin_undo_bulk_business_action(uuid) to authenticated, service_role;
