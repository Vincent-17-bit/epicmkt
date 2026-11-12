-- Prompt 5.4: the publish gate on the server.
--
--   * spec_* functions         the SQL twin of shared/src/specRules (specIssues, conditions, label sets). supabase/tests/publish-gate.test.mjs
--                              runs both on the same items and checks they agree, so change both together.
--   * item_check_publish(item) { canSave, canPublish, grandfathered, blockers[], warnings[], score }. Prompt 11.1 calls it.
--   * items_spec_gate trigger  an item cannot become live, and a live item cannot be edited, while a required row is missing. Drafts and hidden
--                              items are always saveable. It runs on the table, so no client and no other function can skip it.
--   * items.spec_gate_exempt   grandfathering: items that were live before this migration stay live; the first real edit of their type, specs,
--                              brand, pack size, includes or options turns the exemption off for good, and the checks apply from then on.
--   * seller_check_item        unchanged unless the fields carry `publish`. With `publish: false` the answer adds `spec` (the issue list the editor
--                              shows); with `publish: true` blockers also make `ok` false and appear in `issues`.
--   * product_types.spec_rows  at most four required rows (a row with requiredIf counts); fragrance gets its rows.
-- seller_save_item is not touched (A04 owns it).

alter table public.items add column if not exists spec_gate_exempt boolean not null default false;
update public.items set spec_gate_exempt = true where not draft;

create or replace function public.spec_rows_required_ok(p jsonb) returns boolean
language sql immutable parallel safe as
$$
  select case when jsonb_typeof(p) = 'array'
    then (select count(*) from jsonb_array_elements(p) e where e ->> 'level' = 'required' or e ? 'requiredIf') <= 4
    else false end
$$;

alter table public.product_types drop constraint if exists product_types_spec_rows_required_max;
alter table public.product_types add constraint product_types_spec_rows_required_max check (public.spec_rows_required_ok(spec_rows));

create or replace function public.spec_filled(v jsonb) returns boolean
language plpgsql immutable parallel safe as $$
declare e jsonb;
begin
  case jsonb_typeof(v)
    when 'string' then return btrim(v #>> '{}', E' \t\r\n') <> '';
    when 'number' then return true;
    when 'boolean' then return true;
    when 'array' then
      for e in select jsonb_array_elements(v) loop
        if public.spec_filled(e) then return true; end if;
      end loop;
      return false;
    else return false;
  end case;
end $$;

create or replace function public.spec_label_set(p text) returns text[]
language sql immutable parallel safe as
$$
  select case p
    when 'condition' then array['New', 'Refurbished', 'Used']
    when 'authenticity' then array['Original', 'Inspired']
    when 'fragranceState' then array['Sealed', 'Tester', 'Decant']
    when 'chargerKind' then array['Original', 'Compatible', 'Refill']
  end
$$;

create or replace function public.spec_row_choices(p_row jsonb) returns text[]
language plpgsql immutable parallel safe as $$
begin
  if jsonb_typeof(p_row -> 'choices') = 'array' then
    return array(select jsonb_array_elements_text(p_row -> 'choices'));
  end if;
  return public.spec_label_set(p_row ->> 'labelSet');
end $$;

create or replace function public.spec_row_own(p_item jsonb, p_row jsonb) returns jsonb
language plpgsql immutable parallel safe as $$
declare
  v_label text := public.normalize_value_key(p_row ->> 'label');
  e jsonb;
begin
  if jsonb_typeof(p_item -> 'specs') = 'array' then
    for e in select jsonb_array_elements(p_item -> 'specs') loop
      if jsonb_typeof(e) = 'object' and public.normalize_value_key(e ->> 'label') = v_label and public.spec_filled(e -> 'value') then
        return e -> 'value';
      end if;
    end loop;
  end if;
  return null;
end $$;

create or replace function public.spec_row_value(p_item jsonb, p_row jsonb) returns jsonb
language plpgsql immutable parallel safe as $$
declare
  v jsonb := public.spec_row_own(p_item, p_row);
  v_field text;
  a jsonb;
begin
  if v is not null then return v; end if;
  v_field := case p_row ->> 'key' when 'brand' then 'brand' when 'pack-size' then 'packSize' when 'includes' then 'includes' end;
  if v_field is not null and public.spec_filled(p_item -> v_field) then return p_item -> v_field; end if;
  if jsonb_typeof(p_item -> 'axes') = 'array' then
    for a in select jsonb_array_elements(p_item -> 'axes') loop
      if jsonb_typeof(a) = 'object' and a ->> 'key' = p_row ->> 'key' and jsonb_typeof(a -> 'values') = 'array' and jsonb_array_length(a -> 'values') > 0 then
        return to_jsonb((select string_agg(coalesce(x ->> 'label', x ->> 'id'), ', ') from jsonb_array_elements(a -> 'values') x));
      end if;
    end loop;
  end if;
  return null;
end $$;

create or replace function public.spec_tags(p_value jsonb) returns text[]
language sql stable security definer set search_path = public as
$$
  select coalesce(array_agg(distinct x), '{}')
  from public.option_values o
  join public.option_values t on t.id = coalesce(o.merged_into, o.id)
  cross join lateral unnest(t.tags) x
  where o.key = public.normalize_value_key(p_value #>> '{}')
$$;

create or replace function public.spec_cond_eval(p_cond jsonb, p_rows jsonb, p_item jsonb) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  c jsonb;
  v_row jsonb;
  v jsonb;
  v_key text;
begin
  if p_cond is null or jsonb_typeof(p_cond) = 'null' then return true; end if;
  if jsonb_typeof(p_cond -> 'all') = 'array' then
    for c in select jsonb_array_elements(p_cond -> 'all') loop
      if not public.spec_cond_eval(c, p_rows, p_item) then return false; end if;
    end loop;
    return true;
  end if;
  if jsonb_typeof(p_cond -> 'any') = 'array' then
    for c in select jsonb_array_elements(p_cond -> 'any') loop
      if public.spec_cond_eval(c, p_rows, p_item) then return true; end if;
    end loop;
    return false;
  end if;
  if p_cond ? 'not' then return not public.spec_cond_eval(p_cond -> 'not', p_rows, p_item); end if;
  select r into v_row from jsonb_array_elements(p_rows) r where r ->> 'key' = p_cond ->> 'row' limit 1;
  if v_row is null then return false; end if;
  v := public.spec_row_value(p_item, v_row);
  if p_cond ? 'present' then return public.spec_filled(v) = (p_cond ->> 'present')::boolean; end if;
  if not public.spec_filled(v) then return false; end if;
  if p_cond ? 'tag' then return (p_cond ->> 'tag') = any (public.spec_tags(v)); end if;
  v_key := public.normalize_value_key(v #>> '{}');
  if p_cond ? 'equals' then return public.normalize_value_key(p_cond ->> 'equals') = v_key; end if;
  if jsonb_typeof(p_cond -> 'in') = 'array' then
    return exists (select 1 from jsonb_array_elements_text(p_cond -> 'in') x where public.normalize_value_key(x) = v_key);
  end if;
  return false;
end $$;

create or replace function public.spec_generic_rows() returns jsonb
language sql immutable parallel safe as
$$
  select jsonb_build_array(
    jsonb_build_object('key', 'brand', 'label', 'Brand', 'level', 'recommended', 'input', 'openValue'),
    jsonb_build_object('key', 'material', 'label', 'Material', 'level', 'recommended', 'input', 'openValue'),
    jsonb_build_object('key', 'colour', 'label', 'Colour', 'level', 'recommended', 'input', 'openValue'),
    jsonb_build_object('key', 'size', 'label', 'Size', 'level', 'recommended', 'input', 'text'),
    jsonb_build_object('key', 'weight', 'label', 'Weight', 'level', 'recommended', 'input', 'text'),
    jsonb_build_object('key', 'pack-size', 'label', 'Pack size', 'level', 'recommended', 'input', 'text'),
    jsonb_build_object('key', 'warranty', 'label', 'Warranty', 'level', 'recommended', 'input', 'text'),
    jsonb_build_object('key', 'country-of-origin', 'label', 'Country of origin', 'level', 'recommended', 'input', 'text'),
    jsonb_build_object('key', 'includes', 'label', 'What is in the box', 'level', 'recommended', 'input', 'text'))
$$;

-- The rules engine. p_item: { productTypeId, specs: [{label, value}], brand, packSize, includes, axes: [...] }.
create or replace function public.item_spec_issues(p_item jsonb, p_grandfathered boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_defined jsonb;
  v_rows jsonb := '[]'::jsonb;
  r jsonb;
  v_level text;
  v_present boolean;
  v_own jsonb;
  v_invalid boolean;
  v_choices text[];
  v_key text;
  v_blockers jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_recommended integer := 0;
  v_answered integer := 0;
  v_issue jsonb;
begin
  select t.spec_rows into v_defined from public.product_types t where t.id = nullif(p_item ->> 'productTypeId', '');
  if v_defined is null or jsonb_typeof(v_defined) <> 'array' or jsonb_array_length(v_defined) = 0 then v_defined := public.spec_generic_rows(); end if;

  for r in select jsonb_array_elements(v_defined) loop
    if r ? 'showIf' and not public.spec_cond_eval(r -> 'showIf', v_defined, p_item) then continue; end if;
    v_level := r ->> 'level';
    if r ? 'requiredIf' and public.spec_cond_eval(r -> 'requiredIf', v_defined, p_item) then v_level := 'required'; end if;
    if v_level = 'optional' then continue; end if;

    v_present := public.spec_filled(public.spec_row_value(p_item, r));
    v_own := public.spec_row_own(p_item, r);
    v_choices := public.spec_row_choices(r);
    v_invalid := false;
    if v_present and v_own is not null and r ->> 'input' = 'choice' and v_choices is not null then
      v_key := public.normalize_value_key(v_own #>> '{}');
      v_invalid := not exists (select 1 from unnest(v_choices) c where public.normalize_value_key(c) = v_key);
    end if;

    if v_level = 'recommended' then
      v_recommended := v_recommended + 1;
      if v_present and not v_invalid then v_answered := v_answered + 1;
      elsif v_invalid then
        v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('key', r ->> 'key', 'label', r ->> 'label', 'level', v_level, 'code', 'invalid',
          'message', (r ->> 'label') || ' must be one of: ' || array_to_string(v_choices, ', ')));
      else
        v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('key', r ->> 'key', 'label', r ->> 'label', 'level', v_level, 'code', 'missing',
          'message', (r ->> 'label') || ' is recommended'));
      end if;
      continue;
    end if;

    if v_present and not v_invalid then continue; end if;
    if v_invalid then
      v_issue := jsonb_build_object('key', r ->> 'key', 'label', r ->> 'label', 'level', v_level, 'code', 'invalid',
        'message', (r ->> 'label') || ' must be one of: ' || array_to_string(v_choices, ', '));
    else
      v_issue := jsonb_build_object('key', r ->> 'key', 'label', r ->> 'label', 'level', v_level, 'code', 'missing', 'message', (r ->> 'label') || ' is required');
    end if;
    if p_grandfathered then v_warnings := v_warnings || jsonb_build_array(v_issue);
    else v_blockers := v_blockers || jsonb_build_array(v_issue);
    end if;
  end loop;

  return jsonb_build_object('blockers', v_blockers, 'warnings', v_warnings,
    'score', case when v_recommended = 0 then 100 else round(v_answered::numeric * 100 / v_recommended)::integer end);
end $$;

-- The gate. p_item may carry `id` of a stored item: if that item is grandfathered and this is not an edit, blockers are only warnings.
create or replace function public.item_check_publish(p_item jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid;
  v_old public.items;
  v_found boolean := false;
  v_grand boolean := false;
  r jsonb;
begin
  if p_item is null or jsonb_typeof(p_item) <> 'object' then raise exception 'invalid_item' using errcode = 'P0001'; end if;
  begin
    v_id := nullif(p_item ->> 'id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'invalid_item' using errcode = 'P0001';
  end;
  if v_id is not null then
    select * into v_old from public.items i where i.id = v_id and i.business_id = coalesce(public.my_business_id(), i.business_id);
    v_found := found;
  end if;
  if v_found and v_old.spec_gate_exempt
     and (not (p_item ? 'productTypeId') or nullif(p_item ->> 'productTypeId', '') is not distinct from v_old.product_type_id)
     and (not (p_item ? 'specs') or coalesce(nullif(p_item -> 'specs', 'null'::jsonb), '[]'::jsonb) = v_old.specs)
     and (not (p_item ? 'axes') or coalesce(nullif(p_item -> 'axes', 'null'::jsonb), '[]'::jsonb) = coalesce(v_old.option_axes, '[]'::jsonb))
     and (not (p_item ? 'brand') or nullif(p_item ->> 'brand', '') is not distinct from v_old.brand)
     and (not (p_item ? 'packSize') or nullif(p_item ->> 'packSize', '') is not distinct from v_old.pack_size)
  then
    v_grand := true;
  end if;
  r := public.item_spec_issues(p_item, v_grand);
  return r || jsonb_build_object('canSave', true, 'canPublish', jsonb_array_length(r -> 'blockers') = 0, 'grandfathered', v_grand);
end $$;
revoke all on function public.item_check_publish(jsonb), public.item_spec_issues(jsonb, boolean) from public, anon;
grant execute on function public.item_check_publish(jsonb) to authenticated, service_role;
grant execute on function public.item_spec_issues(jsonb, boolean) to service_role;

create or replace function public.items_spec_gate() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_live_new boolean := not new.draft and new.visible;
  v_live_old boolean := false;
  v_edit boolean := false;
  v_publish boolean;
  r jsonb;
begin
  if tg_op = 'INSERT' then
    new.spec_gate_exempt := false;
  else
    v_live_old := not old.draft and old.visible;
    v_edit := (new.product_type_id, new.specs, new.option_axes, new.brand, new.pack_size, new.includes)
      is distinct from (old.product_type_id, old.specs, old.option_axes, old.brand, old.pack_size, old.includes);
    new.spec_gate_exempt := old.spec_gate_exempt and not v_edit;
  end if;
  if not v_live_new then return new; end if;
  v_publish := not v_live_old;
  if not (v_publish or v_edit) then return new; end if;
  if tg_op = 'UPDATE' and v_publish and not v_edit and old.spec_gate_exempt then return new; end if;

  r := public.item_spec_issues(jsonb_build_object('productTypeId', new.product_type_id, 'specs', new.specs, 'brand', new.brand,
    'packSize', new.pack_size, 'includes', to_jsonb(new.includes), 'axes', coalesce(new.option_axes, '[]'::jsonb)), false);
  if jsonb_array_length(r -> 'blockers') > 0 then
    raise exception 'publish_blocked' using errcode = 'P0001', detail = (r -> 'blockers')::text;
  end if;
  new.spec_gate_exempt := false;
  return new;
end $$;

drop trigger if exists items_spec_gate on public.items;
create trigger items_spec_gate before insert or update on public.items
  for each row execute function public.items_spec_gate();

-- seller_check_item: the old behaviour; the spec issue list is added when the caller sends `publish`.
create or replace function public.seller_check_item(p_id uuid, p_fields jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f jsonb := coalesce(p_fields, '{}'::jsonb);
  v_asked boolean := f ? 'publish';
  v_publish boolean := coalesce(f ->> 'publish', 'false') = 'true';
  v_biz uuid := public.my_business_id();
  v_state text;
  v_msg text;
  v_base jsonb;
  v_old public.items;
  v_item jsonb;
  v_spec jsonb;
  v_issues jsonb;
  e jsonb;
begin
  perform public.assert_seller_active();
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  f := f - 'publish';
  begin
    perform public.seller_save_item(p_id, f);
    raise exception 'check_done' using errcode = 'P0002';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    if v_state = 'P0002' and v_msg = 'check_done' then
      v_base := jsonb_build_object('ok', true, 'issues', '[]'::jsonb);
    elsif v_state = '42501' then
      raise;
    elsif v_state = 'P0001' then
      v_base := jsonb_build_object('ok', false, 'issues', jsonb_build_array(jsonb_build_object('code', v_msg)));
    else
      v_base := jsonb_build_object('ok', false, 'issues', jsonb_build_array(jsonb_build_object('code', 'invalid_item')));
    end if;
  end;

  if p_id is not null then select * into v_old from public.items i where i.id = p_id and i.business_id = v_biz; end if;
  if not v_asked then return v_base; end if;
  v_item := jsonb_build_object(
    'id', p_id,
    'productTypeId', case when f ? 'productTypeId' then f -> 'productTypeId' else to_jsonb(v_old.product_type_id) end,
    'specs', coalesce(case when f ? 'specs' then nullif(f -> 'specs', 'null'::jsonb) else v_old.specs end, '[]'::jsonb),
    'brand', case when f ? 'brand' then f -> 'brand' else to_jsonb(v_old.brand) end,
    'packSize', case when f ? 'pack_size' then f -> 'pack_size' else to_jsonb(v_old.pack_size) end,
    'includes', coalesce(case when f ? 'includes' then nullif(f -> 'includes', 'null'::jsonb) else to_jsonb(v_old.includes) end, '[]'::jsonb),
    'axes', coalesce(case when jsonb_typeof(f -> 'options') = 'object' and f -> 'options' ? 'axes' then f -> 'options' -> 'axes' else v_old.option_axes end, '[]'::jsonb));
  v_spec := public.item_check_publish(v_item);
  v_issues := v_base -> 'issues';
  if v_publish then
    for e in select jsonb_array_elements(v_spec -> 'blockers') loop
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'spec_' || (e ->> 'code'), 'key', e -> 'key', 'label', e -> 'label', 'level', e -> 'level', 'message', e -> 'message'));
    end loop;
  end if;
  return jsonb_build_object('ok', (v_base ->> 'ok')::boolean and (not v_publish or (v_spec ->> 'canPublish')::boolean), 'issues', v_issues, 'spec', v_spec);
end $$;
revoke all on function public.seller_check_item(uuid, jsonb) from public, anon;
grant execute on function public.seller_check_item(uuid, jsonb) to authenticated, service_role;

update public.product_types set spec_rows = jsonb_build_array(
    jsonb_build_object('key', 'authenticity', 'label', 'Authenticity', 'level', 'required', 'input', 'choice', 'labelSet', 'authenticity'),
    jsonb_build_object('key', 'fragrance-state', 'label', 'Fragrance state', 'level', 'recommended', 'input', 'choice', 'labelSet', 'fragranceState'),
    jsonb_build_object('key', 'notes', 'label', 'Notes', 'level', 'recommended', 'input', 'text'))
  where id = 'fragrance' and spec_rows = '[]'::jsonb;
