-- "Similar items" on the product page: find other stores' items of the same KIND as one item, fast on a table of millions.
--
-- The client computes what the item is (its head noun, with synonyms and plurals, in shared/src/similar.js) and sends the
-- written forms ("bread", "breads", "loaf", "loaves") as p_terms. This function is only the coarse net: items whose NAME contains
-- one of the words as a whole word (full-text search, not a substring, so "tea" never matches "steak"), or that sit in the same
-- section. The real relevance gate and the ordering are applied afterwards by the shared rankSimilar, identically for the demo
-- backend, so a looser net here cannot put an unrelated product in the row.
--
-- Built to stay fast as the table grows (measured on 1,000,000 items, 3,000 stores, the real public_items view: 30 to 80 ms for every
-- kind of product from very common to rare; a first version that joined the view to every match took 5 to 10 seconds):
--   1. A bounded pool from the base table, newest first (never every match, never the view, which is costly per row). Unlisted items
--      are skipped here by calling the same function the view uses, so they cannot take a store's slot. Store visibility (expired,
--      suspended) is deliberately NOT checked here: business_is_visible() is too costly to run per candidate row (it took seconds), so
--      it is applied only to the final few ids by the view; an invisible store can only waste its own slots, never another store's.
--      A rare word reads its few matches through the word index; a common word walks the newest-first index and stops at 600.
--      The function decides which by probing how common the word is, so it does not depend on the planner guessing.
--   2. At most three items per store, each store's best first, so a store with a thousand loaves cannot crowd out the others.
--   3. The exact visibility rules by asking public_items about only those few ids. Listed and public only, defined in that one view.
-- Never the current item, never the current store. Returns just the card columns plus brand, as a JSON array.
--
-- Needs these indexes (create them first, with the CONCURRENTLY migrations that follow, so writes are never blocked):
--   items_name_words_idx     GIN on the name words                                       (0070)
--   items_section_recent_idx btree on (normalised section, created_at desc)              (0071)
--   items_created_at_id_idx  already exists
-- It still works without them, only slowly. This migration itself takes no locks and is instant.
--
-- Not done here on purpose: a stored per-item product_type / taxonomy column. A value derived from the name goes stale as the
-- vocabulary improves, and a seller-chosen one needs seller UI. shared/src/similar.js already accepts an optional `productType`
-- on items, so adding it later changes no ranking code.

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
  -- About sqrt(600 x rows): the size at which "read every match" and "walk newest-first until 600 are found" cost the same.
  v_probe integer := least(60000, greatest(2000, floor(sqrt(600.0 * greatest(1000, (select c.reltuples from pg_class c where c.oid = 'public.items'::regclass))))::integer));
  v_rare boolean := false;
  v_ids uuid[];
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

  -- How common is this word? Reading at most v_probe matches is cheap whatever the table size.
  if v_query is not null then
    select count(*) < v_probe into v_rare
      from (select 1 from public.items i where to_tsvector('simple', coalesce(i.name, '')) @@ v_query limit v_probe) p;
  end if;

  -- Stage 1: a bounded pool, newest first. Never the whole set of matches, and never the view, which is costly per row.
  --   rare word:   read all of its matches through the word index (at most v_probe), keep the newest 600
  --   common word: walk the newest-first index and stop at 600
  with named_rare as materialized (
    select i.id, i.business_id, i.created_at
      from public.items i
     where v_rare and v_query is not null and to_tsvector('simple', coalesce(i.name, '')) @@ v_query
       and i.business_id <> v_business and i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin
       and public.item_is_listed(i.availability)
     limit v_probe
  ), named_common as (
    select i.id, i.business_id, i.created_at
      from public.items i
     where not v_rare and v_query is not null and to_tsvector('simple', coalesce(i.name, '')) @@ v_query
       and i.business_id <> v_business and i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin
       and public.item_is_listed(i.availability)
     order by i.created_at desc, i.id limit 600
  ), named as (
    select id, business_id, created_at from (select * from named_rare order by created_at desc, id limit 600) r
    union all
    select id, business_id, created_at from named_common
  ), sectioned as (
    select i.id, i.business_id, i.created_at
      from public.items i
     where v_section is not null and lower(btrim(i.section)) = v_section
       and i.business_id <> v_business and i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin
       and public.item_is_listed(i.availability)
     order by i.created_at desc, i.id limit 300
  ), pool as (
    select u.id, u.business_id, u.created_at, bool_or(u.by_name) as by_name, bool_or(u.by_section) as by_section
      from (select n.id, n.business_id, n.created_at, true as by_name, false as by_section from named n
            union all
            select s.id, s.business_id, s.created_at, false, true from sectioned s) u
     group by u.id, u.business_id, u.created_at
  ), ranked as (
    select p.*, row_number() over (partition by p.business_id order by p.by_name desc, p.by_section desc, p.created_at desc, p.id) as rn
      from pool p
  )
  -- Stage 2: at most three per store, each store's best first, a little more than will be returned (some may drop out below).
  select array_agg(r.id order by r.rn, r.by_name desc, r.by_section desc, r.created_at desc, r.id)
    into v_ids
    from (select * from ranked where rn <= 3 order by rn, by_name desc, by_section desc, created_at desc, id limit v_limit * 2) r;
  if v_ids is null then return '[]'::jsonb; end if;

  -- Stage 3: the exact visibility rules, by asking public_items about only these few ids. The rules stay defined in that one view.
  select coalesce(jsonb_agg(f.j order by f.pos), '[]'::jsonb)
    into v_out
    from (
      select g.j, g.pos, row_number() over (order by g.pos) as place
        from (
          select array_position(v_ids, card.id) as pos,
                 jsonb_build_object(
                   'id', card.id, 'business_id', card.business_id, 'name', card.name, 'description', card.description,
                   'price', card.price, 'price_type', card.price_type, 'unit', card.unit, 'section', card.section,
                   'availability', card.availability, 'stock_left', card.stock_left, 'image_paths', card.image_paths,
                   'video_paths', card.video_paths, 'media', card.media, 'sort', card.sort, 'created_at', card.created_at,
                   'brand', card.brand
                 ) as j
            from public.public_items card
           where card.id = any(v_ids)
        ) g
    ) f
   where f.place <= v_limit;

  return v_out;
end $$;

revoke all on function public.similar_item_candidates(uuid, text[], integer) from public;
grant execute on function public.similar_item_candidates(uuid, text[], integer) to anon, authenticated, service_role;
