-- Read-only check of everything saving an item needs. Paste into the Supabase SQL editor and run.
-- Every row says OK or MISSING. Nothing is changed.
with fn(name) as (values ('seller_save_item'),('seller_save_item_typed'),('seller_save_item_base'),('seller_check_item'),
  ('seller_catalog_items'),('seller_item_options'),('seller_item_size_guide'),('seller_set_item_size_guide'),('shop_can_sell_type'),('items_product_type_guard')),
col(name) as (values ('product_type_id'),('size_guide'),('brand'),('short_description'),('pack_size'),('terms'),('includes'),('highlights'),('specs'),('price_tiers'))
select 'function ' || fn.name as check, case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = fn.name) then 'OK' else 'MISSING: run the catch-up SQL files' end as result from fn
union all
select 'items column ' || col.name, case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'items' and column_name = col.name) then 'OK' else 'MISSING: run the catch-up SQL files' end from col
union all
select 'seller_save_item overloads', case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'seller_save_item') = 1 then 'OK' else 'PROBLEM: more than one version exists, the app cannot choose' end
union all
select 'items with a switched-off product type', coalesce((select count(*)::text || ' item(s): ' || string_agg(distinct t.id, ', ') from items i join product_types t on t.id = i.product_type_id where not t.active), 'none') ;
