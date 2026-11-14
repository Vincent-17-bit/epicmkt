-- 0109 (Prompt 8.1): "goes with" relations between product types or departments, and the candidates for the Recommend tab.
--
--   1. product_relations         type or department A "goes with" type or department B (soundbar -> smart TV, cables, speakers).
--                                The ids are plain text with no foreign key (Prompt 11.1 adds the constraints), so a relation never blocks
--                                a type or department being renamed, retired or re-created.
--   2. admin_product_relations_list / admin_save_product_relation / admin_delete_product_relation
--                                reviewers and support read, the owner writes; every change is audited.
--   3. related_item_candidates   the coarse net for items.getRelated: the item, the active relations that start from its type or
--                                department, and a bounded pool of listed items of the related types and departments (and its own).
--                                The shared rankRelated applies the score, the 1-in-5 same-shop rule and the paging, so the demo backend and
--                                the live adapter rank the same way (same split as similar_item_candidates, migration 0069).
--
-- Items with no product type and no department are untouched: they have no relations and get no candidates.

create table if not exists public.product_relations (
  id uuid primary key default gen_random_uuid(),
  from_kind text not null check (from_kind in ('type', 'department')),
  from_id text not null check (from_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(from_id) <= 40),
  to_kind text not null check (to_kind in ('type', 'department')),
  to_id text not null check (to_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(to_id) <= 40),
  weight integer not null default 0 check (weight between 0 and 10),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_relations_not_self check (not (from_kind = to_kind and from_id = to_id)),
  constraint product_relations_unique unique (from_kind, from_id, to_kind, to_id)
);
create index if not exists product_relations_from_idx on public.product_relations (from_kind, from_id) where active;
create index if not exists product_relations_to_idx on public.product_relations (to_kind, to_id) where active;

alter table public.product_relations enable row level security;
-- Relations are not sensitive and the buyer pages need them; only the admin functions below write.
drop policy if exists "relations are public" on public.product_relations;
create policy "relations are public" on public.product_relations for select to anon, authenticated using (active);
grant select on public.product_relations to anon, authenticated;
grant all on public.product_relations to service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- Admin functions
-- ---------------------------------------------------------------------------------------------------------------------

create or replace function public.admin_product_relations_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(array['reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'relations', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'fromKind', r.from_kind, 'fromId', r.from_id,
        'fromName', case r.from_kind when 'type' then (select t.name from public.product_types t where t.id = r.from_id)
                                     else (select d.name from public.departments d where d.id = r.from_id) end,
        'toKind', r.to_kind, 'toId', r.to_id,
        'toName', case r.to_kind when 'type' then (select t.name from public.product_types t where t.id = r.to_id)
                                 else (select d.name from public.departments d where d.id = r.to_id) end,
        'weight', r.weight, 'active', r.active) order by r.from_kind, r.from_id, r.to_kind, r.to_id) from public.product_relations r), '[]'::jsonb),
    'types', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'departmentId', t.department_id) order by t.name) from public.product_types t), '[]'::jsonb),
    'departments', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by d.name) from public.departments d), '[]'::jsonb));
end $$;

create or replace function public.admin_save_product_relation(p_from_kind text, p_from_id text, p_to_kind text, p_to_id text,
  p_weight integer default 0, p_active boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_row public.product_relations;
begin
  if not public.has_role(array['owner']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_from_kind not in ('type', 'department') or p_to_kind not in ('type', 'department') then raise exception 'invalid_relation_kind' using errcode = 'P0001'; end if;
  if coalesce(p_from_id, '') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or coalesce(p_to_id, '') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'invalid_relation_id' using errcode = 'P0001'; end if;
  if p_from_kind = p_to_kind and p_from_id = p_to_id then raise exception 'relation_to_self' using errcode = 'P0001'; end if;
  if p_weight is null or p_weight not between 0 and 10 then raise exception 'invalid_relation_weight' using errcode = 'P0001'; end if;
  -- a plain-id check, not a foreign key: the type or department must exist now, but a later rename or removal never blocks anything
  if (p_from_kind = 'type' and not exists (select 1 from public.product_types where id = p_from_id))
     or (p_from_kind = 'department' and not exists (select 1 from public.departments where id = p_from_id))
     or (p_to_kind = 'type' and not exists (select 1 from public.product_types where id = p_to_id))
     or (p_to_kind = 'department' and not exists (select 1 from public.departments where id = p_to_id)) then
    raise exception 'unknown_relation_target' using errcode = 'P0001';
  end if;
  select jsonb_build_object('weight', weight, 'active', active) into v_old from public.product_relations
   where from_kind = p_from_kind and from_id = p_from_id and to_kind = p_to_kind and to_id = p_to_id for update;
  insert into public.product_relations (from_kind, from_id, to_kind, to_id, weight, active)
  values (p_from_kind, p_from_id, p_to_kind, p_to_id, p_weight, coalesce(p_active, true))
  on conflict (from_kind, from_id, to_kind, to_id) do update set weight = excluded.weight, active = excluded.active, updated_at = now()
  returning * into v_row;
  perform public.admin_audit_action(case when v_old is null then 'product_relation.create' else 'product_relation.update' end, 'product_relation',
    v_row.id::text, v_old, jsonb_build_object('from', p_from_kind || ':' || p_from_id, 'to', p_to_kind || ':' || p_to_id, 'weight', p_weight, 'active', v_row.active), null, null);
  return jsonb_build_object('id', v_row.id, 'fromKind', v_row.from_kind, 'fromId', v_row.from_id, 'toKind', v_row.to_kind, 'toId', v_row.to_id,
    'weight', v_row.weight, 'active', v_row.active);
end $$;

create or replace function public.admin_delete_product_relation(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_row public.product_relations;
begin
  if not public.has_role(array['owner']) then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.product_relations where id = p_id returning * into v_row;
  if not found then raise exception 'relation_not_found' using errcode = 'P0001'; end if;
  perform public.admin_audit_action('product_relation.delete', 'product_relation', p_id::text,
    jsonb_build_object('from', v_row.from_kind || ':' || v_row.from_id, 'to', v_row.to_kind || ':' || v_row.to_id, 'weight', v_row.weight), null, null, null);
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Candidates for items.getRelated
-- ---------------------------------------------------------------------------------------------------------------------

-- Returns { item, relations, candidates } as JSON, or null when the item is not public. `candidates` holds listed, visible items whose
-- type or department is related to the item's (or is its own); the item itself is never in it. At most `p_limit` rows (default 200,
-- never more than 400): this shop's items first so the same-shop rule can always be met, then the newest of the rest. The final
-- rows are read through public_items, so store visibility, drafts and admin hiding are decided in that one view, exactly as for
-- Similar items. Sold-out items are left out by the same view.
create or replace function public.related_item_candidates(p_item_id uuid, p_limit integer default 200) returns jsonb
language plpgsql stable security definer set search_path = public, extensions set statement_timeout = '3s' as $$
declare
  v_limit integer := least(400, greatest(1, coalesce(p_limit, 200)));
  v_item record;
  v_types text[];
  v_depts text[];
  v_ids uuid[];
  v_relations jsonb;
begin
  select pi.id, pi.business_id, pi.name, pi.brand, pi.section, pi.price, pi.created_at, pi.product_type_id, pi.department_id
    into v_item from public.public_items pi where pi.id = p_item_id;
  if not found then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object('fromKind', r.from_kind, 'fromId', r.from_id, 'toKind', r.to_kind, 'toId', r.to_id, 'weight', r.weight)), '[]'::jsonb),
         coalesce(array_agg(r.to_id) filter (where r.to_kind = 'type'), '{}'),
         coalesce(array_agg(r.to_id) filter (where r.to_kind = 'department'), '{}')
    into v_relations, v_types, v_depts
    from public.product_relations r
   where r.active
     and ((r.from_kind = 'type' and r.from_id = v_item.product_type_id) or (r.from_kind = 'department' and r.from_id = v_item.department_id));

  -- its own type and department also qualify (weakly), so a shop with no relations still has something to show
  if v_item.product_type_id is not null then v_types := v_types || v_item.product_type_id; end if;
  if v_item.department_id is not null then v_depts := v_depts || v_item.department_id; end if;
  if cardinality(v_types) = 0 and cardinality(v_depts) = 0 then
    return jsonb_build_object('item', jsonb_build_object('id', v_item.id, 'businessId', v_item.business_id, 'productTypeId', v_item.product_type_id,
      'departmentId', v_item.department_id, 'name', v_item.name, 'brand', v_item.brand, 'section', v_item.section, 'price', v_item.price),
      'relations', v_relations, 'candidates', '[]'::jsonb);
  end if;

  select coalesce(array_agg(x.id), '{}') into v_ids from (
    select i.id from public.items i
     where i.id <> p_item_id and i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin
       and public.item_is_listed(i.availability)
       and (i.product_type_id = any (v_types) or i.department_id = any (v_depts))
     order by (i.business_id = v_item.business_id) desc, i.created_at desc, i.id
     limit v_limit) x;

  return jsonb_build_object(
    'item', jsonb_build_object('id', v_item.id, 'businessId', v_item.business_id, 'productTypeId', v_item.product_type_id,
      'departmentId', v_item.department_id, 'name', v_item.name, 'brand', v_item.brand, 'section', v_item.section, 'price', v_item.price),
    'relations', v_relations,
    'candidates', coalesce((select jsonb_agg(jsonb_build_object('id', pi.id, 'businessId', pi.business_id, 'productTypeId', pi.product_type_id,
        'departmentId', pi.department_id, 'name', pi.name, 'brand', pi.brand, 'section', pi.section, 'price', pi.price, 'priceMin', pi.price_min,
        'priceMax', pi.price_high, 'hasPriceRange', pi.price_min is distinct from pi.price_high, 'hasOptions', pi.has_options,
        'availability', pi.availability, 'createdAt', pi.created_at, 'imagePaths', pi.image_paths))
      from public.public_items pi where pi.id = any (v_ids)), '[]'::jsonb));
end $$;

revoke all on function public.admin_product_relations_list(), public.admin_save_product_relation(text, text, text, text, integer, boolean),
  public.admin_delete_product_relation(uuid), public.related_item_candidates(uuid, integer) from public, anon;
grant execute on function public.admin_product_relations_list(), public.admin_save_product_relation(text, text, text, text, integer, boolean),
  public.admin_delete_product_relation(uuid) to authenticated, service_role;
grant execute on function public.related_item_candidates(uuid, integer) to anon, authenticated, service_role;
