create or replace function public.seller_reorder_item_photos(p_item uuid, p_paths text[]) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_n integer;
begin
  perform public.assert_seller_active();
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if p_paths is null or cardinality(p_paths) = 0 or cardinality(p_paths) > 50 then raise exception 'no_items' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.items i where i.id = p_item and i.business_id = v_id and not i.removed_by_admin) then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;
  update public.item_media m set sort = o.pos
    from (select u.path, (row_number() over (order by min(u.ord)) - 1)::integer as pos from unnest(p_paths) with ordinality as u(path, ord) group by u.path) o
    where m.item_id = p_item and m.business_id = v_id and m.kind = 'image' and m.path = o.path and m.sort <> o.pos;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.seller_reorder_item_photos(uuid, text[]) from public, anon;
grant execute on function public.seller_reorder_item_photos(uuid, text[]) to authenticated, service_role;
