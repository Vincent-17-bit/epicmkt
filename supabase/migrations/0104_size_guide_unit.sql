-- A seller's size guide may have no length unit at all (bottle volumes, loaf weights, bag capacity): its unit stays null instead of becoming 'cm',
-- so the buyer's cm / inches switch is never offered for a table of litres or grams. Only the buyer payload changes; idempotent.
create or replace function public.item_size_chart_payload(p_item public.items) returns jsonb
language sql stable security definer set search_path = public as $$
  select case
    when p_item.size_guide is not null and public.size_guide_valid(p_item.size_guide) then jsonb_build_object(
      'id', null, 'name', 'Size guide', 'category', null, 'unit', case when p_item.size_guide ->> 'unit' in ('cm', 'in') then p_item.size_guide -> 'unit' else null end,
      'columns', p_item.size_guide -> 'columns', 'rows', p_item.size_guide -> 'rows', 'overridden', false, 'own', true)
    when c.id is null then null
    else jsonb_build_object(
      'id', c.id, 'name', c.name, 'category', c.category, 'unit', c.unit, 'columns', c.columns,
      'rows', case when p_item.size_chart_override is not null and public.size_chart_rows_valid(p_item.size_chart_override -> 'rows', jsonb_array_length(c.columns))
                   then p_item.size_chart_override -> 'rows' else c.rows end,
      'overridden', p_item.size_chart_override is not null and public.size_chart_rows_valid(p_item.size_chart_override -> 'rows', jsonb_array_length(c.columns))) end
  from (select 1) one left join public.size_charts c on c.id = p_item.size_chart_id and c.active
$$;
revoke all on function public.item_size_chart_payload(public.items) from public;
grant execute on function public.item_size_chart_payload(public.items) to service_role;

notify pgrst, 'reload schema';
