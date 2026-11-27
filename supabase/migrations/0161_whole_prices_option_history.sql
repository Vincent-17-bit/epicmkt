-- 0161: prices are whole shillings, and a change to a size's price is written to the item's History.
--
-- 1. Whole shillings. The editor took prices such as 10.50, but the buyer is charged whole shillings (the pricing code rounds half up
--    per unit), so a stored 10.50 was charged as KES 11 and three of them as KES 33 instead of KES 31.50. A price with cents is a
--    dispute waiting to happen, so:
--      - every stored price (items.price, price_max, sale_price; item_variants.price, sale_price) is rounded half up once, here;
--        a sale price is kept below its price (it never ends up equal to it), and dropped only when it would have to be below 1;
--      - from now on a save with cents is refused with invalid_price (P0001), whichever function wrote it.
--    Quantity tiers and flash sale discounts are not touched: tiers were already whole amounts.
-- 2. History. item_history logged item-level fields only (migrations 0005 and 0050), so changing the price of "Beef / Whole Jar" left no
--    trace. A change to a size's price, sale price, stock status or unit is now logged as field "option_price:Beef / Whole Jar" (and
--    option_sale_price:, option_status:, option_unit:), by the same actor as any other change. Adding a size to an existing item is logged
--    too; creating an item with its sizes is not (that would fill the History with one row per size).
--
-- Additive; safe to run again.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Round what is stored now (before the guard exists, so the guard does not refuse the clean-up itself).
-- ---------------------------------------------------------------------------------------------------------------------
update public.items set
  price = round(price),
  price_max = round(price_max),
  sale_price = case
    when sale_price is null then null
    when round(sale_price) < round(price) then round(sale_price)
    when round(price) - 1 >= 1 then round(price) - 1
    else null end
where price <> trunc(price) or price_max <> trunc(price_max) or sale_price <> trunc(sale_price);

update public.item_variants set
  price = round(price),
  sale_price = case
    when sale_price is null then null
    when round(sale_price) < round(price) then round(sale_price)
    when round(price) - 1 >= 1 then round(price) - 1
    else null end
where price <> trunc(price) or sale_price <> trunc(sale_price);

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Refuse cents from now on. A trigger, so every path that writes a price is covered, not only the functions that exist today.
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.require_whole_prices() returns trigger
language plpgsql set search_path = public as $$
declare
  r jsonb := to_jsonb(new);
  f text;
  n numeric;
begin
  foreach f in array tg_argv loop
    if r ->> f is not null then
      n := (r ->> f)::numeric;
      if n <> trunc(n) then raise exception 'invalid_price' using errcode = 'P0001', hint = f; end if;
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists t_items_whole_price on public.items;
create trigger t_items_whole_price before insert or update of price, price_max, sale_price on public.items
  for each row execute function public.require_whole_prices('price', 'price_max', 'sale_price');

drop trigger if exists t_item_variants_whole_price on public.item_variants;
create trigger t_item_variants_whole_price before insert or update of price, sale_price on public.item_variants
  for each row execute function public.require_whole_prices('price', 'sale_price');

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. History of option (size) changes.
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.log_variant_changes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  n jsonb := to_jsonb(new);
  v_item public.items;
  v_label text;
  f text;
begin
  select * into v_item from public.items where id = new.item_id;
  if not found then return null; end if;
  -- The first sizes of an item (created with it, or the first time options are switched on) are not "changes": only a size added to
  -- sizes that already existed is. Rows saved in this transaction do not count as "already existed".
  if tg_op = 'INSERT' and not exists (select 1 from public.item_variants x where x.item_id = new.item_id and x.created_at < now()) then return null; end if;

  foreach f in array array['price', 'sale_price', 'status', 'unit'] loop
    if o ->> f is distinct from n ->> f and not (tg_op = 'INSERT' and (n ->> f is null or (f = 'status' and n ->> f = 'available'))) then
      if v_label is null then
        -- "Beef / Whole Jar": the value labels of the item's options in order, else the stored key.
        select string_agg(val ->> 'label', ' / ' order by a.n) into v_label
          from jsonb_array_elements(coalesce(v_item.option_axes, '[]'::jsonb)) with ordinality as a(e, n)
          cross join lateral jsonb_array_elements(coalesce(a.e -> 'values', '[]'::jsonb)) as val
          where val ->> 'id' = new.choice ->> (a.e ->> 'key');
        v_label := coalesce(nullif(v_label, ''), new.combo_key);
      end if;
      insert into public.item_history (item_id, business_id, field, old_value, new_value, changed_by, actor_role)
      values (new.item_id, new.business_id, 'option_' || f || ':' || v_label, o ->> f, n ->> f, auth.uid(), public.actor_role());
    end if;
  end loop;
  return null;
end $$;

drop trigger if exists t_item_variants_history on public.item_variants;
create trigger t_item_variants_history after insert or update on public.item_variants
  for each row execute function public.log_variant_changes();
