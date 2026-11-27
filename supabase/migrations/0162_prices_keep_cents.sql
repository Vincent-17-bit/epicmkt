-- 0162: prices keep their cents. KES 210.99 is KES 210.99, not KES 211.
--
-- Two places still rounded to whole shillings, and are changed to round to the cent (two decimals):
--   1. flash_discounted_price: a flash sale price such as 99.99, or 10% off 210.99, was rounded to a whole shilling.
--   2. item_denorm: price_min / price_high (the "From KES x" figure and the price filter and sort) rounded each price to whole shillings.
-- It also removes the whole-shilling guard that an earlier version of 0161 added (require_whole_prices and its two triggers), if it was ever
-- applied. Prices already rounded by that version cannot be recovered; re-enter those that had cents.
-- Safe to run again.

drop trigger if exists t_items_whole_price on public.items;
drop trigger if exists t_item_variants_whole_price on public.item_variants;
drop function if exists public.require_whole_prices();

create or replace function public.flash_discounted_price(p_type text, p_value numeric, p_regular numeric) returns numeric
language sql immutable as
$$ select greatest(0, round(case p_type
     when 'percent' then p_regular * (1 - p_value / 100)
     when 'amount_off' then p_regular - p_value
     else p_value end, 2)) $$;
grant execute on function public.flash_discounted_price(text, numeric, numeric) to anon, authenticated, service_role;

-- item_denorm is patched in place (as 0098 did), so the flash-target changes made to it since 0096 are kept.
do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into strict v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'item_denorm';
  v_def := replace(v_def, 'round(v.price)', 'round(v.price, 2)');
  v_def := replace(v_def, 'round(v.sale_price)', 'round(v.sale_price, 2)');
  v_def := replace(v_def, 'round(it.price)', 'round(it.price, 2)');
  v_def := replace(v_def, 'round(it.sale_price)', 'round(it.sale_price, 2)');
  v_def := replace(v_def, '(r.tiers -> 0 ->> ''unitPrice'')::numeric)', '(r.tiers -> 0 ->> ''unitPrice'')::numeric, 2)');
  if v_def not like '%round(v.price, 2)%' or v_def not like '%round(it.sale_price, 2)%' or v_def not like '%unitPrice'')::numeric, 2)%' then raise exception '0162: item_denorm patch did not apply'; end if;
  execute v_def;
end $$;

-- Recompute the stored lowest / highest price of every item that has a price with cents (the old figures were rounded).
select public.items_refresh_denorm(array(select id from public.items where price <> trunc(price) or sale_price <> trunc(sale_price) or price_max <> trunc(price_max)
  or id in (select item_id from public.item_variants where price <> trunc(price) or sale_price <> trunc(sale_price)))) ;
