-- "Similar items" on the product page: find other stores' items of the same KIND as one item.
--
-- The client computes what the item is (its head noun, with synonyms and plurals, in shared/src/similar.js) and sends the
-- written forms ("bread", "breads", "loaf", "loaves") as p_terms. This function is only the coarse net that makes that one
-- indexed query: items whose NAME contains one of the words as a whole word (full-text search, not a substring, so "tea"
-- never matches "steak"), or that sit in the same section. The real relevance gate and the ordering are applied afterwards by
-- the shared rankSimilar, identically for the demo backend, so a looser net here cannot put an unrelated product in the row.
--
--   * Listed and public only: every row goes through public_items, so the visibility rules stay defined in one place.
--   * Never the current item, never the current store.
--   * At most three items per store, best first, so one store with a hundred loaves cannot crowd out the others.
--   * Returns just the card columns plus brand, as a JSON array (no specs, highlights or terms).
--
-- Rollout: the client falls back to its older multi-query path while this function does not exist, so this migration can be
-- applied after the client is deployed. It adds two indexes (a GIN index on the name words and a btree on the normalised
-- section); on a large items table consider creating them CONCURRENTLY outside a transaction instead.
--
-- Not done here on purpose: a stored per-item product_type / taxonomy column. A value derived from the name goes stale as the
-- vocabulary improves, and a seller-chosen one needs seller UI. shared/src/similar.js already accepts an optional
-- `productType` on items, so adding it later changes no ranking code.

create index if not exists items_name_words_idx on public.items using gin (to_tsvector('simple', coalesce(name, '')));
create index if not exists items_section_norm_idx on public.items (lower(btrim(section))) where section is not null;

create or replace function public.similar_item_candidates(
  p_item_id uuid,
  p_terms text[] default '{}',
  p_limit integer default 120
) returns jsonb
language plpgsql stable security definer set search_path = public, extensions set statement_timeout = '3s' as $$
declare
  v_business uuid;
  v_section text;
  v_query tsquery;
  v_limit integer := least(300, greatest(1, coalesce(p_limit, 120)));
  v_out jsonb;
begin
  select pi.business_id, nullif(lower(btrim(pi.section)), '')
    into v_business, v_section
    from public.public_items pi
   where pi.id = p_item_id;
  if v_business is null then return '[]'::jsonb; end if;

  -- Letters and digits only, so the words can never alter the query; at most 24 of them.
  select to_tsquery('simple', string_agg(quote_literal(t.term), ' | '))
    into v_query
    from (
      select distinct left(regexp_replace(lower(x), '[^a-z0-9]', '', 'g'), 30) as term
        from unnest(coalesce(p_terms, '{}'::text[])) as x
       limit 24
    ) t
   where t.term <> '';

  if v_query is null and v_section is null then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', card.id, 'business_id', card.business_id, 'name', card.name, 'description', card.description,
             'price', card.price, 'price_type', card.price_type, 'unit', card.unit, 'section', card.section,
             'availability', card.availability, 'stock_left', card.stock_left, 'image_paths', card.image_paths,
             'video_paths', card.video_paths, 'media', card.media, 'sort', card.sort, 'created_at', card.created_at,
             'brand', card.brand
           )
           order by k.rn, k.by_name desc, k.by_section desc, k.created_at desc, k.id
         ), '[]'::jsonb)
    into v_out
    from (
      select ranked.id, ranked.rn, ranked.by_name, ranked.by_section, ranked.created_at
        from (
          select hit.id, hit.created_at, hit.by_name, hit.by_section,
                 row_number() over (partition by hit.business_id order by hit.by_name desc, hit.by_section desc, hit.created_at desc, hit.id) as rn
            from (
              -- The index does the narrowing on public.items; public_items then drops everything that is not listed and public.
              select pi.id, pi.business_id, pi.created_at,
                     (v_query is not null and to_tsvector('simple', coalesce(pi.name, '')) @@ v_query) as by_name,
                     (v_section is not null and lower(btrim(pi.section)) = v_section) as by_section
                from public.items i
                join public.public_items pi on pi.id = i.id
               where i.business_id <> v_business
                 and i.id <> p_item_id
                 and ((v_query is not null and to_tsvector('simple', coalesce(i.name, '')) @@ v_query)
                   or (v_section is not null and lower(btrim(i.section)) = v_section))
            ) hit
        ) ranked
       where ranked.rn <= 3
       order by ranked.rn, ranked.by_name desc, ranked.by_section desc, ranked.created_at desc, ranked.id
       limit v_limit
    ) k
    join public.public_items card on card.id = k.id;

  return v_out;
end $$;

revoke all on function public.similar_item_candidates(uuid, text[], integer) from public;
grant execute on function public.similar_item_candidates(uuid, text[], integer) to anon, authenticated, service_role;
