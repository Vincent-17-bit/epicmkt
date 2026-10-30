create or replace function public.attach_item_media(
  p_item uuid, p_kind text, p_path text, p_mime text, p_width integer, p_height integer, p_duration numeric, p_size bigint
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_bid uuid;
  v_id uuid;
  v_sort integer;
begin
  select i.business_id into v_bid from public.items i where i.id = p_item;
  if v_bid is null then raise exception 'item_not_found'; end if;
  if p_path not like v_bid::text || '/%' then raise exception 'path_not_owned' using errcode = '42501'; end if;
  if not public.media_limit_ok(p_item, p_kind) then raise exception 'limit_reached:item_media'; end if;
  select coalesce(max(m.sort) + 1, 0) into v_sort from public.item_media m where m.item_id = p_item;
  insert into public.item_media (item_id, business_id, kind, path, mime, sort, width, height, duration_sec, size_bytes)
  values (p_item, v_bid, p_kind, p_path, p_mime, v_sort, p_width, p_height, p_duration, p_size)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.attach_item_media(uuid, text, text, text, integer, integer, numeric, bigint) from public, anon, authenticated;
grant execute on function public.attach_item_media(uuid, text, text, text, integer, integer, numeric, bigint) to service_role;

create or replace function public.seller_list_item_media(p_item uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
begin
  perform public.assert_seller_active();
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if not exists (select 1 from public.items i where i.id = p_item and i.business_id = v_id and not i.removed_by_admin) then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'path', m.path, 'kind', m.kind, 'mime', m.mime, 'width', m.width, 'height', m.height,
      'durationSec', m.duration_sec, 'size', m.size_bytes
    ) order by m.sort, m.created_at, m.id)
    from public.item_media m where m.item_id = p_item and m.business_id = v_id
  ), '[]'::jsonb);
end $$;
revoke all on function public.seller_list_item_media(uuid) from public, anon;
grant execute on function public.seller_list_item_media(uuid) to authenticated, service_role;

create or replace function public.seller_reorder_item_media(p_item uuid, p_paths text[]) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_n integer;
begin
  perform public.assert_seller_active();
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if not exists (select 1 from public.items i where i.id = p_item and i.business_id = v_id and not i.removed_by_admin) then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;
  if p_paths is null or cardinality(p_paths) = 0 or cardinality(p_paths) > 50 then raise exception 'no_items' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext(v_id::text || 'item_media'));
  with asked as (
    select u.path, min(u.ord) as ord from unnest(p_paths) with ordinality as u(path, ord) group by u.path
  ), mine as (
    select m.id, m.sort as was, a.ord
    from public.item_media m left join asked a on a.path = m.path
    where m.item_id = p_item and m.business_id = v_id
  ), ranked as (
    select id, was, (row_number() over (order by (ord is null), ord, was, id) - 1)::integer as pos from mine
  )
  update public.item_media m set sort = r.pos from ranked r where m.id = r.id and m.sort <> r.pos;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.seller_reorder_item_media(uuid, text[]) from public, anon;
grant execute on function public.seller_reorder_item_media(uuid, text[]) to authenticated, service_role;

create or replace view public.public_items with (security_barrier = true) as
select
  i.id, i.business_id, i.name, i.description, i.section, i.price, i.price_max, i.price_type, i.unit,
  i.availability, i.sort, i.created_at,
  coalesce((select jsonb_agg(m.path order by m.sort, m.created_at, m.id) from public.item_media m where m.item_id = i.id and m.kind = 'image'), '[]'::jsonb) as image_paths,
  coalesce((select jsonb_agg(m.path order by m.sort, m.created_at, m.id) from public.item_media m where m.item_id = i.id and m.kind = 'video'), '[]'::jsonb) as video_paths,
  case when i.track_stock and i.show_stock_count and i.availability = 'limited_stock' and i.stock_count > 0 then i.stock_count end as stock_left,
  i.brand, i.short_description, i.highlights, i.specs, i.includes, i.terms, i.pack_size,
  coalesce((select jsonb_agg(jsonb_build_object('kind', m.kind, 'path', m.path, 'durationSec', m.duration_sec) order by m.sort, m.created_at, m.id) from public.item_media m where m.item_id = i.id), '[]'::jsonb) as media
from public.items i
join public.businesses b on b.id = i.business_id
where public.business_is_visible(b) and i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin
  and public.item_is_listed(i.availability);
revoke all on public.public_items from public;
grant select on public.public_items to anon, authenticated, service_role;
