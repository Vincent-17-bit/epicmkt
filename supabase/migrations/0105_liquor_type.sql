insert into public.product_types (id, slug, name, kind, department_id, category_ids, restricted_to, quantity_mode) values
  ('liquor', 'liquor', 'Liquor', 'good', 'food-drink', '{supermarket-minimart}', '{}', 'units')
on conflict (id) do nothing;

update public.product_types set
  axes = jsonb_build_array(jsonb_build_object('key', 'volume', 'label', 'Volume', 'display', 'button')),
  spec_rows = jsonb_build_array(
    jsonb_build_object('key', 'authenticity', 'label', 'Authenticity', 'level', 'required', 'input', 'choice', 'labelSet', 'authenticity'),
    jsonb_build_object('key', 'alcohol-strength', 'label', 'Alcohol strength', 'level', 'recommended', 'input', 'text'))
  where id = 'liquor' and spec_rows = '[]'::jsonb;
