-- Same-section, newest-first index for "Similar items" (see 0069). CONCURRENTLY: no write blocking; run this statement on its own.
-- Replaces the plain section index of the first version of 0069; once this exists that one can be dropped:
--   drop index concurrently if exists items_section_norm_idx;
create index concurrently if not exists items_section_recent_idx on public.items (lower(btrim(section)), created_at desc) where section is not null;
