-- S8b: seller settings, notification preferences with quiet hours, outbox, reminder jobs.

create or replace function public.jsonb_deep_merge(a jsonb, b jsonb) returns jsonb
language plpgsql immutable as $$
declare
  k text;
  out jsonb := '{}';
begin
  if jsonb_typeof(a) <> 'object' or jsonb_typeof(b) <> 'object' then return b; end if;
  out := a;
  for k in select jsonb_object_keys(b) loop
    out := jsonb_set(out, array[k], case when out ? k then public.jsonb_deep_merge(out -> k, b -> k) else b -> k end, true);
  end loop;
  return out;
end $$;

-- True when free text carries a link or a phone-like run of seven or more digits.
create or replace function public.settings_text_bad(p text) returns boolean
language sql immutable as $$
  select p ~* '(https?:|www\.|wa\.me|bit\.ly|t\.me|\y[a-z0-9-]+\.(com|co|ke|org|net|io|me|app|link|ly|info|biz|dev)\y|[a-z0-9]/[a-z0-9])'
      or regexp_replace(p, '\{[a-z]+\}', '', 'g') ~ '(\+?[0-9][[:space:]().-]*){7,}'
$$;

create or replace function public.settings_greeting_bad(p text) returns boolean
language sql immutable as $$
  select btrim(p) = '' or char_length(p) > 160 or public.settings_text_bad(p)
      or exists (select 1 from regexp_matches(p, '\{([^{}]*)\}', 'g') m where m[1] not in ('item', 'price'))
      or regexp_replace(p, '\{(item|price)\}', '', 'g') ~ '[{}]'
$$;

create or replace function public.validate_seller_settings() returns trigger
language plpgsql as $$
declare
  s jsonb := new.settings;
  v jsonb;
  e jsonb;
  k text;
  ev text;
  crit text[] := array['expiry', 'payment', 'admin_question', 'suspension'];
  events text[] := array['expiry', 'payment', 'admin_question', 'suspension', 'change_decision', 'customer_report', 'removal', 'closure_reminder'];
  units jsonb;
  u jsonb;
  ids text[] := '{}';
begin
  if s ? 'idle_minutes' and (jsonb_typeof(s -> 'idle_minutes') <> 'number' or (s ->> 'idle_minutes') not in ('15', '30', '60', '120')) then
    raise exception 'invalid_idle_minutes';
  end if;

  if s ? 'appearance' then
    v := s -> 'appearance';
    if jsonb_typeof(v) <> 'object' then raise exception 'invalid_appearance'; end if;
    if v ? 'theme' and coalesce(v ->> 'theme', '') <> all (array['light', 'dark', 'system']) then raise exception 'invalid_appearance'; end if;
    if v ? 'text_size' and coalesce(v ->> 'text_size', '') <> all (array['normal', 'large', 'xlarge']) then raise exception 'invalid_appearance'; end if;
    if v ? 'density' and coalesce(v ->> 'density', '') <> all (array['comfortable', 'compact']) then raise exception 'invalid_appearance'; end if;
    if v ? 'card_view' and coalesce(v ->> 'card_view', '') <> all (array['comfortable', 'compact', 'list']) then raise exception 'invalid_appearance'; end if;
    foreach k in array array['reduce_motion', 'remember_card_view'] loop
      if v ? k and jsonb_typeof(v -> k) <> 'boolean' then raise exception 'invalid_appearance'; end if;
    end loop;
  end if;

  if s ? 'notifications' then
    v := s -> 'notifications';
    if jsonb_typeof(v) <> 'object' then raise exception 'invalid_notifications'; end if;
    if v ? 'events' then
      if jsonb_typeof(v -> 'events') <> 'object' then raise exception 'invalid_notifications'; end if;
      for ev in select jsonb_object_keys(v -> 'events') loop
        if not (ev = any (events)) then raise exception 'invalid_notifications'; end if;
        e := v -> 'events' -> ev;
        if jsonb_typeof(e) <> 'object' then raise exception 'invalid_notifications'; end if;
        foreach k in array array['in_app', 'sms', 'email'] loop
          if e ? k and jsonb_typeof(e -> k) <> 'boolean' then raise exception 'invalid_notifications'; end if;
        end loop;
        if ev = any (crit) and e ? 'in_app' and (e ->> 'in_app') <> 'true' then raise exception 'critical_in_app_required'; end if;
      end loop;
    end if;
    if v ? 'quiet_hours' then
      e := v -> 'quiet_hours';
      if jsonb_typeof(e) <> 'object' then raise exception 'invalid_quiet_hours'; end if;
      if e ? 'enabled' and jsonb_typeof(e -> 'enabled') <> 'boolean' then raise exception 'invalid_quiet_hours'; end if;
      foreach k in array array['start', 'end'] loop
        if e ? k and (jsonb_typeof(e -> k) <> 'string' or (e ->> k) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then raise exception 'invalid_quiet_hours'; end if;
      end loop;
      if e ? 'start' and e ? 'end' and e ->> 'start' = e ->> 'end' then raise exception 'invalid_quiet_hours'; end if;
    end if;
  end if;

  if s ? 'catalog' then
    v := s -> 'catalog';
    if jsonb_typeof(v) <> 'object' then raise exception 'invalid_catalog'; end if;
    if v ? 'default_availability' and coalesce(v ->> 'default_availability', '') <> all (array['available', 'limited_stock', 'out_of_stock', 'unavailable']) then raise exception 'invalid_catalog'; end if;
    if v ? 'low_stock_threshold' and (jsonb_typeof(v -> 'low_stock_threshold') <> 'number' or (v ->> 'low_stock_threshold') !~ '^[0-9]{1,4}$' or (v ->> 'low_stock_threshold')::integer > 1000) then raise exception 'invalid_catalog'; end if;
    if v ? 'price_reminder_days' and coalesce(v ->> 'price_reminder_days', '') <> all (array['14', '30', '60']) then raise exception 'invalid_catalog'; end if;
    foreach k in array array['start_visible', 'show_only_n_left'] loop
      if v ? k and jsonb_typeof(v -> k) <> 'boolean' then raise exception 'invalid_catalog'; end if;
    end loop;
    if v ? 'default_units' then
      units := v -> 'default_units';
      if jsonb_typeof(units) <> 'object' or (select count(*) from jsonb_object_keys(units)) > 60 then raise exception 'invalid_catalog'; end if;
      for k in select jsonb_object_keys(units) loop
        if k !~ '^[A-Za-z0-9_-]{1,40}$' or jsonb_typeof(units -> k) <> 'array' or jsonb_array_length(units -> k) > 12 then raise exception 'invalid_catalog'; end if;
        for u in select value from jsonb_array_elements(units -> k) loop
          if jsonb_typeof(u) <> 'string' or char_length(btrim(u #>> '{}')) not between 1 and 20 then raise exception 'invalid_catalog'; end if;
        end loop;
      end loop;
    end if;
  end if;

  if s ? 'messaging' then
    v := s -> 'messaging';
    if jsonb_typeof(v) <> 'object' then raise exception 'invalid_messaging'; end if;
    if v ? 'whatsapp_greeting' and (jsonb_typeof(v -> 'whatsapp_greeting') <> 'string' or public.settings_greeting_bad(v ->> 'whatsapp_greeting')) then raise exception 'invalid_greeting'; end if;
    if v ? 'closure_reasons' then
      if jsonb_typeof(v -> 'closure_reasons') <> 'array' or jsonb_array_length(v -> 'closure_reasons') > 8 then raise exception 'invalid_closure_reasons'; end if;
      for e in select value from jsonb_array_elements(v -> 'closure_reasons') loop
        if jsonb_typeof(e) <> 'object' or jsonb_typeof(e -> 'id') <> 'string' or jsonb_typeof(e -> 'label') <> 'string'
           or (e ->> 'id') !~ '^[A-Za-z0-9_-]{1,40}$' or (e ->> 'id') = any (ids)
           or char_length(btrim(e ->> 'label')) not between 1 and 40 or public.settings_text_bad(e ->> 'label')
           or (e ? 'message' and (jsonb_typeof(e -> 'message') <> 'string' or char_length(e ->> 'message') > 140 or public.settings_text_bad(e ->> 'message'))) then
          raise exception 'invalid_closure_reasons';
        end if;
        ids := ids || (e ->> 'id');
      end loop;
    end if;
  end if;

  if s ? 'business' then
    v := s -> 'business';
    if jsonb_typeof(v) <> 'object' then raise exception 'invalid_business_prefs'; end if;
    if v ? 'show_closes_chip' and jsonb_typeof(v -> 'show_closes_chip') <> 'boolean' then raise exception 'invalid_business_prefs'; end if;
    if v ? 'partial_closure_message' and (jsonb_typeof(v -> 'partial_closure_message') <> 'string' or char_length(v ->> 'partial_closure_message') > 140 or public.settings_text_bad(v ->> 'partial_closure_message')) then raise exception 'invalid_business_prefs'; end if;
    if v ? 'announcement' then
      e := v -> 'announcement';
      if jsonb_typeof(e) <> 'object'
         or (e ? 'enabled' and jsonb_typeof(e -> 'enabled') <> 'boolean')
         or (e ? 'text' and (jsonb_typeof(e -> 'text') <> 'string' or char_length(e ->> 'text') > 280))
         or (e ? 'days' and (jsonb_typeof(e -> 'days') <> 'number' or (e ->> 'days') !~ '^[0-9]{1,2}$' or (e ->> 'days')::integer not between 1 and 90)) then
        raise exception 'invalid_business_prefs';
      end if;
    end if;
  end if;

  if s ? 'onboarding' then
    v := s -> 'onboarding';
    if jsonb_typeof(v) <> 'object' then raise exception 'invalid_onboarding'; end if;
    if v ? 'status' and coalesce(v ->> 'status', '') <> all (array['active', 'skipped', 'done']) then raise exception 'invalid_onboarding'; end if;
    if v ? 'qr_seen' and jsonb_typeof(v -> 'qr_seen') <> 'boolean' then raise exception 'invalid_onboarding'; end if;
    if v ? 'completed_at' and jsonb_typeof(v -> 'completed_at') not in ('string', 'null') then raise exception 'invalid_onboarding'; end if;
    if v ? 'dismissed_tips' then
      if jsonb_typeof(v -> 'dismissed_tips') <> 'array' or jsonb_array_length(v -> 'dismissed_tips') > 40 then raise exception 'invalid_onboarding'; end if;
      for u in select value from jsonb_array_elements(v -> 'dismissed_tips') loop
        if jsonb_typeof(u) <> 'string' or (u #>> '{}') !~ '^[A-Za-z0-9_-]{1,40}$' then raise exception 'invalid_onboarding'; end if;
      end loop;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists t_seller_settings_validate on public.seller_settings;
create trigger t_seller_settings_validate before insert or update on public.seller_settings for each row execute function public.validate_seller_settings();

-- Saves a partial change. It can only touch seller_settings (and mirror the greeting for the public page);
-- status, plan and visibility rules are never reachable from here.
create or replace function public.seller_save_settings(p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_plan text;
  k text;
  v_settings jsonb;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'invalid_patch'; end if;
  foreach k in array coalesce((select array_agg(x) from jsonb_object_keys(p_patch) x), '{}') loop
    if k <> all (array['idle_minutes', 'appearance', 'notifications', 'catalog', 'messaging', 'business', 'onboarding']) then
      raise exception 'field_not_allowed:%', k using errcode = '42501';
    end if;
  end loop;
  select b.plan_key into v_plan from public.businesses b where b.id = v_id;
  if (p_patch #>> '{business,announcement,enabled}') = 'true' and v_plan <> 'premium' then
    raise exception 'premium_only' using errcode = '42501';
  end if;
  insert into public.seller_settings as s (business_id, settings) values (v_id, '{}') on conflict (business_id) do nothing;
  update public.seller_settings s set settings = public.jsonb_deep_merge(s.settings, p_patch) where s.business_id = v_id returning s.settings into v_settings;
  -- The customer-facing page reads these three from the public profile, so mirror them there.
  update public.businesses b set profile = coalesce(b.profile, '{}')
    || case when p_patch #>> '{messaging,whatsapp_greeting}' is not null then jsonb_build_object('whatsapp_greeting', p_patch #>> '{messaging,whatsapp_greeting}') else '{}'::jsonb end
    || case when p_patch #>> '{business,show_closes_chip}' is not null then jsonb_build_object('show_closes_chip', (p_patch #>> '{business,show_closes_chip}')::boolean) else '{}'::jsonb end
    || case when p_patch #>> '{business,partial_closure_message}' is not null then jsonb_build_object('partial_closure_message', p_patch #>> '{business,partial_closure_message}') else '{}'::jsonb end
  where b.id = v_id and (p_patch #>> '{messaging,whatsapp_greeting}' is not null or p_patch #>> '{business,show_closes_chip}' is not null or p_patch #>> '{business,partial_closure_message}' is not null);
  perform public.write_audit(v_id, 'settings_updated', 'seller_settings', v_id::text,
    jsonb_build_object('keys', coalesce((select jsonb_agg(x) from jsonb_object_keys(p_patch) x), '[]')));
  return v_settings;
end $$;

revoke all on function public.seller_save_settings(jsonb) from public, anon;
grant execute on function public.seller_save_settings(jsonb) to authenticated, service_role;

-- ---- outbox, delivery policy, reminders -----------------------------------------------------------

create table if not exists public.message_outbox (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  event text not null check (event in ('expiry', 'payment', 'admin_question', 'suspension', 'change_decision', 'customer_report', 'removal', 'closure_reminder')),
  channel text not null check (channel in ('sms', 'email')),
  kind text not null default 'normal' check (kind in ('critical', 'transactional', 'normal')),
  to_address text not null,
  subject text,
  body text not null check (char_length(body) between 1 and 1000),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  deliver_after timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists message_outbox_due_idx on public.message_outbox (deliver_after) where status = 'pending';
create index if not exists message_outbox_business_idx on public.message_outbox (business_id, created_at desc);
alter table public.message_outbox enable row level security;
revoke all on public.message_outbox from public, anon, authenticated;
grant all on public.message_outbox to service_role;

create table if not exists public.reminder_log (
  business_id uuid not null references public.businesses(id) on delete cascade,
  kind text not null,
  ref text not null,
  created_at timestamptz not null default now(),
  primary key (business_id, kind, ref)
);
alter table public.reminder_log enable row level security;
revoke all on public.reminder_log from public, anon, authenticated;
grant all on public.reminder_log to service_role;

create or replace function public.seller_pref(p_settings jsonb, p_event text, p_channel text) returns boolean
language sql immutable as $$
  select coalesce(
    (p_settings #>> array['notifications', 'events', p_event, p_channel])::boolean,
    case p_event
      when 'customer_report' then p_channel = 'in_app'
      when 'closure_reminder' then p_channel = 'in_app'
      else p_channel in ('in_app', 'sms')
    end
  )
$$;

-- Mirrors deliveryDecision() in shared/src/seller/settings.js. The parity is covered by tests.
create or replace function public.seller_delivery_plan(p_settings jsonb, p_event text, p_channel text, p_kind text default 'normal', p_now timestamptz default now())
returns table (action text, until timestamptz)
language plpgsql stable set search_path = public as $$
declare
  s jsonb := coalesce(p_settings, '{}');
  crit boolean := p_event in ('expiry', 'payment', 'admin_question', 'suspension');
  q jsonb := coalesce(s #> '{notifications,quiet_hours}', '{}');
  qs text := coalesce(q ->> 'start', '21:00');
  qe text := coalesce(q ->> 'end', '07:00');
  enabled boolean := coalesce((q ->> 'enabled')::boolean, true);
  local_now timestamp := p_now at time zone 'Africa/Nairobi';
  mins integer := extract(hour from local_now)::integer * 60 + extract(minute from local_now)::integer;
  sm integer := split_part(qs, ':', 1)::integer * 60 + split_part(qs, ':', 2)::integer;
  em integer := split_part(qe, ':', 1)::integer * 60 + split_part(qe, ':', 2)::integer;
  quiet boolean;
  target timestamp;
begin
  if p_event is null or p_event not in ('expiry', 'payment', 'admin_question', 'suspension', 'change_decision', 'customer_report', 'removal', 'closure_reminder')
     or p_channel not in ('in_app', 'sms', 'email') then
    return query select 'skip'::text, null::timestamptz; return;
  end if;
  if p_channel = 'in_app' then
    if crit or public.seller_pref(s, p_event, 'in_app') then return query select 'send'::text, null::timestamptz; else return query select 'skip'::text, null::timestamptz; end if;
    return;
  end if;
  if not public.seller_pref(s, p_event, p_channel) then return query select 'skip'::text, null::timestamptz; return; end if;
  if p_channel = 'sms' and not crit and p_kind = 'normal' and enabled and sm <> em then
    quiet := case when sm < em then mins >= sm and mins < em else mins >= sm or mins < em end;
    if quiet then
      target := date_trunc('day', local_now) + make_interval(mins => em);
      if target <= local_now then target := target + interval '1 day'; end if;
      return query select 'delay'::text, target at time zone 'Africa/Nairobi'; return;
    end if;
  end if;
  return query select 'send'::text, null::timestamptz;
end $$;

-- Delivers one event to a seller honouring their preferences. in-app goes straight to messages;
-- sms and email go through the outbox, with sms held until quiet hours end when the rules say so.
create or replace function public.seller_notify(p_business uuid, p_event text, p_subject text, p_body text, p_kind text default 'normal', p_now timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b public.businesses;
  s jsonb;
  plan record;
  out jsonb := '{}';
begin
  if p_kind not in ('critical', 'transactional', 'normal') then raise exception 'invalid_kind'; end if;
  select * into b from public.businesses where id = p_business;
  if not found then raise exception 'business_not_found'; end if;
  select st.settings into s from public.seller_settings st where st.business_id = p_business;
  s := coalesce(s, '{}');

  select * into plan from public.seller_delivery_plan(s, p_event, 'in_app', p_kind, p_now);
  out := out || jsonb_build_object('in_app', plan.action);
  if plan.action = 'send' then
    insert into public.messages (business_id, subject, body) values (p_business, left(p_subject, 150), left(p_body, 4000));
  end if;

  select * into plan from public.seller_delivery_plan(s, p_event, 'sms', p_kind, p_now);
  out := out || jsonb_build_object('sms', plan.action);
  if plan.action <> 'skip' and b.phone is not null then
    insert into public.message_outbox (business_id, event, channel, kind, to_address, subject, body, deliver_after)
    values (p_business, p_event, 'sms', p_kind, b.phone, left(p_subject, 150), left(p_body, 1000), coalesce(plan.until, p_now));
  end if;

  select * into plan from public.seller_delivery_plan(s, p_event, 'email', p_kind, p_now);
  out := out || jsonb_build_object('email', plan.action);
  if plan.action <> 'skip' and b.email is not null then
    insert into public.message_outbox (business_id, event, channel, kind, to_address, subject, body, deliver_after)
    values (p_business, p_event, 'email', p_kind, b.email, left(p_subject, 150), left(p_body, 1000), coalesce(plan.until, p_now));
  end if;
  return out;
end $$;

-- Takes due outbox rows for sending. The lease pushes deliver_after forward so a crash retries later.
create or replace function public.outbox_claim(p_limit integer default 50)
returns table (id bigint, business_id uuid, event text, channel text, kind text, to_address text, subject text, body text, attempts integer, settings jsonb)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with due as (
    select o.id from public.message_outbox o
    where o.status = 'pending' and o.deliver_after <= now() and o.attempts < 5
    order by o.deliver_after limit greatest(1, least(coalesce(p_limit, 50), 200)) for update skip locked
  ), taken as (
    update public.message_outbox o set attempts = o.attempts + 1, deliver_after = now() + interval '5 minutes'
    from due where o.id = due.id returning o.*
  )
  select t.id, t.business_id, t.event, t.channel, t.kind, t.to_address, t.subject, t.body, t.attempts,
         (select st.settings from public.seller_settings st where st.business_id = t.business_id)
  from taken t;
end $$;

create or replace function public.outbox_finish(p_id bigint, p_status text, p_error text default null, p_deliver_after timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('pending', 'sent', 'failed', 'skipped') then raise exception 'invalid_status'; end if;
  update public.message_outbox o set
    status = p_status,
    last_error = left(p_error, 300),
    sent_at = case when p_status = 'sent' then now() else o.sent_at end,
    deliver_after = coalesce(p_deliver_after, o.deliver_after),
    attempts = case when p_status = 'pending' and p_deliver_after is not null then greatest(o.attempts - 1, 0) else o.attempts end
  where o.id = p_id;
end $$;

-- Reminder jobs. Safe to run as often as you like: each reminder is logged and sent once.
create or replace function public.seller_run_reminders(p_now timestamptz default now())
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_today date := (p_now at time zone 'Africa/Nairobi')::date;
  v_left integer;
  v_new integer;
  v_count integer := 0;
begin
  for r in select b.id, b.name, b.paid_until from public.businesses b where b.status = 'live' and b.paid_until is not null loop
    v_left := (r.paid_until at time zone 'Africa/Nairobi')::date - v_today;
    if v_left in (7, 3, 1, 0) then
      insert into public.reminder_log (business_id, kind, ref) values (r.id, 'expiry', v_left || ':' || (r.paid_until at time zone 'Africa/Nairobi')::date)
      on conflict do nothing;
      get diagnostics v_new = row_count;
      if v_new > 0 then
        perform public.seller_notify(r.id, 'expiry',
          case when v_left = 0 then 'Your listing expires today' else 'Your listing expires in ' || v_left || (case when v_left = 1 then ' day' else ' days' end) end,
          'Renew to stay visible to customers.', 'normal', p_now);
        v_count := v_count + 1;
      end if;
    end if;
  end loop;

  for r in
    select b.id, b.override ->> 'endsAt' as ends from public.businesses b
    where b.status = 'live' and b.override ->> 'type' = 'closed'
      and (b.override ->> 'endsAt')::timestamptz between p_now and p_now + interval '2 hours'
  loop
    insert into public.reminder_log (business_id, kind, ref) values (r.id, 'closure', r.ends) on conflict do nothing;
    get diagnostics v_new = row_count;
    if v_new > 0 then
      perform public.seller_notify(r.id, 'closure_reminder', 'Your closure ends soon',
        'Your temporary closure is about to end. Extend it if you are not reopening yet.', 'normal', p_now);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'jsonb_deep_merge(jsonb, jsonb)', 'seller_pref(jsonb, text, text)',
    'seller_delivery_plan(jsonb, text, text, text, timestamptz)', 'seller_notify(uuid, text, text, text, text, timestamptz)',
    'outbox_claim(integer)', 'outbox_finish(bigint, text, text, timestamptz)', 'seller_run_reminders(timestamptz)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;

-- Used by the validation trigger, which runs as the seller. Pure functions with no table access.
revoke all on function public.settings_text_bad(text), public.settings_greeting_bad(text) from public, anon;
grant execute on function public.settings_text_bad(text), public.settings_greeting_bad(text) to authenticated, service_role;

-- Imports start from the saved low-stock threshold and "Only N left" choice.
create or replace function public.seller_import_items(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_b public.businesses;
  v_limit integer;
  v_count integer;
  v_next integer;
  v_n integer;
  r jsonb;
  i integer := 0;
  v_name text;
  v_type text;
  v_price numeric;
  v_max numeric;
  v_unit text;
  v_avail text;
  v_section text;
  v_tags text[];
  t text;
  v_thr integer;
  v_show boolean;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select * into v_b from public.businesses where id = v_id for update;
  if v_b.plan_key <> 'premium' then raise exception 'premium_only'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'invalid_rows'; end if;
  v_n := jsonb_array_length(p_rows);
  if v_n > 500 then raise exception 'too_many_rows'; end if;
  -- New items start from the seller's saved catalog defaults (S8b).
  select coalesce((st.settings #>> '{catalog,low_stock_threshold}')::integer, 3), coalesce((st.settings #>> '{catalog,show_only_n_left}')::boolean, true)
    into v_thr, v_show from (select 1) x left join public.seller_settings st on st.business_id = v_id;
  v_thr := coalesce(v_thr, 3);
  v_show := coalesce(v_show, true);
  perform pg_advisory_xact_lock(hashtext(v_id::text || 'items'));
  select p.items_limit into v_limit from public.plans p where p.category_id = v_b.category_id and p.plan_key = v_b.plan_key;
  select count(*), coalesce(max(sort), 0) into v_count, v_next from public.items where business_id = v_id;
  if v_limit is not null and v_count + v_n > v_limit then raise exception 'limit_reached:items'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    v_name := regexp_replace(btrim(coalesce(r ->> 'name', '')), '\s+', ' ', 'g');
    v_type := coalesce(nullif(r ->> 'price_type', ''), 'fixed');
    v_unit := nullif(regexp_replace(btrim(coalesce(r ->> 'unit', '')), '\s+', ' ', 'g'), '');
    v_avail := coalesce(nullif(r ->> 'availability', ''), 'available');
    v_section := nullif(regexp_replace(btrim(coalesce(r ->> 'section', '')), '\s+', ' ', 'g'), '');
    if char_length(v_name) < 2 or char_length(v_name) > 80 then raise exception 'invalid_row:%:name', i; end if;
    if v_type not in ('fixed', 'from', 'range', 'free', 'contact') then raise exception 'invalid_row:%:price_type', i; end if;
    if v_avail not in ('available', 'limited_stock', 'out_of_stock', 'seasonal', 'by_appointment', 'coming_soon', 'unavailable') then raise exception 'invalid_row:%:availability', i; end if;
    if v_unit is not null and char_length(v_unit) > 30 then raise exception 'invalid_row:%:unit', i; end if;
    if v_section is not null and char_length(v_section) > 40 then raise exception 'invalid_row:%:section', i; end if;
    if v_name ~ '^[=+@-]' or v_unit ~ '^[=+@-]' or v_section ~ '^[=+@-]' then raise exception 'invalid_row:%:formula', i; end if;
    v_price := null;
    v_max := null;
    if v_type in ('free', 'contact') then
      if nullif(r ->> 'price', '') is not null then raise exception 'invalid_row:%:price', i; end if;
    else
      begin
        v_price := (r ->> 'price')::numeric;
        v_max := nullif(r ->> 'price_max', '')::numeric;
      exception when others then
        raise exception 'invalid_row:%:price', i;
      end;
      if v_price is null or v_price < 0 or v_price <> trunc(v_price) then raise exception 'invalid_row:%:price', i; end if;
      if v_type = 'range' and (v_max is null or v_max <= v_price or v_max <> trunc(v_max)) then raise exception 'invalid_row:%:price_max', i; end if;
      if v_type <> 'range' and v_max is not null then raise exception 'invalid_row:%:price_max', i; end if;
    end if;
    v_tags := '{}';
    if r ? 'search_tags' and jsonb_typeof(r -> 'search_tags') = 'array' then
      select coalesce(array_agg(x), '{}') into v_tags from jsonb_array_elements_text(r -> 'search_tags') as x;
    end if;
    if cardinality(v_tags) > 15 then raise exception 'invalid_row:%:tags', i; end if;
    foreach t in array v_tags loop
      if char_length(t) > 30 or t ~ '^[=+@-]' then raise exception 'invalid_row:%:tags', i; end if;
    end loop;
    v_next := v_next + 1;
    insert into public.items (business_id, name, price_type, price, price_max, unit, availability, section, search_tags, visible, draft, sort, low_stock_threshold, show_stock_count)
    values (v_id, v_name, v_type, v_price, v_max, v_unit, v_avail, v_section, v_tags, false, true, v_next, v_thr, v_show);
  end loop;

  perform public.write_audit(v_id, 'items_imported', 'items', null, jsonb_build_object('count', v_n));
  return jsonb_build_object('imported', v_n);
end $$;
