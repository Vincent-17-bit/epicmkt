-- "3 options" on a card needs a number, not only has_options (0096).
--   public_items.option_count    how many ways to buy the item: its priced combinations that are not unavailable, or the older variants
--                                list when it has no combinations. 0 for an item with no options.
--   products_snapshot            carries option_count beside has_options (the snapshot reads public_items).
-- Appending a column to a view keeps every existing reader working.

create or replace view public.public_items with (security_barrier = true) as
select
  i.id, i.business_id, i.name, i.description, i.section, i.price, i.price_max, i.price_type, i.unit,
  i.availability, i.sort, i.created_at,
  coalesce((select jsonb_agg(m.path order by m.sort, m.created_at, m.id) from public.item_media m where m.item_id = i.id and m.kind = 'image'), '[]'::jsonb) as image_paths,
  coalesce((select jsonb_agg(m.path order by m.sort, m.created_at, m.id) from public.item_media m where m.item_id = i.id and m.kind = 'video'), '[]'::jsonb) as video_paths,
  case when i.track_stock and i.show_stock_count and i.availability = 'limited_stock' and i.stock_count > 0 then i.stock_count end as stock_left,
  i.brand, i.short_description, i.highlights, i.specs, i.includes, i.terms, i.pack_size,
  coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'path', m.path, 'kind', m.kind, 'duration', m.duration_sec, 'role', m.role,
      'optionIds', to_jsonb(array(select u from unnest(m.option_ids) as u where public.item_has_option_value(i.id, u))))
      order by m.sort, m.created_at, m.id)
    from public.item_media m where m.item_id = i.id and m.kind in ('image', 'video')), '[]'::jsonb) as media,
  coalesce((select jsonb_agg(jsonb_build_object('id', x.e ->> 'id', 'label', x.e ->> 'label', 'price', (x.e ->> 'price')::numeric) order by x.n)
    from jsonb_array_elements(case when jsonb_typeof(i.variants) = 'array' then i.variants else '[]'::jsonb end) with ordinality as x(e, n)
    where coalesce(x.e ->> 'stock', '') <> '0'), '[]'::jsonb) as variants,
  i.price_min, i.price_high, i.has_options, i.department_id, i.product_type_id, i.has_3d,
  case
    when exists (select 1 from public.item_variants v where v.item_id = i.id)
      then (select count(*) from public.item_variants v where v.item_id = i.id and v.status <> 'unavailable')::int
    when jsonb_typeof(i.variants) = 'array' then jsonb_array_length(i.variants)
    else 0
  end as option_count
from public.items i
join public.businesses b on b.id = i.business_id
where public.business_is_visible(b) and i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin
  and public.item_is_listed(i.availability);
revoke all on public.public_items from public;
grant select on public.public_items to anon, authenticated, service_role;

do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'products_snapshot';
  v_def := replace(v_def, E'\r', ''); -- a pasted script may carry Windows line breaks
  if position('option_count' in v_def) = 0 then
    v_new := replace(v_def, 'i.has_options, i.department_id', 'i.has_options, i.option_count, i.department_id');
    if v_new = v_def then raise exception 'products_snapshot: capped column list not found'; end if;
    v_def := v_new;
    v_new := replace(v_def, 'k.has_options, k.department_id', 'k.has_options, k.option_count, k.department_id');
    if v_new = v_def then raise exception 'products_snapshot: item column list not found'; end if;
    execute v_new;
  end if;
end $$;
