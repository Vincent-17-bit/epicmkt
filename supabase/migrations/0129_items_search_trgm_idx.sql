-- 0129_items_search_trgm_idx.sql
-- Trigram index on the normal form of item names (see 0128): "looks like" matching for misspellings ("mlik" finds milk) and
-- LIKE '%word%', both index scans instead of reading every item. CONCURRENTLY: builds without blocking writes, so it is safe on a
-- live table of millions. It cannot run inside a transaction, so this file holds this one statement. If a build is interrupted
-- it leaves an INVALID index that "if not exists" would skip; check with:
--   select indexrelid::regclass from pg_index where not indisvalid;
-- then drop it and run this again.
create index concurrently if not exists items_search_trgm_idx on public.items using gin (public.search_key(name) extensions.gin_trgm_ops);
