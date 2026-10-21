-- 0026_public_item_videos.sql
-- Customers can watch an item's videos. public_items already lists image paths; this adds the video paths, in the same
-- order sellers set (sort, then upload time). Only the storage path leaves the database, exactly like image_paths, and
-- only for items that are already public (visible, not draft, not hidden or removed by an admin, business live).
-- The new column goes last so the existing view definition stays valid.

create or replace view public.public_items with (security_barrier = true) as
select
  i.id, i.business_id, i.name, i.description, i.section, i.price, i.price_max, i.price_type, i.unit,
  i.availability, i.sort, i.created_at,
  coalesce((select jsonb_agg(m.path order by m.sort, m.created_at) from public.item_media m where m.item_id = i.id and m.kind = 'image'), '[]'::jsonb) as image_paths,
  coalesce((select jsonb_agg(m.path order by m.sort, m.created_at) from public.item_media m where m.item_id = i.id and m.kind = 'video'), '[]'::jsonb) as video_paths
from public.items i
join public.businesses b on b.id = i.business_id
where public.business_is_visible(b) and i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin;
revoke all on public.public_items from public;
grant select on public.public_items to anon, authenticated, service_role;
