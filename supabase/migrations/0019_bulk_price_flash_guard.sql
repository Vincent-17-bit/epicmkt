-- Percentage price changes must not touch items in a scheduled or live flash sale.
--
-- A flash sale price is derived from items.price at read time, so changing the regular price in bulk
-- silently changes what customers pay mid-sale. seller_save_item (0018) already refuses this for single
-- edits. seller_bulk_items('price_percent') now skips those items and counts them in 'skipped', the same
-- way it already skips items with no fixed price. seller_catalog_items reports in_flash_sale per item so
-- the app's preview matches what the server will do.
-- Both functions are copied from 0017 with only those changes.

create or replace function public.seller_catalog_items() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_b public.businesses;
  v_limit integer;
begin
  perform public.assert_seller_active();
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select * into v_b from public.businesses where id = v_id;
  select p.items_limit into v_limit from public.plans p where p.category_id = v_b.category_id and p.plan_key = v_b.plan_key;
  return jsonb_build_object(
    'shop', jsonb_build_object('slug', v_b.slug, 'status', v_b.status, 'live', public.business_is_visible(v_b), 'plan_key', v_b.plan_key, 'items_limit', v_limit),
    'items', coalesce((
      select jsonb_agg(to_jsonb(i) || jsonb_build_object(
        'image_paths', coalesce((select jsonb_agg(m.path order by m.sort, m.created_at) from public.item_media m where m.item_id = i.id and m.kind = 'image'), '[]'::jsonb),
        'has_video', exists (select 1 from public.item_media m where m.item_id = i.id and m.kind = 'video'),
        'in_flash_sale', exists (select 1 from public.flash_sales s where s.item_id = i.id and s.status in ('scheduled','live'))
      ) order by i.sort, i.created_at, i.id)
      from public.items i where i.business_id = v_id
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.seller_bulk_items(p_action text, p_ids uuid[], p_args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_ids uuid[];
  v_n integer := 0;
  v_skipped integer := 0;
  v_tenths integer;
  v_section text;
  v_avail text;
begin
  perform public.assert_seller_active();
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('hide','show','delete','move_section','set_availability','price_percent','confirm_prices') then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'no_items' using errcode = 'P0001'; end if;
  if cardinality(p_ids) > 500 then raise exception 'too_many_items' using errcode = 'P0001'; end if;

  perform 1 from public.items i where i.business_id = v_id and i.id = any (p_ids) and not i.removed_by_admin order by i.id for update;
  select coalesce(array_agg(i.id order by i.id), '{}') into v_ids
    from public.items i
    where i.business_id = v_id and i.id = any (p_ids) and not i.removed_by_admin;
  v_skipped := cardinality(p_ids) - cardinality(v_ids);

  if p_action = 'hide' then
    update public.items set visible = false where id = any (v_ids) and visible;
    get diagnostics v_n = row_count;
  elsif p_action = 'show' then
    update public.items set visible = true, draft = false where id = any (v_ids) and (not visible or draft);
    get diagnostics v_n = row_count;
  elsif p_action = 'delete' then
    delete from public.items where id = any (v_ids);
    get diagnostics v_n = row_count;
  elsif p_action = 'move_section' then
    v_section := nullif(btrim(coalesce(p_args ->> 'section', '')), '');
    if v_section is not null and char_length(v_section) > 60 then raise exception 'invalid_section' using errcode = 'P0001'; end if;
    update public.items set section = v_section where id = any (v_ids) and section is distinct from v_section;
    get diagnostics v_n = row_count;
  elsif p_action = 'set_availability' then
    v_avail := p_args ->> 'availability';
    if v_avail is null or v_avail not in ('available','limited_stock','out_of_stock','unavailable','by_appointment') then
      raise exception 'invalid_availability' using errcode = 'P0001';
    end if;
    update public.items set availability = v_avail where id = any (v_ids) and availability <> v_avail;
    get diagnostics v_n = row_count;
  elsif p_action = 'price_percent' then
    begin
      v_tenths := round((p_args ->> 'percent')::numeric * 10)::integer;
    exception when others then
      raise exception 'invalid_percent' using errcode = 'P0001';
    end;
    if v_tenths = 0 or v_tenths < -900 or v_tenths > 3000 then raise exception 'invalid_percent' using errcode = 'P0001'; end if;
    if exists (
      select 1 from public.items i
      where i.id = any (v_ids) and i.price_type in ('fixed','from','range') and not exists (select 1 from public.flash_sales s where s.item_id = i.id and s.status in ('scheduled','live'))
        and greatest(public.seller_scale_price(i.price, v_tenths), coalesce(public.seller_scale_price(i.price_max, v_tenths), 0)) > 9999999999.99
    ) then raise exception 'price_too_large' using errcode = 'P0001'; end if;
    update public.items i set
      price = public.seller_scale_price(i.price, v_tenths),
      price_max = public.seller_scale_price(i.price_max, v_tenths),
      sale_price = case
        when i.sale_price is null then null
        when public.seller_scale_price(i.sale_price, v_tenths) < public.seller_scale_price(i.price, v_tenths) then public.seller_scale_price(i.sale_price, v_tenths)
        when public.seller_scale_price(i.price, v_tenths) > 1 then public.seller_scale_price(i.price, v_tenths) - 1
        else null end
    where i.id = any (v_ids) and i.price_type in ('fixed','from','range') and i.price is not null
      and not exists (select 1 from public.flash_sales s where s.item_id = i.id and s.status in ('scheduled','live'));
    get diagnostics v_n = row_count;
    v_skipped := v_skipped + (cardinality(v_ids) - v_n);
  else
    update public.items set price_confirmed_at = now() where id = any (v_ids);
    get diagnostics v_n = row_count;
  end if;

  perform public.write_audit(v_id, 'items_bulk_' || p_action, 'item', null, jsonb_build_object('count', v_n, 'skipped', v_skipped, 'args', coalesce(p_args, '{}')));
  return jsonb_build_object('affected', v_n, 'skipped', v_skipped);
end $$;
