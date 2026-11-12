create or replace function public.spec_condition_valid(c jsonb, keys text[], own text) returns boolean
language plpgsql immutable as $$
declare
  g text;
  e jsonb;
begin
  if jsonb_typeof(c) <> 'object' then return false; end if;
  g := case when c ? 'all' then 'all' when c ? 'any' then 'any' when c ? 'not' then 'not' end;
  if g = 'not' then return (select count(*) from jsonb_object_keys(c)) = 1 and public.spec_condition_valid(c -> 'not', keys, own); end if;
  if g is not null then
    if (select count(*) from jsonb_object_keys(c)) <> 1 or jsonb_typeof(c -> g) <> 'array' or jsonb_array_length(c -> g) = 0 then return false; end if;
    for e in select * from jsonb_array_elements(c -> g) loop
      if not public.spec_condition_valid(e, keys, own) then return false; end if;
    end loop;
    return true;
  end if;
  if jsonb_typeof(c -> 'row') <> 'string' or not ((c ->> 'row') = any (keys)) or (c ->> 'row') = own then return false; end if;
  if (select count(*) from jsonb_object_keys(c) k where k in ('equals', 'in', 'tag', 'present')) <> 1 then return false; end if;
  if c ? 'equals' and jsonb_typeof(c -> 'equals') <> 'string' then return false; end if;
  if c ? 'tag' and (jsonb_typeof(c -> 'tag') <> 'string' or btrim(c ->> 'tag') = '') then return false; end if;
  if c ? 'present' and jsonb_typeof(c -> 'present') <> 'boolean' then return false; end if;
  if c ? 'in' and (jsonb_typeof(c -> 'in') <> 'array' or jsonb_array_length(c -> 'in') = 0
      or exists (select 1 from jsonb_array_elements(c -> 'in') x where jsonb_typeof(x) <> 'string')) then return false; end if;
  return true;
end $$;

create or replace function public.spec_rows_valid(p jsonb) returns boolean
language plpgsql immutable as $$
declare
  keys text[];
  r jsonb;
begin
  if jsonb_typeof(p) <> 'array' then return false; end if;
  select coalesce(array_agg(e ->> 'key'), '{}') into keys from jsonb_array_elements(p) e;
  if cardinality(keys) <> (select count(distinct k) from unnest(keys) k) then return false; end if;
  for r in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(r) <> 'object' or coalesce(r ->> 'key', '') !~ '^[a-z0-9][a-z0-9_-]*$' or btrim(coalesce(r ->> 'label', '')) = ''
       or coalesce(r ->> 'level', '') not in ('required', 'recommended', 'optional')
       or coalesce(r ->> 'input', '') not in ('text', 'number', 'choice', 'openValue', 'boolean', 'dimension') then return false; end if;
    if r ? 'labelSet' and coalesce(r ->> 'labelSet', '') not in ('condition', 'authenticity', 'fragranceState', 'chargerKind') then return false; end if;
    if r ? 'choices' and (jsonb_typeof(r -> 'choices') <> 'array' or jsonb_array_length(r -> 'choices') = 0
        or exists (select 1 from jsonb_array_elements(r -> 'choices') x where jsonb_typeof(x) <> 'string' or btrim(x #>> '{}') = '')) then return false; end if;
    if r ->> 'input' = 'choice' and not (r ? 'choices' or r ? 'labelSet') then return false; end if;
    if r ? 'requiredIf' and not public.spec_condition_valid(r -> 'requiredIf', keys, r ->> 'key') then return false; end if;
    if r ? 'showIf' and not public.spec_condition_valid(r -> 'showIf', keys, r ->> 'key') then return false; end if;
  end loop;
  return true;
end $$;

create or replace function public.admin_spec_rows_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(array['reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'specRows', t.spec_rows) order by t.name)
                   from public.product_types t where t.active), '[]'::jsonb);
end $$;

create or replace function public.admin_save_spec_rows(p_id text, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
begin
  if not public.has_role(array['owner']) then raise exception 'forbidden' using errcode = '42501'; end if;
  select spec_rows into v_old from public.product_types where id = p_id for update;
  if not found then raise exception 'type_not_found' using errcode = 'P0001'; end if;
  if not public.spec_rows_valid(p_rows) then raise exception 'invalid_spec_rows' using errcode = 'P0001'; end if;
  if not public.spec_rows_required_ok(p_rows) then raise exception 'too_many_required' using errcode = 'P0001'; end if;
  update public.product_types set spec_rows = p_rows where id = p_id;
  perform public.admin_audit_action('spec_rows.update', 'product_type', p_id, jsonb_build_object('rows', jsonb_array_length(v_old)), jsonb_build_object('rows', jsonb_array_length(p_rows)), null, null);
  return p_rows;
end $$;

revoke all on function public.spec_condition_valid(jsonb, text[], text), public.spec_rows_valid(jsonb), public.admin_spec_rows_list(), public.admin_save_spec_rows(text, jsonb) from public, anon;
grant execute on function public.admin_spec_rows_list(), public.admin_save_spec_rows(text, jsonb) to authenticated, service_role;
