-- 0125_custom_size.sql
-- "Made to measure" (Prompts 3.4 and 3.7): a tailor or furniture maker lets the buyer give measurements instead of picking a size. The seller
-- and buyer screens were built earlier and switched off (CUSTOM_SIZE_STORED) because nothing stored the setting. This stores it.
--
--   items.custom_size jsonb  null = not offered. Shape (the same rules as shared validateCustomSize):
--     { enabled: true, axisKey, fields: [{ key, label, unit: cm|in, min, max, required }] (1..6, unique key and label),
--       price: { mode: "fixed", base } | { mode: "per-extra", base, perUnit, field, over } }   whole KES
--   seller_set_item_custom_size(item, config)  the shop's own, not removed item. null clears it. Audited. Error: invalid_custom_size, item_not_found
--   seller_item_custom_size(item)              the editor's read
--   public_item_custom_size(item)              buyers: the config of a listed item, else null
-- Idempotent; never edit once applied.

create or replace function public.custom_size_valid(p jsonb) returns boolean
language plpgsql immutable parallel safe as $$
declare
  f jsonb;
  v_keys text[] := '{}';
  v_labels text[] := '{}';
  v_price jsonb;
  v_mode text;
  v_whole constant text := '^[0-9]{1,9}$';
begin
  if p is null or jsonb_typeof(p) = 'null' then return true; end if;
  if jsonb_typeof(p) <> 'object' then return false; end if;
  if exists (select 1 from jsonb_object_keys(p) k where k not in ('enabled', 'axisKey', 'fields', 'price')) then return false; end if;
  if jsonb_typeof(p -> 'enabled') is distinct from 'boolean' or (p ->> 'enabled') <> 'true' then return false; end if;
  if jsonb_typeof(p -> 'axisKey') is distinct from 'string' or char_length(p ->> 'axisKey') > 40 then return false; end if;
  if jsonb_typeof(p -> 'fields') is distinct from 'array' or jsonb_array_length(p -> 'fields') not between 1 and 6 then return false; end if;
  for f in select e from jsonb_array_elements(p -> 'fields') e loop
    if jsonb_typeof(f) <> 'object' then return false; end if;
    if exists (select 1 from jsonb_object_keys(f) k where k not in ('key', 'label', 'unit', 'min', 'max', 'required')) then return false; end if;
    if jsonb_typeof(f -> 'key') is distinct from 'string' or (f ->> 'key') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(f ->> 'key') > 30 then return false; end if;
    if jsonb_typeof(f -> 'label') is distinct from 'string' or char_length(btrim(f ->> 'label')) not between 1 and 30 then return false; end if;
    if (f ->> 'unit') is distinct from 'cm' and (f ->> 'unit') is distinct from 'in' then return false; end if;
    if jsonb_typeof(f -> 'min') is distinct from 'number' or jsonb_typeof(f -> 'max') is distinct from 'number' then return false; end if;
    if not ((f ->> 'min')::numeric > 0 and (f ->> 'max')::numeric > (f ->> 'min')::numeric and (f ->> 'max')::numeric <= 10000) then return false; end if;
    if f ? 'required' and jsonb_typeof(f -> 'required') <> 'boolean' then return false; end if;
    if (f ->> 'key') = any (v_keys) or lower(btrim(f ->> 'label')) = any (v_labels) then return false; end if;
    v_keys := v_keys || (f ->> 'key');
    v_labels := v_labels || lower(btrim(f ->> 'label'));
  end loop;
  v_price := p -> 'price';
  if jsonb_typeof(v_price) is distinct from 'object' then return false; end if;
  v_mode := v_price ->> 'mode';
  if jsonb_typeof(v_price -> 'base') is distinct from 'number' or (v_price ->> 'base') !~ v_whole then return false; end if;
  if v_mode = 'fixed' then
    return not exists (select 1 from jsonb_object_keys(v_price) k where k not in ('mode', 'base'));
  elsif v_mode = 'per-extra' then
    if exists (select 1 from jsonb_object_keys(v_price) k where k not in ('mode', 'base', 'perUnit', 'field', 'over')) then return false; end if;
    if jsonb_typeof(v_price -> 'perUnit') is distinct from 'number' or (v_price ->> 'perUnit') !~ v_whole then return false; end if;
    if jsonb_typeof(v_price -> 'over') is distinct from 'number' or (v_price ->> 'over') !~ v_whole then return false; end if;
    return (v_price ->> 'field') = any (v_keys);
  end if;
  return false;
exception when others then
  return false;
end $$;
revoke all on function public.custom_size_valid(jsonb) from public;
grant execute on function public.custom_size_valid(jsonb) to anon, authenticated, service_role;

alter table public.items add column if not exists custom_size jsonb;
alter table public.items drop constraint if exists items_custom_size_shape;
alter table public.items add constraint items_custom_size_shape check (public.custom_size_valid(custom_size));

create or replace function public.seller_set_item_custom_size(p_id uuid, p_config jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_item public.items;
  v_cfg jsonb := case when p_config is null or jsonb_typeof(p_config) = 'null' then null else p_config end;
begin
  perform public.assert_seller_active();
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select * into v_item from public.items where id = p_id and business_id = v_id and not removed_by_admin for update;
  if not found then raise exception 'item_not_found' using errcode = 'P0001'; end if;
  if not public.custom_size_valid(v_cfg) then raise exception 'invalid_custom_size' using errcode = 'P0001'; end if;
  if v_item.custom_size is not distinct from v_cfg then return true; end if;
  update public.items set custom_size = v_cfg where id = p_id;
  perform public.write_audit(v_id, case when v_cfg is null then 'item_custom_size_removed' else 'item_custom_size_saved' end, 'item', p_id::text,
    jsonb_build_object('fields', case when v_cfg is null then 0 else jsonb_array_length(v_cfg -> 'fields') end));
  return true;
end $$;

create or replace function public.seller_item_custom_size(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_cfg jsonb;
begin
  perform public.assert_seller_active();
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select i.custom_size into v_cfg from public.items i where i.id = p_id and i.business_id = v_id and not i.removed_by_admin;
  if not found then raise exception 'item_not_found' using errcode = 'P0001'; end if;
  return v_cfg;
end $$;

create or replace function public.public_item_custom_size(p_item uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select i.custom_size from public.items i where i.id = p_item and i.custom_size is not null
     and exists (select 1 from public.public_items pi where pi.id = p_item)
$$;

revoke all on function public.seller_set_item_custom_size(uuid, jsonb), public.seller_item_custom_size(uuid), public.public_item_custom_size(uuid) from public;
revoke all on function public.seller_set_item_custom_size(uuid, jsonb), public.seller_item_custom_size(uuid) from anon;
grant execute on function public.seller_set_item_custom_size(uuid, jsonb), public.seller_item_custom_size(uuid) to authenticated, service_role;
grant execute on function public.public_item_custom_size(uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
