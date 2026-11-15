-- 0117_tier_reads.sql
-- Reads for quantity-tier prices (saved by seller_save_item since 0094, never returned to anyone):
--   public_item_tiers(item)   buyers: { tiers, mode, variants: [{ choice, tiers }] } for a PUBLIC item, null otherwise. Only the tiers that are set.
--   seller_item_tiers(item)   the owner's own item, the same shape, for the editor.
-- Both read price_tiers and price_tier_mode of the item and the price_tiers of each variant; a variant without its own tiers is not listed
-- (the item's tiers apply to it).

create or replace function public.item_tiers_json(p_item uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tiers', i.price_tiers,
    'mode', i.price_tier_mode,
    'variants', coalesce((select jsonb_agg(jsonb_build_object('choice', v.choice, 'tiers', v.price_tiers) order by v.sort, v.id)
                            from public.item_variants v where v.item_id = i.id and v.price_tiers is not null), '[]'::jsonb))
  from public.items i where i.id = p_item
$$;
revoke all on function public.item_tiers_json(uuid) from public, anon, authenticated;
grant execute on function public.item_tiers_json(uuid) to service_role;

create or replace function public.public_item_tiers(p_item uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select public.item_tiers_json(p_item) where exists (select 1 from public.public_items pi where pi.id = p_item)
$$;

create or replace function public.seller_item_tiers(p_item uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
begin
  perform public.assert_seller_active();
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if not exists (select 1 from public.items where id = p_item and business_id = v_id and not removed_by_admin) then raise exception 'item_not_found' using errcode = 'P0001'; end if;
  return public.item_tiers_json(p_item);
end $$;

revoke all on function public.public_item_tiers(uuid) from public;
grant execute on function public.public_item_tiers(uuid) to anon, authenticated, service_role;
revoke all on function public.seller_item_tiers(uuid) from public, anon;
grant execute on function public.seller_item_tiers(uuid) to authenticated, service_role;
