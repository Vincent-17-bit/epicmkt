-- A NEW item must say what it is. The seller's product type is the strongest signal "Goes well with" and "Similar items" have, so a
-- listing saved without one weakens both rows for every shopper who sees it.
--
--   1. product_types 'other'   a real, active type that means "none of the types fits". The ranking treats it as no type evidence
--                              (shared/src/productType/other.js), so an odd listing is never blocked and never mis-grouped.
--   2. seller_save_item        refuses a NEW item (p_id null) with no productTypeId: 'product_type_required'. Editing an existing item is
--                              untouched, so old untyped items stay editable without forcing a type. seller_check_item and the publish
--                              gate call seller_save_item, so they enforce the same rule.
--
-- Not a trigger on items: imports, copies, the demo seed and 20 database tests insert rows directly, and a trigger would turn each of
-- those into a failure. seller_save_item is the seller's one write path (0018); the items_product_type_guard trigger (0091) still
-- checks that a type that IS given exists and may be sold by the shop.
--
-- Additive and reversible. Rollback:
--   alter function public.seller_save_item(uuid, jsonb) rename to seller_save_item_checked;
--   alter function public.seller_save_item_open(uuid, jsonb) rename to seller_save_item;
--   drop function public.seller_save_item_checked(uuid, jsonb);
--   delete from public.product_types where id = 'other' and not exists (select 1 from public.items where product_type_id = 'other');

insert into public.product_types (id, slug, name, kind, department_id, category_ids, restricted_to, quantity_mode, axes, spec_rows, active)
values ('other', 'other', 'Other', 'good', null, '{}', '{}', 'units', '[]'::jsonb, '[]'::jsonb, true)
on conflict (id) do nothing;

-- The wrapped function keeps its body and its grants-by-name; only the front door changes. Guarded so a second run changes nothing.
do $$ begin
  if to_regprocedure('public.seller_save_item_open(uuid, jsonb)') is null then
    alter function public.seller_save_item(uuid, jsonb) rename to seller_save_item_open;
  end if;
end $$;
revoke all on function public.seller_save_item_open(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.seller_save_item_open(uuid, jsonb) to service_role;

create or replace function public.seller_save_item(p_id uuid, p_fields jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  f jsonb := coalesce(p_fields, '{}'::jsonb);
begin
  -- Same order as the function underneath: a suspended seller and a non-seller get their own errors first.
  perform public.assert_seller_active();
  if public.my_business_id() is null then raise exception 'not_a_seller' using errcode = '42501'; end if;

  -- Missing, null or blank is "no type". A value of the wrong kind (a number, a list) is left for the function underneath, which names it
  -- invalid_product_type, as it always has.
  if p_id is null and (
    not (f ? 'productTypeId')
    or jsonb_typeof(f -> 'productTypeId') = 'null'
    or (jsonb_typeof(f -> 'productTypeId') = 'string' and btrim(f ->> 'productTypeId') = '')
  ) then
    raise exception 'product_type_required' using errcode = 'P0001';
  end if;

  return public.seller_save_item_open(p_id, p_fields);
end $$;
revoke all on function public.seller_save_item(uuid, jsonb) from public, anon;
grant execute on function public.seller_save_item(uuid, jsonb) to authenticated, service_role;
