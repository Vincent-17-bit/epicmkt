-- 0092_products_snapshot_brand.sql
-- The home products snapshot carries each item's brand, so the buyer's Brand filter can offer one choice per brand
-- ("Samsung", "SAMSUNG" and "samsung" are one choice: the client groups by normalizeValueKey, see 0090_option_values.sql).
-- One extra column, `brand`, from public_items (which has had it since 0050). Like 0054 and 0057 this patches the function as it is now
-- (pg_get_functiondef + replace) instead of copying it, so every column added by an earlier migration (stock_left, video_paths, the
-- shop timezone ...) is kept. Running it twice changes nothing.

do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'products_snapshot';
  if position('i.brand' in v_def) = 0 then
    v_new := replace(v_def, 'i.image_paths ->> 0 as image_path', 'i.image_paths ->> 0 as image_path, i.brand');
    if v_new = v_def then raise exception 'products_snapshot: capped column list not found'; end if;
    v_def := v_new;
    v_new := replace(v_def, 'k.created_at, k.image_path,', 'k.created_at, k.image_path, k.brand,');
    if v_new = v_def then raise exception 'products_snapshot: item column list not found'; end if;
    execute v_new;
  end if;
end $$;
