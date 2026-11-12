-- 0097: seller_duplicate_item also copies quantity tiers (item and per combination).

do $$ begin
  if to_regprocedure('public.seller_duplicate_item_base(uuid)') is null then
    alter function public.seller_duplicate_item(uuid) rename to seller_duplicate_item_base;
  end if;
end $$;

revoke all on function public.seller_duplicate_item_base(uuid) from public, anon, authenticated;
grant execute on function public.seller_duplicate_item_base(uuid) to service_role;

create or replace function public.seller_duplicate_item(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_new uuid;
begin
  perform public.assert_seller_active();
  v_new := public.seller_duplicate_item_base(p_id);
  update public.items n set price_tiers = s.price_tiers, price_tier_mode = s.price_tier_mode
    from public.items s where s.id = p_id and n.id = v_new;
  update public.item_variants n set price_tiers = o.price_tiers
    from public.item_variants o where o.item_id = p_id and n.item_id = v_new and n.combo_key = o.combo_key;
  return v_new;
end $$;

revoke all on function public.seller_duplicate_item(uuid) from public, anon;
grant execute on function public.seller_duplicate_item(uuid) to authenticated, service_role;
