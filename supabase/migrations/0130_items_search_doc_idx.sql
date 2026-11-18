-- 0130_items_search_doc_idx.sql
-- Full-text index on what an item is found by: name, brand and section (public.item_search_doc, 0128). Every word typed is a
-- prefix match ("brook mil" finds "Brookside Milk 500ml"), answered from this index whatever the size of the catalogue.
-- CONCURRENTLY, so this file holds this one statement (see 0129 for an interrupted build).
create index concurrently if not exists items_search_doc_idx on public.items using gin (public.item_search_doc(name, brand, section));
