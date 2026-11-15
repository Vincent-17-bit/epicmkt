-- 0118_department_browse.sql (A23, B28)
-- Browse by department and product type, independent of the shop's category: a phone sold by a cyber shop is under Phones, a fragrance sold
-- by a boutique is under Fragrance. Category browsing is untouched (nothing here changes public_items, public_businesses or any function that
-- lists by category).
--
--   public_departments()                        departments that have public items: [{ id, name, sort, count, types: [{ id, name, count }] }]
--   public_department_browse(dept, type, n, o)  { department, type, total, items: [...] } for one department (optionally one type). department is
--                                               null for an unknown or empty-and-inactive one, so the page can say "not found".
--   public_shop_departments(business)           the shop's items grouped by department: [{ id, name, count }]; items with no type are "Other" (id null), last.
--   admin_departments_list()                    every department with its type and item counts (admins).
--   admin_save_department(id, fields)           create (id = slug) or edit name, sort, active. A department with active types cannot be switched off.
-- A "public item" is a row of public_items (visible, approved, not sold out, shop live), the same rule the rest of the site uses.

create or replace function public.public_departments() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'sort', d.sort, 'count', d.n,
           'types', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'count', t.n) order by t.name), '[]'::jsonb)
                       from (select pt.id, pt.name, count(*)::int as n from public.public_items i join public.product_types pt on pt.id = i.product_type_id
                              where i.department_id = d.id group by pt.id, pt.name) t)) order by d.sort, d.name), '[]'::jsonb)
  from (select dep.id, dep.name, dep.sort, count(*)::int as n
          from public.departments dep join public.public_items i on i.department_id = dep.id
         where dep.active group by dep.id, dep.name, dep.sort) d
$$;

create or replace function public.public_department_browse(p_department text, p_type text default null, p_limit integer default 24, p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_dept public.departments;
  v_type public.product_types;
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 60);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
begin
  select * into v_dept from public.departments where id = p_department and active;
  if not found then return jsonb_build_object('department', null, 'type', null, 'total', 0, 'items', '[]'::jsonb); end if;
  if p_type is not null then
    select * into v_type from public.product_types where id = p_type and department_id = v_dept.id and active;
    if not found then return jsonb_build_object('department', jsonb_build_object('id', v_dept.id, 'name', v_dept.name), 'type', null, 'total', 0, 'items', '[]'::jsonb); end if;
  end if;
  select count(*)::int into v_total from public.public_items i where i.department_id = v_dept.id and (p_type is null or i.product_type_id = p_type);
  return jsonb_build_object(
    'department', jsonb_build_object('id', v_dept.id, 'name', v_dept.name),
    'type', case when p_type is null then null else jsonb_build_object('id', v_type.id, 'name', v_type.name) end,
    'total', v_total,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'name', x.name, 'price', x.price, 'priceMax', x.price_max, 'priceType', x.price_type, 'unit', x.unit, 'availability', x.availability,
               'priceMin', x.price_min, 'priceHigh', x.price_high, 'hasOptions', x.has_options, 'brand', x.brand, 'productTypeId', x.product_type_id,
               'imagePaths', x.image_paths, 'createdAt', x.created_at,
               'business', jsonb_build_object('id', b.id, 'slug', b.slug, 'name', b.name, 'town', b.town, 'categoryId', b.category_id)) order by x.created_at desc, x.id)
        from (select i.* from public.public_items i
               where i.department_id = v_dept.id and (p_type is null or i.product_type_id = p_type)
               order by i.created_at desc, i.id limit v_limit offset v_offset) x
        join public.public_businesses b on b.id = x.business_id), '[]'::jsonb));
end $$;

create or replace function public.public_shop_departments(p_business uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'count', g.n) order by (g.id is null), g.sort, g.name), '[]'::jsonb)
  from (select i.department_id as id, coalesce(d.name, 'Other') as name, coalesce(d.sort, 0) as sort, count(*)::int as n
          from public.public_items i left join public.departments d on d.id = i.department_id and d.active
         where i.business_id = p_business group by i.department_id, d.name, d.sort) g
$$;

revoke all on function public.public_departments(), public.public_department_browse(text, text, integer, integer), public.public_shop_departments(uuid) from public;
grant execute on function public.public_departments(), public.public_department_browse(text, text, integer, integer), public.public_shop_departments(uuid) to anon, authenticated, service_role;

create or replace function public.admin_departments_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'sort', d.sort, 'active', d.active,
             'types', (select count(*) from public.product_types t where t.department_id = d.id and t.active),
             'items', (select count(*) from public.items i where i.department_id = d.id and not i.removed_by_admin)) order by d.sort, d.name)
    from public.departments d), '[]'::jsonb);
end $$;

create or replace function public.admin_save_department(p_id text, p_fields jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  f jsonb := coalesce(p_fields, '{}'::jsonb);
  v_id text := lower(btrim(coalesce(p_id, '')));
  v_old public.departments;
  v_name text;
  v_sort integer;
  v_active boolean;
begin
  if not public.has_role(array['owner', 'reviewer']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_id) > 40 then raise exception 'invalid_id' using errcode = 'P0001'; end if;
  select * into v_old from public.departments where id = v_id for update;
  v_name := case when f ? 'name' then btrim(coalesce(f ->> 'name', '')) else v_old.name end;
  if v_name is null or char_length(v_name) not between 2 and 60 then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  if f ? 'sort' and (jsonb_typeof(f -> 'sort') <> 'number' or (f ->> 'sort')::numeric <> trunc((f ->> 'sort')::numeric) or abs((f ->> 'sort')::numeric) > 10000) then raise exception 'invalid_sort' using errcode = 'P0001'; end if;
  v_sort := case when f ? 'sort' then (f ->> 'sort')::integer else coalesce(v_old.sort, 0) end;
  if f ? 'active' and jsonb_typeof(f -> 'active') <> 'boolean' then raise exception 'invalid_active' using errcode = 'P0001'; end if;
  v_active := case when f ? 'active' then (f ->> 'active')::boolean else coalesce(v_old.active, true) end;
  if exists (select 1 from public.departments d where lower(d.name) = lower(v_name) and d.id <> v_id) then raise exception 'name_taken' using errcode = 'P0001'; end if;
  if not v_active and exists (select 1 from public.product_types t where t.department_id = v_id and t.active) then raise exception 'department_in_use' using errcode = 'P0001'; end if;

  if v_old.id is null then
    insert into public.departments (id, name, sort, active) values (v_id, v_name, v_sort, v_active);
    perform public.admin_audit_action('department.create', 'department', v_id, null, jsonb_build_object('name', v_name, 'sort', v_sort, 'active', v_active), null);
  else
    update public.departments set name = v_name, sort = v_sort, active = v_active where id = v_id;
    perform public.admin_audit_action('department.update', 'department', v_id, jsonb_build_object('name', v_old.name, 'sort', v_old.sort, 'active', v_old.active),
      jsonb_build_object('name', v_name, 'sort', v_sort, 'active', v_active), null);
  end if;
  return v_id;
end $$;
revoke all on function public.admin_departments_list(), public.admin_save_department(text, jsonb) from public, anon;
grant execute on function public.admin_departments_list(), public.admin_save_department(text, jsonb) to authenticated, service_role;
