-- 0142_items_type_recent_idx.sql
-- Newest-first index by product type, for the "typed pool" of Similar items (0143): the items of one type in other stores. Partial: an item
-- with no type, or the explicit "other" (0141), is not evidence of anything, so it is never looked up by type and never takes index space.
-- CONCURRENTLY, so this file holds this one statement and must run outside a transaction (see 0070, 0071, 0129 and the README). If a build
-- is interrupted it leaves an INVALID index of this name: `drop index concurrently if exists items_type_recent_idx;` and run it again.
-- Rollback: drop index concurrently if exists public.items_type_recent_idx;
create index concurrently if not exists items_type_recent_idx on public.items (product_type_id, created_at desc, id) where product_type_id is not null and product_type_id <> 'other';
