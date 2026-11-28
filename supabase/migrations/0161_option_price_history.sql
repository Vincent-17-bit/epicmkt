-- 0161: a change to a size's price is written to the item's History.
--
-- item_history logged item-level fields only (migrations 0005 and 0050), so changing the price of "Beef / Whole Jar" left no trace.
-- A change to a size's price, sale price, stock status or unit is now logged as field "option_price:Beef / Whole Jar" (and
-- option_sale_price:, option_status:, option_unit:), by the same actor as any other change. Adding a size to an existing item is logged
-- too; creating an item with its sizes is not (that would fill the History with one row per size).
-- Prices keep their cents (migration 0162). Additive; safe to run again.

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
