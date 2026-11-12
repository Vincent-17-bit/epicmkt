-- 0098: flash sales saved with the older id entries ({ variantId, salePrice? }, migration 0013) hit only the listed combinations, in the
-- price range and in the public option payload, as the pricing core does. Entries with { combo, type, value } are unchanged.

create or replace function public.flash_variant_price(p_sale public.flash_sales, p_variant uuid, p_combo text, p_regular numeric) returns numeric
language plpgsql stable set search_path = public as $$
declare
  v_price numeric;
begin
  if p_regular is null then return null; end if;
  if jsonb_array_length(p_sale.variant_overrides) > 0
     and not exists (select 1 from jsonb_array_elements(p_sale.variant_overrides) x(e) where x.e ? 'combo') then
    if p_variant is null or not exists (select 1 from jsonb_array_elements(p_sale.variant_overrides) x(e) where x.e ->> 'variantId' = p_variant::text) then
      return null;
    end if;
    v_price := public.flash_discounted_price(p_sale.discount_type, p_sale.discount_value, p_regular);
    if v_price <= 0 or v_price >= p_regular then return null; end if;
    return v_price;
  end if;
  return public.flash_combo_price(p_sale, p_combo, p_regular);
end $$;

revoke all on function public.flash_variant_price(public.flash_sales, uuid, text, numeric) from public;
grant execute on function public.flash_variant_price(public.flash_sales, uuid, text, numeric) to anon, authenticated, service_role;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into strict v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'item_denorm';
  v_def := replace(v_def, 'v.combo_key as combo,', 'v.combo_key as combo, v.id as vid,');
  v_def := replace(v_def, 'null::text, it.availability', 'null::text, null::uuid, it.availability');
  v_def := replace(v_def, 'public.flash_combo_price(f, r.combo, v_listed)', 'public.flash_variant_price(f, r.vid, r.combo, v_listed)');
  if v_def not like '%flash_variant_price%' or v_def not like '%r.vid%' then raise exception '0098: item_denorm patch did not apply'; end if;
  execute v_def;

  select pg_get_functiondef(p.oid) into strict v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'public_item_options';
  v_def := replace(v_def, 'public.flash_combo_price(s, vr.combo_key, (x.e ->> ''price'')::numeric)', 'public.flash_variant_price(s, vr.id, vr.combo_key, (x.e ->> ''price'')::numeric)');
  if v_def not like '%flash_variant_price%' then raise exception '0098: public_item_options patch did not apply'; end if;
  execute v_def;
end $$;

select public.items_refresh_denorm(array(select id from public.items where price_type in ('fixed', 'from', 'range')));
