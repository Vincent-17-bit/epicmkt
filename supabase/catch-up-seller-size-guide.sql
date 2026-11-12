-- EpicMKT: sellers write their own size guide (migration 0101).
-- Run it ONCE, whole, in the Supabase SQL editor, AFTER catch-up-size-charts.sql (or migrations up to 0100). Safe to run again.
-- It adds items.size_guide, two seller functions, and makes buyers see the seller's table first.

do $$
declare v_missing text;
begin
  select string_agg(x, ', ') into v_missing from unnest(array[
    'public.size_chart_columns_valid(jsonb)', 'public.size_chart_rows_valid(jsonb, integer)', 'public.my_business_id()', 'public.assert_seller_active()'
  ]) as x where to_regprocedure(x) is null;
  if v_missing is not null then raise exception 'Missing: %. Run supabase/catch-up-size-charts.sql first.', v_missing; end if;
  if to_regprocedure('public.item_size_chart_payload(public.items)') is null then raise exception 'Missing item_size_chart_payload. Run supabase/catch-up-size-charts.sql first.'; end if;
end $$;

-- Sellers own the size guide of their own items.
-- Until now an admin made the charts and a seller could only borrow one. Now a seller fills the size table on the item itself (columns they choose,
-- one row per size they sell, for shoes the EU/UK/US/cm conversion), and buyers see that table. An admin chart stays as a template and as the
-- fallback for items whose seller wrote no guide.
--   * items.size_guide          jsonb { unit?, columns:[text], rows:[[text]] }, null = none. Same shape rules as a size chart (1..12 columns, 1..60 rows,
--                               every row as wide as the columns, no empty cell). The first column is the size.
--   * seller_set_item_size_guide(item, guide)   the seller's own, active item only. guide null removes it. Audited.
--   * seller_item_size_guide(item)               the editor's read.
--   * item_size_chart_payload(item)              buyers: the item's own guide first ({ id: null, own: true }), else the admin chart as before.
-- Errors (P0001): item_not_found, invalid_size_guide. Idempotent; never edit once applied.

create or replace function public.size_guide_valid(p jsonb) returns boolean
language plpgsql immutable parallel safe as $$
begin
  if p is null then return true; end if;
  if jsonb_typeof(p) <> 'object' then return false; end if;
  if exists (select 1 from jsonb_object_keys(p) k where k not in ('unit', 'columns', 'rows')) then return false; end if;
  if not (p ? 'columns' and p ? 'rows') then return false; end if;
  if p ? 'unit' and jsonb_typeof(p -> 'unit') <> 'null' and (jsonb_typeof(p -> 'unit') <> 'string' or (p ->> 'unit') not in ('cm', 'in')) then return false; end if;
  return public.size_chart_columns_valid(p -> 'columns') and public.size_chart_rows_valid(p -> 'rows', jsonb_array_length(p -> 'columns'));
end $$;
revoke all on function public.size_guide_valid(jsonb) from public;
grant execute on function public.size_guide_valid(jsonb) to anon, authenticated, service_role;

alter table public.items add column if not exists size_guide jsonb;
alter table public.items drop constraint if exists items_size_guide_shape;
alter table public.items add constraint items_size_guide_shape check (public.size_guide_valid(size_guide));

create or replace function public.seller_set_item_size_guide(p_id uuid, p_guide jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_item public.items;
  v_guide jsonb := case when p_guide is null or jsonb_typeof(p_guide) = 'null' then null else p_guide end;
begin
  perform public.assert_seller_active();
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select * into v_item from public.items where id = p_id and business_id = v_id and not removed_by_admin for update;
  if not found then raise exception 'item_not_found' using errcode = 'P0001'; end if;
  if not public.size_guide_valid(v_guide) then raise exception 'invalid_size_guide' using errcode = 'P0001'; end if;
  if v_item.size_guide is not distinct from v_guide then return true; end if; -- nothing changed: nothing to write or audit
  update public.items set size_guide = v_guide where id = p_id;
  perform public.write_audit(v_id, case when v_guide is null then 'item_size_guide_removed' else 'item_size_guide_saved' end, 'item', p_id::text,
    jsonb_build_object('rows', case when v_guide is null then 0 else jsonb_array_length(v_guide -> 'rows') end));
  return true;
end $$;

create or replace function public.seller_item_size_guide(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_guide jsonb;
begin
  perform public.assert_seller_active();
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select i.size_guide into v_guide from public.items i where i.id = p_id and i.business_id = v_id and not i.removed_by_admin;
  if not found then raise exception 'item_not_found' using errcode = 'P0001'; end if;
  return v_guide;
end $$;

revoke all on function public.seller_set_item_size_guide(uuid, jsonb), public.seller_item_size_guide(uuid) from public;
grant execute on function public.seller_set_item_size_guide(uuid, jsonb), public.seller_item_size_guide(uuid) to authenticated, service_role;

-- Buyers: the seller's own guide first, then the admin chart exactly as before.
create or replace function public.item_size_chart_payload(p_item public.items) returns jsonb
language sql stable security definer set search_path = public as $$
  select case
    when p_item.size_guide is not null and public.size_guide_valid(p_item.size_guide) then jsonb_build_object(
      'id', null, 'name', 'Size guide', 'category', null, 'unit', coalesce(p_item.size_guide ->> 'unit', 'cm'),
      'columns', p_item.size_guide -> 'columns', 'rows', p_item.size_guide -> 'rows', 'overridden', false, 'own', true)
    when c.id is null then null
    else jsonb_build_object(
      'id', c.id, 'name', c.name, 'category', c.category, 'unit', c.unit, 'columns', c.columns,
      'rows', case when p_item.size_chart_override is not null and public.size_chart_rows_valid(p_item.size_chart_override -> 'rows', jsonb_array_length(c.columns))
                   then p_item.size_chart_override -> 'rows' else c.rows end,
      'overridden', p_item.size_chart_override is not null and public.size_chart_rows_valid(p_item.size_chart_override -> 'rows', jsonb_array_length(c.columns))) end
  from (select 1) one left join public.size_charts c on c.id = p_item.size_chart_id and c.active
$$;
revoke all on function public.item_size_chart_payload(public.items) from public;
grant execute on function public.item_size_chart_payload(public.items) to service_role;

notify pgrst, 'reload schema';
