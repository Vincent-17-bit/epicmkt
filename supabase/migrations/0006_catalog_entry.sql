-- S1 catalog data entry: item fields the seller form writes, wider availability set.
-- The stock trigger (apply_stock_rules, 0005) stays the authority for stock-driven status;
-- shared/src/seller/availability.js mirrors it for previews only.

alter table public.items
  add column if not exists kind text not null default 'product',
  add column if not exists short_description text,
  add column if not exists badge text,
  add column if not exists sale_starts_at timestamptz,
  add column if not exists sale_ends_at timestamptz,
  add column if not exists search_tags text[] not null default '{}',
  add column if not exists variants jsonb not null default '[]',
  add column if not exists specs jsonb not null default '[]',
  add column if not exists includes jsonb not null default '[]',
  add column if not exists terms text,
  add column if not exists service jsonb not null default '{}',
  add column if not exists membership jsonb not null default '{}',
  add column if not exists attributes jsonb not null default '{}';

alter table public.items drop constraint if exists items_availability_check;
alter table public.items add constraint items_availability_check check (availability in (
  'available', 'limited_stock', 'out_of_stock', 'seasonal', 'by_appointment', 'coming_soon', 'unavailable'
));

-- New constraints are NOT VALID so rows written before S1 are not rejected; every new write is checked.
-- Added only when missing, so this file can run again safely.
do $$
declare c record;
begin
  for c in select * from (values
    ('items_kind_check', $c$check (kind in ('product', 'service', 'membership', 'class'))$c$),
    ('items_badge_check', $c$check (badge is null or badge in ('Popular', 'New', 'Best value'))$c$),
    ('items_name_len_check', $c$check (char_length(name) <= 80)$c$),
    ('items_short_description_check', $c$check (short_description is null or char_length(short_description) <= 160)$c$),
    ('items_description_len_check', $c$check (description is null or char_length(description) <= 2000)$c$),
    ('items_terms_len_check', $c$check (terms is null or char_length(terms) <= 1000)$c$),
    ('items_whole_kes_check', $c$check ((price is null or price = trunc(price)) and (price_max is null or price_max = trunc(price_max)) and (sale_price is null or sale_price = trunc(sale_price)))$c$),
    ('items_range_check', $c$check (price_max is null or price is null or price_max > price)$c$),
    ('items_sale_below_price_check', $c$check (sale_price is null or price is null or sale_price < price)$c$),
    ('items_sale_window_check', $c$check (sale_starts_at is null or sale_ends_at is null or sale_ends_at >= sale_starts_at)$c$),
    ('items_search_tags_check', $c$check (cardinality(search_tags) <= 15)$c$),
    ('items_variants_check', $c$check (jsonb_typeof(variants) = 'array' and jsonb_array_length(variants) <= 12)$c$),
    ('items_specs_check', $c$check (jsonb_typeof(specs) = 'array' and jsonb_array_length(specs) <= 20)$c$),
    ('items_includes_check', $c$check (jsonb_typeof(includes) = 'array' and jsonb_array_length(includes) <= 20)$c$),
    ('items_service_check', $c$check (jsonb_typeof(service) = 'object' and octet_length(service::text) <= 4000)$c$),
    ('items_membership_check', $c$check (jsonb_typeof(membership) = 'object' and octet_length(membership::text) <= 4000)$c$),
    ('items_attributes_check', $c$check (jsonb_typeof(attributes) = 'object' and octet_length(attributes::text) <= 8000)$c$)
  ) as t(name, def) loop
    if not exists (select 1 from pg_constraint where conname = c.name and conrelid = 'public.items'::regclass) then
      execute format('alter table public.items add constraint %I %s not valid', c.name, c.def);
    end if;
  end loop;
end $$;

-- Sections are an ordered list of names kept in seller_settings.settings.sections (items.section holds the name),
-- so no new table is needed. Unit defaults live in settings.units.
