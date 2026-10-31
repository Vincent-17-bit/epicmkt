-- 004600_item_availability.sql
-- Availability for a business directory (see docs/availability.md).
--
--   * Available / by appointment  -> listed, no marker.
--   * Low stock                   -> listed, with a "Low stock" tag (and "Only N left" when the seller allows it).
--   * Out of stock / unavailable  -> NOT listed to customers. The seller keeps the item and can list it again.
--
-- Stock counting already existed in the database (track_stock, stock_count, low_stock_threshold, show_stock_count and the
-- t_items_stock trigger) but sellers had no way to set it. This migration:
--   1. makes public_items (and the offer views that repeat its rule) leave out sold-out items, and exposes stock_left,
--   2. lets seller_save_item write the stock fields,
--   3. adds seller_item_stock: "mark out of stock" and "back in stock" as one guarded call,
--   4. stops the bulk availability action from silently failing on counted items,
--   5. carries stock_left through products_snapshot.
-- No data is changed and no availability value is added or removed.

-- The one definition of "customers can be shown this". 'unavailable' is the older word for out of stock.
create or replace function public.item_is_listed(p_availability text) returns boolean
language sql immutable parallel safe as
$$ select coalesce(p_availability, 'available') not in ('out_of_stock', 'unavailable') $$;
revoke all on function public.item_is_listed(text) from public;
grant execute on function public.item_is_listed(text) to anon, authenticated, service_role;

-- New columns go last so the existing view definition stays valid.
create or replace view public.public_items with (security_barrier = true) as
select
  i.id, i.business_id, i.name, i.description, i.section, i.price, i.price_max, i.price_type, i.unit,
  i.availability, i.sort, i.created_at,
  coalesce((select jsonb_agg(m.path order by m.sort, m.created_at) from public.item_media m where m.item_id = i.id and m.kind = 'image'), '[]'::jsonb) as image_paths,
  coalesce((select jsonb_agg(m.path order by m.sort, m.created_at) from public.item_media m where m.item_id = i.id and m.kind = 'video'), '[]'::jsonb) as video_paths,
  -- Only when the seller counts stock, the item is running low, and they chose to tell customers the number.
  case when i.track_stock and i.show_stock_count and i.availability = 'limited_stock' and i.stock_count > 0 then i.stock_count end as stock_left
from public.items i
join public.businesses b on b.id = i.business_id
where public.business_is_visible(b) and i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin
  and public.item_is_listed(i.availability);
revoke all on public.public_items from public;
grant select on public.public_items to anon, authenticated, service_role;

-- The offer views repeat the "public product" rule, so a sold-out product must not keep an offer chip alive.
create or replace view public.public_offers with (security_barrier = true) as
select
  o.id, o.business_id, o.title, o.description, o.starts_at, o.ends_at, o.created_at,
  o.kind, o.config, o.conditions, o.chip_text, o.code, o.terms,
  p.items
from public.offers o
join public.businesses b on b.id = o.business_id
cross join lateral (
  select
    coalesce(jsonb_agg(jsonb_build_object('item_id', oi.item_id, 'role', oi.role) order by oi.sort, oi.role, oi.item_id), '[]'::jsonb) as items,
    count(*) filter (where oi.role = 'main') as mains,
    count(*) filter (where oi.role = 'with') as withs
  from public.offer_items oi
  join public.items i on i.id = oi.item_id
  where oi.offer_id = o.id and i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin
    and public.item_is_listed(i.availability)
) p
where public.business_is_visible(b)
  and o.kind is not null
  and o.active
  and not o.hidden_by_admin
  and not o.removed_by_admin
  and (o.starts_at is null or o.starts_at <= now())
  and (o.ends_at is null or o.ends_at > now())
  and (p.mains + p.withs) > 0
  and (o.kind <> 'bundle' or (p.mains > 0 and p.withs > 0));
revoke all on public.public_offers from public;
grant select on public.public_offers to anon, authenticated, service_role;

create or replace view public.public_offer_items with (security_barrier = true) as
select
  oi.offer_id, oi.item_id, oi.business_id, oi.role, po.starts_at, po.ends_at
from public.offer_items oi
join public.public_offers po on po.id = oi.offer_id
join public.items i on i.id = oi.item_id
where i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin
  and public.item_is_listed(i.availability);
revoke all on public.public_offer_items from public;
grant select on public.public_offer_items to anon, authenticated, service_role;

-- Seller save: stock fields are optional. Sending none leaves the item's stock settings alone.
create or replace function public.seller_save_item(p_id uuid, p_fields jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  f jsonb := coalesce(p_fields, '{}'::jsonb);
  v_old public.items;
  v_name text := btrim(coalesce(f ->> 'name', ''));
  v_desc text := nullif(btrim(coalesce(f ->> 'description', '')), '');
  v_section text := nullif(btrim(coalesce(f ->> 'section', '')), '');
  v_unit text := nullif(btrim(coalesce(f ->> 'unit', '')), '');
  v_type text := f ->> 'price_type';
  v_avail text := f ->> 'availability';
  v_old_item public.items;
  v_track boolean;
  v_count integer;
  v_low integer;
  v_show boolean;
  v_price numeric;
  v_max numeric;
  v_sale numeric;
  v_sort integer;
  v_new uuid;
  c_money constant text := '^\d{1,10}(\.\d{1,2})?$';
begin
  perform public.assert_seller_active();
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;

  if char_length(v_name) < 2 or char_length(v_name) > 120 then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  if char_length(coalesce(v_desc, '')) > 2000 or char_length(coalesce(v_section, '')) > 60 or char_length(coalesce(v_unit, '')) > 30 then
    raise exception 'invalid_text' using errcode = 'P0001';
  end if;
  if v_avail is null or v_avail not in ('available','limited_stock','out_of_stock','unavailable','by_appointment') then
    raise exception 'invalid_availability' using errcode = 'P0001';
  end if;
  if v_type is null or v_type not in ('fixed','from','range','free','contact') then raise exception 'invalid_price' using errcode = 'P0001'; end if;

  -- Stock counting is optional. A caller that sends none of these fields leaves the item's stock settings as they are.
  if p_id is not null then
    select * into v_old_item from public.items i where i.id = p_id and i.business_id = v_id;
  end if;
  if (f ? 'low_stock_threshold' and coalesce(f ->> 'low_stock_threshold', '') !~ '^\d{1,4}$')
     or (f ? 'track_stock' and coalesce(f ->> 'track_stock', '') not in ('true', 'false'))
     or (f ? 'show_stock_count' and coalesce(f ->> 'show_stock_count', '') not in ('true', 'false')) then
    raise exception 'invalid_stock' using errcode = 'P0001';
  end if;
  v_track := case when f ? 'track_stock' then coalesce((f ->> 'track_stock')::boolean, false) else coalesce(v_old_item.track_stock, false) end;
  v_low := case when f ? 'low_stock_threshold' then (f ->> 'low_stock_threshold')::integer else coalesce(v_old_item.low_stock_threshold, 3) end;
  v_show := case when f ? 'show_stock_count' then coalesce((f ->> 'show_stock_count')::boolean, false) else coalesce(v_old_item.show_stock_count, false) end;
  if f ? 'stock_count' and coalesce(f ->> 'stock_count', '') <> '' then
    if (f ->> 'stock_count') !~ '^\d{1,6}$' then raise exception 'invalid_stock' using errcode = 'P0001'; end if;
    v_count := (f ->> 'stock_count')::integer;
  elsif f ? 'stock_count' then
    v_count := null;
  else
    v_count := v_old_item.stock_count;
  end if;
  if v_low is null or v_low < 0 or v_low > 9999 then raise exception 'invalid_stock' using errcode = 'P0001'; end if;
  if v_track and v_count is null then raise exception 'invalid_stock' using errcode = 'P0001'; end if;
  -- A counted item takes its availability from the count (trigger t_items_stock), so start from the neutral value.
  if v_track then v_avail := 'available'; end if;

  if v_type in ('fixed','from','range') then
    if coalesce(f ->> 'price', '') !~ c_money then raise exception 'invalid_price' using errcode = 'P0001'; end if;
    v_price := (f ->> 'price')::numeric;
    if v_type = 'range' then
      if coalesce(f ->> 'price_max', '') !~ c_money then raise exception 'invalid_price' using errcode = 'P0001'; end if;
      v_max := (f ->> 'price_max')::numeric;
      if v_max < v_price then raise exception 'invalid_price' using errcode = 'P0001'; end if;
    end if;
    if coalesce(f ->> 'sale_price', '') <> '' then
      if (f ->> 'sale_price') !~ c_money then raise exception 'invalid_price' using errcode = 'P0001'; end if;
      v_sale := (f ->> 'sale_price')::numeric;
      if v_sale >= v_price then raise exception 'invalid_price' using errcode = 'P0001'; end if;
    end if;
  end if;

  if p_id is null then
    select coalesce(max(sort), 0) + 1 into v_sort from public.items where business_id = v_id;
    insert into public.items (business_id, name, description, section, price_type, price, price_max, sale_price, unit, availability, track_stock, stock_count, low_stock_threshold, show_stock_count, visible, draft, sort)
    values (v_id, v_name, v_desc, v_section, v_type, v_price, v_max, v_sale, v_unit, v_avail, v_track, v_count, v_low, v_show, false, true, v_sort)
    returning id into v_new;
    return v_new;
  end if;

  select * into v_old from public.items i where i.id = p_id and i.business_id = v_id and not i.removed_by_admin for update;
  if not found then raise exception 'item_not_found' using errcode = 'P0001'; end if;

  if (v_old.price, v_old.price_max, v_old.price_type, v_old.sale_price) is distinct from (v_price, v_max, v_type, v_sale)
     and exists (select 1 from public.flash_sales s where s.item_id = p_id and s.status in ('scheduled','live')) then
    raise exception 'item_in_flash_sale' using errcode = 'P0001';
  end if;

  update public.items set
    name = v_name, description = v_desc, section = v_section, price_type = v_type, price = v_price, price_max = v_max,
    sale_price = v_sale, unit = v_unit, availability = v_avail,
    track_stock = v_track, stock_count = v_count, low_stock_threshold = v_low, show_stock_count = v_show
  where id = p_id;
  return p_id;
end $$;

-- Mark out of stock / back in stock, for one of the seller's own items.
--   sold_out : a counted item goes to 0 (the trigger delists it); any other item is set to out_of_stock.
--   restock  : a counted item needs the new count (a count of 0 would put it straight back out); any other item is
--              set to available.
create or replace function public.seller_item_stock(p_id uuid, p_action text, p_count integer default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_item public.items;
  v_after public.items;
begin
  perform public.assert_seller_active();
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('sold_out', 'restock') then raise exception 'invalid_action' using errcode = 'P0001'; end if;

  select * into v_item from public.items i where i.id = p_id and i.business_id = v_id and not i.removed_by_admin for update;
  if not found then raise exception 'item_not_found' using errcode = 'P0001'; end if;

  if p_action = 'sold_out' then
    if v_item.track_stock then
      update public.items set stock_count = 0 where id = p_id;
    else
      update public.items set availability = 'out_of_stock' where id = p_id;
    end if;
  elsif v_item.track_stock then
    if p_count is null or p_count < 1 or p_count > 999999 then raise exception 'stock_count_required' using errcode = 'P0001'; end if;
    update public.items set stock_count = p_count where id = p_id;
  else
    update public.items set availability = 'available' where id = p_id;
  end if;

  select * into v_after from public.items where id = p_id;
  perform public.write_audit(v_id, 'item_stock_' || p_action, 'item', p_id::text, jsonb_build_object('availability', v_after.availability, 'stock_count', v_after.stock_count));
  return jsonb_build_object('availability', v_after.availability, 'stock_count', v_after.stock_count);
end $$;
revoke all on function public.seller_item_stock(uuid, text, integer) from public, anon;
grant execute on function public.seller_item_stock(uuid, text, integer) to authenticated, service_role;

-- Bulk actions: the availability action no longer silently fails on counted items.
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
  v_blocked integer := 0;
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
    -- A counted item takes its availability from its count, so a status alone cannot relist it: with no stock in hand it
    -- would flip straight back out. Those are skipped, and the seller is told to give them a count (Back in stock).
    select count(*) into v_blocked from public.items i
      where i.id = any (v_ids) and i.track_stock and v_avail in ('available','limited_stock') and coalesce(i.stock_count, 0) <= 0;
    update public.items set
      availability = v_avail,
      stock_count = case when track_stock and v_avail in ('out_of_stock','unavailable') then 0 else stock_count end
    where id = any (v_ids) and availability <> v_avail
      and not (track_stock and v_avail in ('available','limited_stock') and coalesce(stock_count, 0) <= 0);
    get diagnostics v_n = row_count;
    v_skipped := v_skipped + v_blocked;
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

-- The home grid snapshot carries stock_left so the card can say "Only 3 left".
create or replace function public.products_snapshot(p_limit int default 10000) returns jsonb
language sql stable set search_path = public as $$
  with capped as (
    select i.id, i.business_id, i.name, left(i.description, 160) as description, i.section, i.price, i.price_type,
           i.unit, i.availability, i.stock_left, i.created_at, i.image_paths ->> 0 as image_path
    from public.public_items i
    order by i.created_at desc, i.id
    limit least(greatest(coalesce(p_limit, 10000), 1), 50000) + 1
  ), kept as (
    select * from capped order by created_at desc, id limit least(greatest(coalesce(p_limit, 10000), 1), 50000)
  )
  select jsonb_build_object(
    'truncated', (select count(*) from capped) > least(greatest(coalesce(p_limit, 10000), 1), 50000),
    'items', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id)
      from (
        select k.id, k.business_id, k.name, k.description, k.section, k.price, k.price_type, k.unit, k.availability, k.stock_left,
               k.created_at, k.image_path,
               f.id as sale_id, f.sale_price, f.starts_at as sale_starts_at, f.ends_at as sale_ends_at, f.headline as sale_headline
        from kept k
        left join lateral (
          select s.id, s.sale_price, s.starts_at, s.ends_at, s.headline
          from public.public_flash_sales s
          where s.item_id = k.id
          order by s.sale_price asc, s.id
          limit 1
        ) f on true
      ) x), '[]'::jsonb),
    'businesses', coalesce((
      select jsonb_agg(to_jsonb(b))
      from (
        select id, slug, name, plan_key, verification_level, category_id, town, county, hours, exceptions
        from public.public_businesses
        where id in (select business_id from kept)
      ) b), '[]'::jsonb)
  );
$$;
revoke all on function public.products_snapshot(int) from public;
grant execute on function public.products_snapshot(int) to anon, authenticated, service_role;
