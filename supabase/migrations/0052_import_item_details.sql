-- seller_import_items (0017) also takes the optional brand, short_description, pack_size, terms and includes of each row.
-- A row without them is stored exactly as before. A bad value stops the whole import with invalid_details.
create or replace function public.seller_import_items(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_b public.businesses;
  r jsonb;
  v_sort integer;
  v_n integer := 0;
  v_tags text[];
  v_brand text;
  v_short text;
  v_pack text;
  v_terms text;
  v_inc text[];
  k text;
begin
  perform public.assert_seller_active();
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select * into v_b from public.businesses where id = v_id;
  if v_b.plan_key <> 'premium' then raise exception 'premium_required' using errcode = 'P0001'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'no_rows' using errcode = 'P0001'; end if;
  if jsonb_array_length(p_rows) > 500 then raise exception 'too_many_rows' using errcode = 'P0001'; end if;
  select coalesce(max(sort), 0) into v_sort from public.items where business_id = v_id;
  for r in select * from jsonb_array_elements(p_rows) loop
    if left(coalesce(r ->> 'name', ''), 1) in ('=','+','-','@') or left(coalesce(r ->> 'section', ''), 1) in ('=','+','-','@')
       or left(coalesce(r ->> 'unit', ''), 1) in ('=','+','-','@') then
      raise exception 'formula_rejected' using errcode = 'P0001';
    end if;
    foreach k in array array['brand', 'short_description', 'pack_size', 'terms'] loop
      if r ? k and jsonb_typeof(r -> k) not in ('string', 'null') then raise exception 'invalid_details' using errcode = 'P0001'; end if;
      if left(coalesce(r ->> k, ''), 1) in ('=','+','-','@') then raise exception 'formula_rejected' using errcode = 'P0001'; end if;
    end loop;
    if r ? 'includes' and jsonb_typeof(r -> 'includes') not in ('array', 'null') then raise exception 'invalid_details' using errcode = 'P0001'; end if;
    if exists (select 1 from jsonb_array_elements(case when jsonb_typeof(r -> 'includes') = 'array' then r -> 'includes' else '[]'::jsonb end) e where jsonb_typeof(e) <> 'string') then
      raise exception 'invalid_details' using errcode = 'P0001';
    end if;
    if exists (select 1 from jsonb_array_elements_text(case when jsonb_typeof(r -> 'includes') = 'array' then r -> 'includes' else '[]'::jsonb end) e
               where left(btrim(e), 1) in ('=','+','-','@')) then
      raise exception 'formula_rejected' using errcode = 'P0001';
    end if;

    v_brand := nullif(btrim(coalesce(r ->> 'brand', '')), '');
    v_short := nullif(btrim(coalesce(r ->> 'short_description', '')), '');
    v_pack := nullif(btrim(coalesce(r ->> 'pack_size', '')), '');
    v_terms := nullif(btrim(coalesce(r ->> 'terms', '')), '');
    select coalesce(array_agg(btrim(x.t) order by x.n) filter (where btrim(x.t) <> ''), '{}') into v_inc
      from jsonb_array_elements_text(case when jsonb_typeof(r -> 'includes') = 'array' then r -> 'includes' else '[]'::jsonb end) with ordinality as x(t, n);
    if char_length(coalesce(v_brand, '')) > 60 or char_length(coalesce(v_short, '')) > 140
       or char_length(coalesce(v_pack, '')) > 40 or char_length(coalesce(v_terms, '')) > 500
       or not public.item_includes_valid(v_inc) then
      raise exception 'invalid_details' using errcode = 'P0001';
    end if;

    select coalesce(array_agg(t), '{}') into v_tags from jsonb_array_elements_text(coalesce(r -> 'tags', '[]'::jsonb)) as t;
    v_sort := v_sort + 1;
    insert into public.items (business_id, name, section, price, price_max, price_type, unit, availability, tags, visible, draft, sort,
      brand, short_description, pack_size, terms, includes)
    values (v_id, btrim(r ->> 'name'), nullif(btrim(coalesce(r ->> 'section', '')), ''), (r ->> 'price')::numeric, (r ->> 'price_max')::numeric,
      coalesce(r ->> 'price_type', 'fixed'), nullif(btrim(coalesce(r ->> 'unit', '')), ''), coalesce(r ->> 'availability', 'available'), v_tags, false, true, v_sort,
      v_brand, v_short, v_pack, v_terms, v_inc);
    v_n := v_n + 1;
  end loop;
  perform public.write_audit(v_id, 'items_imported', 'item', null, jsonb_build_object('count', v_n));
  return jsonb_build_object('created', v_n);
end $$;
