-- Prompt 1.9 follow-up: an owner can set or clear the size chart of ONE item from admin, and see which items a chart is on.
-- Sellers already choose a chart per item through seller_save_item (0086); this is the admin side, for fixing a wrong chart without the seller.
--   * admin_set_item_size_chart(item, chart)   owner only. chart null clears it. The chart must exist and be active. A different chart drops the item's
--                                              own row overrides (they were edits of the old chart). Audited.
--   * admin_items_for_size_chart(chart, query, limit)   owner, reviewer, support: items on a chart (chart given) or items matching a name search (chart null)
--                                              with the business and chart they have now.

create or replace function public.admin_set_item_size_chart(p_item uuid, p_chart uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_old public.items;
  v_chart public.size_charts;
begin
  if not public.has_role(array['owner']) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_old from public.items where id = p_item for update;
  if not found then raise exception 'item_not_found' using errcode = 'P0001'; end if;
  if p_chart is not null then
    select * into v_chart from public.size_charts where id = p_chart;
    if not found then raise exception 'chart_not_found' using errcode = 'P0001'; end if;
    if not v_chart.active and v_old.size_chart_id is distinct from p_chart then raise exception 'chart_inactive' using errcode = 'P0001'; end if;
  end if;
  if v_old.size_chart_id is not distinct from p_chart then return true; end if; -- already so: nothing to change, nothing to audit
  update public.items
     set size_chart_id = p_chart, size_chart_override = null
   where id = p_item;
  perform public.admin_audit_action('item.size_chart', 'item', p_item::text,
    jsonb_build_object('size_chart_id', v_old.size_chart_id), jsonb_build_object('size_chart_id', p_chart), null, null);
  return true;
end $$;

create or replace function public.admin_items_for_size_chart(p_chart uuid default null, p_query text default null, p_limit integer default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if not public.has_role(array['owner', 'reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_chart is null and v_q is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.name)
    from (
      select i.id, i.name, i.product_type_id, i.size_chart_id, c.name as size_chart_name, b.name as business_name
        from public.items i
        join public.businesses b on b.id = i.business_id
        left join public.size_charts c on c.id = i.size_chart_id
       where (p_chart is null or i.size_chart_id = p_chart)
         and (v_q is null or i.name ilike '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
       order by i.name
       limit least(greatest(coalesce(p_limit, 30), 1), 100)
    ) x
  ), '[]'::jsonb);
end $$;

revoke all on function public.admin_set_item_size_chart(uuid, uuid), public.admin_items_for_size_chart(uuid, text, integer) from public, anon;
grant execute on function public.admin_set_item_size_chart(uuid, uuid), public.admin_items_for_size_chart(uuid, text, integer) to authenticated, service_role;
