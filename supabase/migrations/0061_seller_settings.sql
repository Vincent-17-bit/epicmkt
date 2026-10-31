-- 0061_seller_settings.sql
-- Seller settings (S8b), ported from feat/s8b-settings-help-onboarding onto main.
--   * seller_settings (0005) already holds a seller's settings jsonb; this adds the server-side rules for what may be in it
--     (a validation trigger) and seller_save_settings, the only way the portal writes it (a partial patch, merged deeply).
--   * Saved views keep their own functions (seller_save_views, 0017) and are not touched here.
--   * A few settings are mirrored into businesses.profile so the public page can read them without reading seller_settings.
--   * seller_import_items (latest: 0056) now starts imported items from the saved low-stock level and "Only N left" choice.
-- Not ported: the branch's own message_outbox / seller_notify / reminder jobs. main already delivers SMS and email through
-- messages + claim_due_messages (0021), so notification preferences are stored here but not yet enforced on delivery.

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
  perform public.assert_seller_active();
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

-- Used by the validation trigger, which runs as the seller. Pure functions with no table access.
revoke all on function public.settings_text_bad(text), public.settings_greeting_bad(text) from public, anon;
grant execute on function public.settings_text_bad(text), public.settings_greeting_bad(text) to authenticated, service_role;
revoke all on function public.jsonb_deep_merge(jsonb, jsonb) from public, anon;
grant execute on function public.jsonb_deep_merge(jsonb, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Imports start from the saved catalog defaults
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seller_import_items(p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid := public.my_business_id();
  v_b public.businesses;
  r jsonb;
  v_pos integer := 0;
  v_row integer;
  v_sort integer;
  v_n integer := 0;
  v_tags text[];
  v_brand text;
  v_short text;
  v_pack text;
  v_terms text;
  v_inc text[];
  v_hl jsonb;
  v_specs jsonb;
  v_err text;
  v_thr integer;
  v_show boolean;
  v_skipped jsonb := '[]'::jsonb;
  k text;
  c_formula constant text[] := array['=','+','-','@'];
begin
  perform public.assert_seller_active();
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select * into v_b from public.businesses where id = v_id;
  if v_b.plan_key <> 'premium' then raise exception 'premium_required' using errcode = 'P0001'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'no_rows' using errcode = 'P0001'; end if;
  if jsonb_array_length(p_rows) > 500 then raise exception 'too_many_rows' using errcode = 'P0001'; end if;
  -- New items start from the seller's saved catalog defaults (settings.catalog).
  select coalesce((st.settings #>> '{catalog,low_stock_threshold}')::integer, 3), coalesce((st.settings #>> '{catalog,show_only_n_left}')::boolean, false)
    into v_thr, v_show from (select 1) x left join public.seller_settings st on st.business_id = v_id;
  v_thr := coalesce(v_thr, 3);
  v_show := coalesce(v_show, false);
  select coalesce(max(sort), 0) into v_sort from public.items where business_id = v_id;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_pos := v_pos + 1;
    v_row := case when coalesce(r ->> 'row', '') ~ '^\d{1,6}$' then (r ->> 'row')::integer else v_pos end;

    if left(coalesce(r ->> 'name', ''), 1) = any (c_formula) or left(coalesce(r ->> 'section', ''), 1) = any (c_formula)
       or left(coalesce(r ->> 'unit', ''), 1) = any (c_formula) then
      raise exception 'formula_rejected' using errcode = 'P0001';
    end if;

    -- The optional details. A problem here marks the row as skipped; v_err keeps the first one found.
    v_err := null;
    foreach k in array array['brand', 'short_description', 'pack_size', 'terms'] loop
      if r ? k and jsonb_typeof(r -> k) not in ('string', 'null') then v_err := coalesce(v_err, 'invalid_details'); end if;
      if left(coalesce(r ->> k, ''), 1) = any (c_formula) then v_err := coalesce(v_err, 'formula_rejected'); end if;
    end loop;
    if (r ? 'includes' and jsonb_typeof(r -> 'includes') not in ('array', 'null'))
       or (r ? 'highlights' and jsonb_typeof(r -> 'highlights') not in ('array', 'null'))
       or (r ? 'specs' and jsonb_typeof(r -> 'specs') not in ('array', 'null')) then
      v_err := coalesce(v_err, 'invalid_details');
    end if;

    v_brand := nullif(btrim(coalesce(r ->> 'brand', '')), '');
    v_short := nullif(btrim(coalesce(r ->> 'short_description', '')), '');
    v_pack := nullif(btrim(coalesce(r ->> 'pack_size', '')), '');
    v_terms := nullif(btrim(coalesce(r ->> 'terms', '')), '');
    v_inc := '{}';
    v_hl := '[]'::jsonb;
    v_specs := '[]'::jsonb;

    if v_err is null then
      if exists (select 1 from jsonb_array_elements(case when jsonb_typeof(r -> 'includes') = 'array' then r -> 'includes' else '[]'::jsonb end) e where jsonb_typeof(e) <> 'string') then
        v_err := 'invalid_details';
      else
        select coalesce(array_agg(btrim(x.t) order by x.n) filter (where btrim(x.t) <> ''), '{}') into v_inc
          from jsonb_array_elements_text(case when jsonb_typeof(r -> 'includes') = 'array' then r -> 'includes' else '[]'::jsonb end) with ordinality as x(t, n);
        if exists (select 1 from unnest(v_inc) e where left(e, 1) = any (c_formula)) then v_err := 'formula_rejected'; end if;
      end if;
    end if;

    -- Highlights and specs are normalised as seller_save_item does: a missing group becomes "Features & Specs", a blank lead is dropped.
    if v_err is null and jsonb_typeof(r -> 'highlights') = 'array' then
      select coalesce(jsonb_agg(
        case when jsonb_typeof(x.e) = 'object' and (jsonb_typeof(x.e -> 'title') = 'null' or btrim(coalesce(x.e ->> 'title', 'x')) = '') then x.e - 'title' else x.e end
        order by x.n), '[]'::jsonb) into v_hl
        from jsonb_array_elements(r -> 'highlights') with ordinality as x(e, n);
      if exists (select 1 from jsonb_array_elements(v_hl) e where left(coalesce(e ->> 'text', ''), 1) = any (c_formula) or left(coalesce(e ->> 'title', ''), 1) = any (c_formula)) then
        v_err := 'formula_rejected';
      end if;
    end if;
    if v_err is null and jsonb_typeof(r -> 'specs') = 'array' then
      select coalesce(jsonb_agg(
        case when jsonb_typeof(x.e) = 'object' and (not x.e ? 'group' or jsonb_typeof(x.e -> 'group') = 'null')
          then x.e || jsonb_build_object('group', 'Features & Specs') else x.e end
        order by x.n), '[]'::jsonb) into v_specs
        from jsonb_array_elements(r -> 'specs') with ordinality as x(e, n);
      if exists (select 1 from jsonb_array_elements(v_specs) e where left(coalesce(e ->> 'label', ''), 1) = any (c_formula) or left(coalesce(e ->> 'value', ''), 1) = any (c_formula)) then
        v_err := 'formula_rejected';
      end if;
    end if;

    if v_err is null and (char_length(coalesce(v_brand, '')) > 60 or char_length(coalesce(v_short, '')) > 140
       or char_length(coalesce(v_pack, '')) > 40 or char_length(coalesce(v_terms, '')) > 500
       or not public.item_includes_valid(v_inc) or not public.item_highlights_valid(v_hl) or not public.item_specs_valid(v_specs)) then
      v_err := 'invalid_details';
    end if;

    if v_err is not null then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('row', v_row, 'error', v_err));
      continue;
    end if;

    select coalesce(array_agg(t), '{}') into v_tags from jsonb_array_elements_text(coalesce(r -> 'tags', '[]'::jsonb)) as t;
    v_sort := v_sort + 1;
    insert into public.items (business_id, name, section, price, price_max, price_type, unit, availability, tags, visible, draft, sort,
      brand, short_description, pack_size, terms, includes, highlights, specs, low_stock_threshold, show_stock_count)
    values (v_id, btrim(r ->> 'name'), nullif(btrim(coalesce(r ->> 'section', '')), ''), (r ->> 'price')::numeric, (r ->> 'price_max')::numeric,
      coalesce(r ->> 'price_type', 'fixed'), nullif(btrim(coalesce(r ->> 'unit', '')), ''), coalesce(r ->> 'availability', 'available'), v_tags, false, true, v_sort,
      v_brand, v_short, v_pack, v_terms, v_inc, v_hl, v_specs, v_thr, v_show);
    v_n := v_n + 1;
  end loop;
  perform public.write_audit(v_id, 'items_imported', 'item', null, jsonb_build_object('count', v_n));
  return jsonb_build_object('created', v_n, 'skipped', v_skipped);
end $function$;
