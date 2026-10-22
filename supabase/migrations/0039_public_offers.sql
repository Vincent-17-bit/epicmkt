-- 0039_public_offers.sql
-- Business cards show an "Offer" chip when a shop has an offer running. Customers (anon) cannot read public.offers
-- directly (row level security), so this view exposes only the offers that are public right now: the business is live,
-- the offer is active, inside its start/end window, and not hidden or removed by an admin. Same rules as public_items.
-- Only fields a customer may see leave the database; admin columns stay behind.

create or replace view public.public_offers with (security_barrier = true) as
select
  o.id, o.business_id, o.title, o.description, o.starts_at, o.ends_at, o.created_at
from public.offers o
join public.businesses b on b.id = o.business_id
where public.business_is_visible(b)
  and o.active
  and not o.hidden_by_admin
  and not o.removed_by_admin
  and (o.starts_at is null or o.starts_at <= now())
  and (o.ends_at is null or o.ends_at > now());
revoke all on public.public_offers from public;
grant select on public.public_offers to anon, authenticated, service_role;
