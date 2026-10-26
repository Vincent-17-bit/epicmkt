-- 0046_store_offers rebuilt public_offers from the 0045 text and lost the sold-out rule that 0046_item_availability added.
create or replace view public.public_offers with (security_barrier = true) as
select
  o.id, o.business_id, o.title, o.description, o.starts_at, o.ends_at, o.created_at,
  o.kind, o.config, o.conditions, o.chip_text, o.code, o.terms,
  p.items,
  o.scope
from public.offers o
join public.businesses b on b.id = o.business_id
cross join lateral (
  select
    coalesce(jsonb_agg(jsonb_build_object('item_id', oi.item_id, 'role', oi.role) order by oi.sort, oi.role, oi.item_id), '[]'::jsonb) as items,
    count(*) filter (where oi.role = 'main') as mains,
    count(*) filter (where oi.role = 'with') as withs
  from public.offer_items oi
  join public.items i on i.id = oi.item_id
  where oi.offer_id = o.id and i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin
    and public.item_is_listed(i.availability)
) p
where public.business_is_visible(b)
  and o.kind is not null
  and o.active
  and not o.hidden_by_admin
  and not o.removed_by_admin
  and (o.starts_at is null or o.starts_at <= now())
  and (o.ends_at is null or o.ends_at > now())
  and (
    o.scope = 'store'
    or ((p.mains + p.withs) > 0 and (o.kind <> 'bundle' or (p.mains > 0 and p.withs > 0)))
  );
revoke all on public.public_offers from public;
grant select on public.public_offers to anon, authenticated, service_role;
