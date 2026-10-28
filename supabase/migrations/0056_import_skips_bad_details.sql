-- seller_import_items (0052) now also takes the optional highlights and specs of each row, and a row whose details are not valid
-- is skipped and reported instead of stopping the whole import. The good rows are still created.
--
--   returns { "created": <n>, "skipped": [ { "row": <spreadsheet row>, "error": "invalid_details" | "formula_rejected" } ] }
--
-- "row" is the row number the seller app sends with each row (the line in their file); without it, the position in p_rows.
-- Only the optional details are skipped. A bad name, section, unit, price or price type, a missing Premium plan, too many rows
-- and the plan's item limit still refuse the whole import, as before, and a refused import creates nothing.
create or replace function public.seller_import_items(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_b public.businesses;
  r jsonb;
  v_pos integer := 0;
  v_row integer;
  v_sort integer;
  v_n integer := 0;
  v_tags text[];
  v_brand text;
  v_short text;
  v_pack text;
  v_terms text;
  v_inc text[];
  v_hl jsonb;
  v_specs jsonb;
  v_err text;
  v_skipped jsonb := '[]'::jsonb;
  k text;
  c_formula constant text[] := array['=','+','-','@'];
begin
  perform public.assert_seller_active();
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select * into v_b from public.businesses where id = v_id;
  if v_b.plan_key <> 'premium' then raise exception 'premium_required' using errcode = 'P0001'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'no_rows' using errcode = 'P0001'; end if;
  if jsonb_array_length(p_rows) > 500 then raise exception 'too_many_rows' using errcode = 'P0001'; end if;
  select coalesce(max(sort), 0) into v_sort from public.items where business_id = v_id;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_pos := v_pos + 1;
    v_row := case when coalesce(r ->> 'row', '') ~ '^\d{1,6}$' then (r ->> 'row')::integer else v_pos end;

    if left(coalesce(r ->> 'name', ''), 1) = any (c_formula) or left(coalesce(r ->> 'section', ''), 1) = any (c_formula)
       or left(coalesce(r ->> 'unit', ''), 1) = any (c_formula) then
      raise exception 'formula_rejected' using errcode = 'P0001';
    end if;

    -- The optional details. A problem here marks the row as skipped; v_err keeps the first one found.
    v_err := null;
    foreach k in array array['brand', 'short_description', 'pack_size', 'terms'] loop
      if r ? k and jsonb_typeof(r -> k) not in ('string', 'null') then v_err := coalesce(v_err, 'invalid_details'); end if;
      if left(coalesce(r ->> k, ''), 1) = any (c_formula) then v_err := coalesce(v_err, 'formula_rejected'); end if;
    end loop;
    if (r ? 'includes' and jsonb_typeof(r -> 'includes') not in ('array', 'null'))
       or (r ? 'highlights' and jsonb_typeof(r -> 'highlights') not in ('array', 'null'))
       or (r ? 'specs' and jsonb_typeof(r -> 'specs') not in ('array', 'null')) then
      v_err := coalesce(v_err, 'invalid_details');
    end if;

    v_brand := nullif(btrim(coalesce(r ->> 'brand', '')), '');
    v_short := nullif(btrim(coalesce(r ->> 'short_description', '')), '');
    v_pack := nullif(btrim(coalesce(r ->> 'pack_size', '')), '');
    v_terms := nullif(btrim(coalesce(r ->> 'terms', '')), '');
    v_inc := '{}';
    v_hl := '[]'::jsonb;
    v_specs := '[]'::jsonb;

    if v_err is null then
      if exists (select 1 from jsonb_array_elements(case when jsonb_typeof(r -> 'includes') = 'array' then r -> 'includes' else '[]'::jsonb end) e where jsonb_typeof(e) <> 'string') then
        v_err := 'invalid_details';
      else
        select coalesce(array_agg(btrim(x.t) order by x.n) filter (where btrim(x.t) <> ''), '{}') into v_inc
          from jsonb_array_elements_text(case when jsonb_typeof(r -> 'includes') = 'array' then r -> 'includes' else '[]'::jsonb end) with ordinality as x(t, n);
        if exists (select 1 from unnest(v_inc) e where left(e, 1) = any (c_formula)) then v_err := 'formula_rejected'; end if;
      end if;
    end if;

    -- Highlights and specs are normalised as seller_save_item does: a missing group becomes "Features & Specs", a blank lead is dropped.
    if v_err is null and jsonb_typeof(r -> 'highlights') = 'array' then
      select coalesce(jsonb_agg(
        case when jsonb_typeof(x.e) = 'object' and (jsonb_typeof(x.e -> 'title') = 'null' or btrim(coalesce(x.e ->> 'title', 'x')) = '') then x.e - 'title' else x.e end
        order by x.n), '[]'::jsonb) into v_hl
        from jsonb_array_elements(r -> 'highlights') with ordinality as x(e, n);
      if exists (select 1 from jsonb_array_elements(v_hl) e where left(coalesce(e ->> 'text', ''), 1) = any (c_formula) or left(coalesce(e ->> 'title', ''), 1) = any (c_formula)) then
        v_err := 'formula_rejected';
      end if;
    end if;
    if v_err is null and jsonb_typeof(r -> 'specs') = 'array' then
      select coalesce(jsonb_agg(
        case when jsonb_typeof(x.e) = 'object' and (not x.e ? 'group' or jsonb_typeof(x.e -> 'group') = 'null')
          then x.e || jsonb_build_object('group', 'Features & Specs') else x.e end
        order by x.n), '[]'::jsonb) into v_specs
        from jsonb_array_elements(r -> 'specs') with ordinality as x(e, n);
      if exists (select 1 from jsonb_array_elements(v_specs) e where left(coalesce(e ->> 'label', ''), 1) = any (c_formula) or left(coalesce(e ->> 'value', ''), 1) = any (c_formula)) then
        v_err := 'formula_rejected';
      end if;
    end if;

    if v_err is null and (char_length(coalesce(v_brand, '')) > 60 or char_length(coalesce(v_short, '')) > 140
       or char_length(coalesce(v_pack, '')) > 40 or char_length(coalesce(v_terms, '')) > 500
       or not public.item_includes_valid(v_inc) or not public.item_highlights_valid(v_hl) or not public.item_specs_valid(v_specs)) then
      v_err := 'invalid_details';
    end if;

    if v_err is not null then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('row', v_row, 'error', v_err));
      continue;
    end if;

    select coalesce(array_agg(t), '{}') into v_tags from jsonb_array_elements_text(coalesce(r -> 'tags', '[]'::jsonb)) as t;
    v_sort := v_sort + 1;
    insert into public.items (business_id, name, section, price, price_max, price_type, unit, availability, tags, visible, draft, sort,
      brand, short_description, pack_size, terms, includes, highlights, specs)
    values (v_id, btrim(r ->> 'name'), nullif(btrim(coalesce(r ->> 'section', '')), ''), (r ->> 'price')::numeric, (r ->> 'price_max')::numeric,
      coalesce(r ->> 'price_type', 'fixed'), nullif(btrim(coalesce(r ->> 'unit', '')), ''), coalesce(r ->> 'availability', 'available'), v_tags, false, true, v_sort,
      v_brand, v_short, v_pack, v_terms, v_inc, v_hl, v_specs);
    v_n := v_n + 1;
  end loop;
  perform public.write_audit(v_id, 'items_imported', 'item', null, jsonb_build_object('count', v_n));
  return jsonb_build_object('created', v_n, 'skipped', v_skipped);
end $$;
