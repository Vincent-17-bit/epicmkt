-- 0159: every option combination can carry its own unit ("per 3 cubes", "per pack of 40", "per jar of 48").
--
-- Until now the unit lived on the item only, so a buyer who picked the 48-piece jar read "KES 160 / per 3 cubes". A combination
-- now has an optional `unit`. Empty (null) keeps the old behaviour: the item's unit is shown. Nothing else about prices changes.
--
--   item_variants.unit            text, at most 30 characters (same limit as items.unit), null = use the item's unit
--   options.variants[].unit       accepted by seller_save_item (key absent = leave alone, null or blank = clear, text = set)
--   seller_item_options           returns variants[].unit
--   public_item_options           returns optionVariants[].unit (null when the combination has none of its own)
--   seller_duplicate_item         copies the units
--
-- The existing functions are wrapped (renamed to *_pre_unit, called by the new version), the way 0094, 0095 and 0097 did, so
-- nothing already tested has to be copied here. Errors (P0001): invalid_variant.

alter table public.item_variants add column if not exists unit text;
alter table public.item_variants drop constraint if exists item_variants_unit_ck;
alter table public.item_variants add constraint item_variants_unit_ck check (unit is null or (btrim(unit) = unit and char_length(unit) between 1 and 30));

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Save: the unit is taken out of each variant before the existing checks (which refuse unknown keys), then written by combination.
-- ---------------------------------------------------------------------------------------------------------------------
do $$ begin
  if to_regprocedure('public.item_options_apply_pre_unit(uuid, uuid, jsonb)') is null then
    alter function public.item_options_apply(uuid, uuid, jsonb) rename to item_options_apply_pre_unit;
  end if;
end $$;
revoke all on function public.item_options_apply_pre_unit(uuid, uuid, jsonb) from public, anon, authenticated;

create or replace function public.item_options_apply(p_item uuid, p_business uuid, f jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  e jsonb;
  v_clean jsonb := '[]'::jsonb;
  v_units jsonb := '[]'::jsonb;
  v_unit text;
  v_axes jsonb;
  v_key text;
begin
  if jsonb_typeof(f -> 'options') = 'object' and jsonb_typeof(f -> 'options' -> 'variants') = 'array' then
    for e in select jsonb_array_elements(f -> 'options' -> 'variants') loop
      if jsonb_typeof(e) = 'object' and e ? 'unit' then
        if jsonb_typeof(e -> 'unit') = 'null' then
          v_unit := null;
        elsif jsonb_typeof(e -> 'unit') <> 'string' then
          raise exception 'invalid_variant' using errcode = 'P0001';
        else
          v_unit := nullif(btrim(e ->> 'unit'), '');
          if char_length(coalesce(v_unit, '')) > 30 then raise exception 'invalid_variant' using errcode = 'P0001'; end if;
        end if;
        v_units := v_units || jsonb_build_array(jsonb_build_object('choice', e -> 'choice', 'unit', to_jsonb(v_unit)));
        v_clean := v_clean || jsonb_build_array(e - 'unit');
      else
        v_clean := v_clean || jsonb_build_array(e);
      end if;
    end loop;
    f := jsonb_set(f, '{options,variants}', v_clean);
  end if;

  perform public.item_options_apply_pre_unit(p_item, p_business, f);

  if jsonb_array_length(v_units) > 0 then
    select option_axes into v_axes from public.items where id = p_item;
    for e in select jsonb_array_elements(v_units) loop
      v_key := public.item_option_combo_key(v_axes, e -> 'choice');
      update public.item_variants set unit = case when jsonb_typeof(e -> 'unit') = 'null' then null else e ->> 'unit' end, updated_at = now()
        where item_id = p_item and combo_key = v_key
          and unit is distinct from case when jsonb_typeof(e -> 'unit') = 'null' then null else e ->> 'unit' end;
    end loop;
  end if;
end $$;
revoke all on function public.item_options_apply(uuid, uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Reads: the seller's editor and the buyer's page get each combination's own unit.
-- ---------------------------------------------------------------------------------------------------------------------
do $$ begin
  if to_regprocedure('public.seller_item_options_pre_unit(uuid)') is null then
    alter function public.seller_item_options(uuid) rename to seller_item_options_pre_unit;
  end if;
  if to_regprocedure('public.public_item_options_pre_unit(uuid)') is null then
    alter function public.public_item_options(uuid) rename to public_item_options_pre_unit;
  end if;
end $$;
revoke all on function public.seller_item_options_pre_unit(uuid) from public, anon, authenticated;
grant execute on function public.seller_item_options_pre_unit(uuid) to service_role;
revoke all on function public.public_item_options_pre_unit(uuid) from public, anon, authenticated;
grant execute on function public.public_item_options_pre_unit(uuid) to service_role;

create or replace function public.seller_item_options(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r jsonb;
begin
  perform public.assert_seller_active();   -- the guard every seller function carries (the wrapped read repeats it)
  r := public.seller_item_options_pre_unit(p_id);
  if r is null or jsonb_typeof(r -> 'variants') <> 'array' then return r; end if;
  return jsonb_set(r, '{variants}', coalesce((
    select jsonb_agg(x.e || jsonb_build_object('unit', to_jsonb(v.unit)) order by x.n)
    from jsonb_array_elements(r -> 'variants') with ordinality as x(e, n)
    left join public.item_variants v on v.item_id = p_id and v.id::text = x.e ->> 'id'
  ), '[]'::jsonb));
end $$;
revoke all on function public.seller_item_options(uuid) from public, anon;
grant execute on function public.seller_item_options(uuid) to authenticated, service_role;

create or replace function public.public_item_options(p_item uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r jsonb := public.public_item_options_pre_unit(p_item);
begin
  if r is null or jsonb_typeof(r -> 'optionVariants') <> 'array' then return r; end if;
  return jsonb_set(r, '{optionVariants}', coalesce((
    select jsonb_agg(x.e || jsonb_build_object('unit', to_jsonb(v.unit)) order by x.n)
    from jsonb_array_elements(r -> 'optionVariants') with ordinality as x(e, n)
    left join public.item_variants v on v.item_id = p_item and v.id::text = x.e ->> 'id'
  ), '[]'::jsonb));
end $$;
revoke all on function public.public_item_options(uuid) from public, anon;
grant execute on function public.public_item_options(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Duplicate: the copy keeps each combination's unit.
-- ---------------------------------------------------------------------------------------------------------------------
do $$ begin
  if to_regprocedure('public.seller_duplicate_item_pre_unit(uuid)') is null then
    alter function public.seller_duplicate_item(uuid) rename to seller_duplicate_item_pre_unit;
  end if;
end $$;
revoke all on function public.seller_duplicate_item_pre_unit(uuid) from public, anon, authenticated;
grant execute on function public.seller_duplicate_item_pre_unit(uuid) to service_role;

create or replace function public.seller_duplicate_item(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_new uuid;
begin
  perform public.assert_seller_active();
  v_new := public.seller_duplicate_item_pre_unit(p_id);
  update public.item_variants n set unit = o.unit
    from public.item_variants o where o.item_id = p_id and n.item_id = v_new and n.combo_key = o.combo_key;
  return v_new;
end $$;
revoke all on function public.seller_duplicate_item(uuid) from public, anon;
grant execute on function public.seller_duplicate_item(uuid) to authenticated, service_role;
