-- Word index for "Similar items" (see 0069). CONCURRENTLY: builds without blocking writes, so it is safe on a live table of millions.
-- It cannot run inside a transaction, so run this statement on its own. If a build is interrupted it leaves an INVALID index that
-- "if not exists" would skip; check with:  select indexrelid::regclass from pg_index where not indisvalid;  and drop it, then rerun.
create index concurrently if not exists items_name_words_idx on public.items using gin (to_tsvector('simple', coalesce(name, '')));
