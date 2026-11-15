-- 0127_search_facts.sql
-- Product search with filters (the /products page) and the colour filter on the home list read more of an item than the product
-- snapshot carries: its spec rows (output power, battery life, screen size ...), its highlights and short description, the
-- labels of its option values and the colours of its swatches. This returns them for every live public item at once, as
-- { "<item id>": { specs, highlights, shortDescription, optionValues, swatches } }, capped so the answer stays small. The
-- /api/products endpoint reads it next to the snapshot and caches it with it. Same visibility rule as public_items.

create or replace function public.item_search_facts(p_specs jsonb, p_highlights jsonb, p_short text, p_axes jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'specs', (select jsonb_agg(jsonb_build_object('label', left(e ->> 'label', 60), 'value', left(e ->> 'value', 120)) order by n)
              from jsonb_array_elements(case when jsonb_typeof(p_specs) = 'array' then p_specs else '[]'::jsonb end) with ordinality as s(e, n)
              where n <= 24 and jsonb_typeof(e) = 'object' and coalesce(e ->> 'label', '') <> '' and coalesce(e ->> 'value', '') <> ''),
    'highlights', (select jsonb_agg(left(case when jsonb_typeof(e) = 'string' then e #>> '{}' else concat_ws(' ', e ->> 'title', e ->> 'text', e ->> 'label', e ->> 'value') end, 160) order by n)
                   from jsonb_array_elements(case when jsonb_typeof(p_highlights) = 'array' then p_highlights else '[]'::jsonb end) with ordinality as h(e, n)
                   where n <= 6),
    'shortDescription', nullif(left(btrim(coalesce(p_short, '')), 200), ''),
    'optionValues', (select jsonb_agg(distinct left(v ->> 'label', 40))
                     from jsonb_array_elements(case when jsonb_typeof(p_axes) = 'array' then p_axes else '[]'::jsonb end) a,
                          jsonb_array_elements(case when jsonb_typeof(a -> 'values') = 'array' then a -> 'values' else '[]'::jsonb end) v
                     where coalesce(v ->> 'label', '') <> ''),
    'swatches', (select jsonb_agg(jsonb_build_object('label', left(v ->> 'label', 40), 'color', v ->> 'color'))
                 from jsonb_array_elements(case when jsonb_typeof(p_axes) = 'array' then p_axes else '[]'::jsonb end) a,
                      jsonb_array_elements(case when jsonb_typeof(a -> 'values') = 'array' then a -> 'values' else '[]'::jsonb end) v
                 where a ->> 'display' = 'swatch' and coalesce(v ->> 'label', '') <> '')
  ))
$$;

create or replace function public.public_item_search_facts(p_limit integer default 50000) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(x.id, x.facts), '{}'::jsonb)
  from (
    select it.id, public.item_search_facts(it.specs, it.highlights, it.short_description, it.option_axes) as facts
    from public.items it join public.public_items pi on pi.id = it.id
    order by it.created_at desc, it.id
    limit least(greatest(coalesce(p_limit, 50000), 1), 50000)
  ) x
  where x.facts <> '{}'::jsonb
$$;

revoke all on function public.item_search_facts(jsonb, jsonb, text, jsonb), public.public_item_search_facts(integer) from public;
grant execute on function public.public_item_search_facts(integer) to anon, authenticated, service_role;
