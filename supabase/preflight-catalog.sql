-- READ-ONLY. Run in the Supabase SQL editor BEFORE `supabase db push` applies migration 0006.
--
-- Migration 0006 adds checks to public.items as NOT VALID: existing rows are not rejected when the migration runs,
-- but PostgreSQL checks the whole row on every later UPDATE. So an old row that breaks a rule below will refuse
-- ordinary edits (even toggling "visible") until the offending value is fixed.
-- An empty result means nothing needs fixing. Each row names the item, its business and the offending value.

select problem, id as item_id, business_id, detail
from (
  select 'name longer than 80 characters' as problem, id, business_id, name as detail
    from public.items where char_length(name) > 80
  union all
  select 'description longer than 2000 characters', id, business_id, left(description, 60) || '...'
    from public.items where char_length(description) > 2000
  union all
  select 'price has cents (whole KES only)', id, business_id, price::text
    from public.items where price is not null and price <> trunc(price)
  union all
  select 'highest price has cents (whole KES only)', id, business_id, price_max::text
    from public.items where price_max is not null and price_max <> trunc(price_max)
  union all
  select 'sale price has cents (whole KES only)', id, business_id, sale_price::text
    from public.items where sale_price is not null and sale_price <> trunc(sale_price)
  union all
  select 'highest price is not above the price', id, business_id, price::text || ' to ' || price_max::text
    from public.items where price is not null and price_max is not null and price_max <= price
  union all
  select 'sale price is not below the price', id, business_id, 'price ' || price::text || ', sale ' || sale_price::text
    from public.items where price is not null and sale_price is not null and sale_price >= price
) found
order by problem, item_id;
