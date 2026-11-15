-- 0123_import_with_type.sql
-- Imported rows can carry a product type: a row's optional "product_type_id" is stored on the new draft item (0056 left every import untyped,
-- so the seller had to select them afterwards and choose Set type). A type the shop may not sell, or one that does not exist, skips that
-- row with the reason ('unknown_product_type' or 'type_not_allowed'), exactly like any other bad detail. Rows without one import as before.
-- The function is patched in place; everything else it does is unchanged.

do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'seller_import_items';
  v_def := replace(v_def, E'\r', ''); -- a pasted script may carry Windows line breaks
  if position('v_type' in v_def) = 0 then
    v_new := replace(v_def, E'  k text;\n', E'  k text;\n  v_type text;\n');
    if v_new = v_def then raise exception 'seller_import_items: declare block not found'; end if;
    v_def := v_new;
    v_new := replace(v_def, E'    if v_err is not null then\n      v_skipped :=',
      E'    v_type := nullif(btrim(coalesce(r ->> ''product_type_id'', '''')), '''');\n' ||
      E'    if v_err is null and v_type is not null then\n' ||
      E'      if not exists (select 1 from public.product_types t where t.id = v_type and t.active) then v_err := ''unknown_product_type'';\n' ||
      E'      elsif not public.shop_can_sell_type(v_id, v_type) then v_err := ''type_not_allowed''; end if;\n' ||
      E'    end if;\n\n' ||
      E'    if v_err is not null then\n      v_skipped :=');
    if v_new = v_def then raise exception 'seller_import_items: skip block not found'; end if;
    v_def := v_new;
    v_new := replace(v_def, E'specs, low_stock_threshold, show_stock_count)\n    values (v_id,', E'specs, low_stock_threshold, show_stock_count, product_type_id)\n    values (v_id,');
    if v_new = v_def then raise exception 'seller_import_items: insert columns not found'; end if;
    v_def := v_new;
    v_new := replace(v_def, 'v_hl, v_specs, v_thr, v_show);', 'v_hl, v_specs, v_thr, v_show, v_type);');
    if v_new = v_def then raise exception 'seller_import_items: insert values not found'; end if;
    execute v_new;
  end if;
end $$;
