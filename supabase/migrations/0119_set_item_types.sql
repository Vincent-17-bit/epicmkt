-- 0119 (B21): give existing items without a product type a type, in bulk, without touching price or stock.
--
--   seller_set_item_types(p_ids uuid[], p_type text) -> { updated, skipped: [{ id, reason }] }
--
-- Only product_type_id changes. An item that already has a type is skipped (reason has_type). A live item whose new type asks for
-- a required row it does not have yet would break the publish gate (0099), so it is skipped too (reason needs_details) and stays exactly
-- as it was; the seller adds the details in the editor. Drafts and hidden items always take the type and show up in "To finish".
-- Errors: too_many_items, no_items, unknown_product_type, type_not_allowed.

create or replace function public.seller_set_item_types(p_ids uuid[], p_type text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_biz uuid := public.my_business_id();
  v_id uuid;
  v_item public.items;
  v_updated int := 0;
  v_skipped jsonb := '[]'::jsonb;
begin
  perform public.assert_seller_active();
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 then raise exception 'no_items' using errcode = 'P0001'; end if;
  if array_length(p_ids, 1) > 500 then raise exception 'too_many_items' using errcode = 'P0001'; end if;
  if p_type is null or not exists (select 1 from public.product_types t where t.id = p_type and t.active) then
    raise exception 'unknown_product_type' using errcode = 'P0001';
  end if;
  if not public.shop_can_sell_type(v_biz, p_type) then raise exception 'type_not_allowed' using errcode = 'P0001'; end if;

  for v_id in select distinct unnest(p_ids) loop
    select * into v_item from public.items where id = v_id and business_id = v_biz and not removed_by_admin;
    if not found then
      v_skipped := v_skipped || jsonb_build_object('id', v_id, 'reason', 'not_found');
    elsif v_item.product_type_id is not null then
      v_skipped := v_skipped || jsonb_build_object('id', v_id, 'reason', 'has_type');
    else
      begin
        update public.items set product_type_id = p_type where id = v_id;
        v_updated := v_updated + 1;
      exception when sqlstate 'P0001' then
        if sqlerrm = 'publish_blocked' then
          v_skipped := v_skipped || jsonb_build_object('id', v_id, 'reason', 'needs_details');
        else
          raise;
        end if;
      end;
    end if;
  end loop;
  return jsonb_build_object('updated', v_updated, 'skipped', v_skipped);
end $$;
revoke all on function public.seller_set_item_types(uuid[], text) from public, anon;
grant execute on function public.seller_set_item_types(uuid[], text) to authenticated, service_role;
