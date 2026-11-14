create or replace function public.product_type_axes_valid(p jsonb) returns boolean
language plpgsql immutable as $$
declare
  a jsonb;
  keys text[] := '{}';
  s jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 3 then return false; end if;
  for a in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(a) <> 'object' then return false; end if;
    if coalesce(a ->> 'key', '') !~ '^[a-z][a-z0-9_]{0,29}$' or (a ->> 'key') = any(keys) then return false; end if;
    keys := keys || (a ->> 'key');
    if btrim(coalesce(a ->> 'label', '')) = '' or char_length(a ->> 'label') > 40 then return false; end if;
    if coalesce(a ->> 'display', '') not in ('swatch', 'image-card', 'button', 'text-card', 'dropdown') then return false; end if;
    if a ? 'suggested' then
      if jsonb_typeof(a -> 'suggested') <> 'array' or jsonb_array_length(a -> 'suggested') > 40 then return false; end if;
      for s in select * from jsonb_array_elements(a -> 'suggested') loop
        if jsonb_typeof(s) <> 'object' or coalesce(s ->> 'id', '') !~ '^[a-z0-9][a-z0-9-]{0,39}$' or btrim(coalesce(s ->> 'label', '')) = '' or char_length(s ->> 'label') > 40 then return false; end if;
      end loop;
    end if;
  end loop;
  return true;
end $$;

create or replace function public.admin_product_types_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(array['reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'types', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'kind', t.kind, 'departmentId', t.department_id,
      'categoryIds', to_jsonb(coalesce(t.category_ids, '{}')), 'axes', t.axes, 'active', t.active,
      'items', (select count(*) from public.items i where i.product_type_id = t.id)) order by t.name) from public.product_types t), '[]'::jsonb),
    'departments', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by d.name) from public.departments d), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name) from public.categories c), '[]'::jsonb));
end $$;

create or replace function public.admin_save_product_type(p_id text, p_type jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_name text := btrim(coalesce(p_type ->> 'name', ''));
  v_dept text := p_type ->> 'departmentId';
  v_cats text[];
  v_axes jsonb := coalesce(p_type -> 'axes', '[]'::jsonb);
  v_active boolean := coalesce((p_type ->> 'active')::boolean, true);
begin
  if not public.has_role(array['owner']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_id !~ '^[a-z][a-z0-9-]{1,39}$' then raise exception 'invalid_type_id' using errcode = 'P0001'; end if;
  if v_name = '' or char_length(v_name) > 60 then raise exception 'invalid_type_name' using errcode = 'P0001'; end if;
  if v_dept is not null and not exists (select 1 from public.departments where id = v_dept) then raise exception 'invalid_department' using errcode = 'P0001'; end if;
  select coalesce(array_agg(distinct c), '{}') into v_cats from jsonb_array_elements_text(coalesce(p_type -> 'categoryIds', '[]'::jsonb)) c;
  if exists (select 1 from unnest(v_cats) c where not exists (select 1 from public.categories k where k.id = c)) then raise exception 'invalid_categories' using errcode = 'P0001'; end if;
  if not public.product_type_axes_valid(v_axes) then raise exception 'invalid_axes' using errcode = 'P0001'; end if;
  select jsonb_build_object('name', name, 'axes', axes) into v_old from public.product_types where id = p_id for update;
  if not found then
    insert into public.product_types (id, slug, name, kind, department_id, category_ids, axes, active)
    values (p_id, p_id, v_name, coalesce(nullif(p_type ->> 'kind', ''), 'good'), v_dept, v_cats, v_axes, v_active);
  else
    update public.product_types set name = v_name, department_id = v_dept, category_ids = v_cats, axes = v_axes, active = v_active where id = p_id;
  end if;
  perform public.admin_audit_action(case when v_old is null then 'product_type.create' else 'product_type.update' end, 'product_type', p_id, v_old,
    jsonb_build_object('name', v_name, 'axes', v_axes), null, null);
  return jsonb_build_object('id', p_id, 'name', v_name, 'departmentId', v_dept, 'categoryIds', to_jsonb(v_cats), 'axes', v_axes, 'active', v_active);
end $$;

revoke all on function public.product_type_axes_valid(jsonb), public.admin_product_types_list(), public.admin_save_product_type(text, jsonb) from public, anon;
grant execute on function public.admin_product_types_list(), public.admin_save_product_type(text, jsonb) to authenticated, service_role;
