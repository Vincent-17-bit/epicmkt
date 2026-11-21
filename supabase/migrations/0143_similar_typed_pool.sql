-- 0143_similar_typed_pool.sql
-- "Similar items" by what the seller says the item IS (0141 made the product type required for new items).
--
--   1. Every returned row now carries product_type_id (additive: a new JSON key; every other key and the row order rules are unchanged), so the
--      client no longer needs a second query to read the type of each candidate.
--   2. A typed pool: when the item has a real type (not null, not 'other'), items of the SAME type in other stores are fetched too, newest first,
--      read through items_type_recent_idx (0142). They are fetched whatever their names say, so two items with no word in common find each other.
--      The per-store cap (three), the limits, the visibility rules and the exclusion of the item and its own store are exactly as before.
--      Typed rows rank first within a store's slots (by_type), then by name, then by section, so a typed match is never crowded out.
--
-- Not changed: how the candidates are judged. The shared rankSimilar still applies the relevance gate and the order.
-- Apply 0142 first: without the index this still works, only slowly. Backward compatible both ways: an old client ignores the new key, and a
-- client talking to the old function simply has no type on the rows and ranks by names and sections, as before.
-- Rollback: re-run the function definition of 0069 (create or replace), which has no typed pool and no product_type_id key.

create or replace function public.similar_item_candidates(
  p_item_id uuid,
  p_terms text[] default '{}',
  p_limit integer default 120
) returns jsonb
language plpgsql stable security definer set search_path = public, extensions set statement_timeout = '3s' as $$
declare
  v_business uuid;
  v_section text;
  v_type text;
  v_query tsquery;
  v_limit integer := least(300, greatest(1, coalesce(p_limit, 120)));
  -- About sqrt(600 x rows): the size at which "read every match" and "walk newest-first until 600 are found" cost the same.
  v_probe integer := least(60000, greatest(2000, floor(sqrt(600.0 * greatest(1000, (select c.reltuples from pg_class c where c.oid = 'public.items'::regclass))))::integer));
  v_rare boolean := false;
  v_ids uuid[];
  v_out jsonb;
begin
  select pi.business_id, nullif(lower(btrim(pi.section)), ''), nullif(btrim(pi.product_type_id), '')
    into v_business, v_section, v_type
    from public.public_items pi
   where pi.id = p_item_id;
  if v_business is null then return '[]'::jsonb; end if;
  -- "other" and no type are no evidence of what the item is: no typed pool.
  if v_type = 'other' then v_type := null; end if;

  -- Letters and digits only, so the words can never alter the query; at most 24 of them.
  select to_tsquery('simple', string_agg(quote_literal(t.term), ' | '))
    into v_query
    from (
      select distinct left(regexp_replace(lower(x), '[^a-z0-9]', '', 'g'), 30) as term
        from unnest(coalesce(p_terms, '{}'::text[])) as x
       limit 24
    ) t
   where t.term <> '';

  if v_query is null and v_section is null and v_type is null then return '[]'::jsonb; end if;

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
  ), typed as (
    select i.id, i.business_id, i.created_at
      from public.items i
     where v_type is not null and i.product_type_id = v_type and i.product_type_id <> 'other'
       and i.business_id <> v_business and i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin
       and public.item_is_listed(i.availability)
     order by i.created_at desc, i.id limit 300
  ), pool as (
    select u.id, u.business_id, u.created_at, bool_or(u.by_name) as by_name, bool_or(u.by_section) as by_section, bool_or(u.by_type) as by_type
      from (select n.id, n.business_id, n.created_at, true as by_name, false as by_section, false as by_type from named n
            union all
            select s.id, s.business_id, s.created_at, false, true, false from sectioned s
            union all
            select t.id, t.business_id, t.created_at, false, false, true from typed t) u
     group by u.id, u.business_id, u.created_at
  ), ranked as (
    select p.*, row_number() over (partition by p.business_id order by p.by_type desc, p.by_name desc, p.by_section desc, p.created_at desc, p.id) as rn
      from pool p
  )
  -- Stage 2: at most three per store, each store's best first, a little more than will be returned (some may drop out below).
  select array_agg(r.id order by r.rn, r.by_type desc, r.by_name desc, r.by_section desc, r.created_at desc, r.id)
    into v_ids
    from (select * from ranked where rn <= 3 order by rn, by_type desc, by_name desc, by_section desc, created_at desc, id limit v_limit * 2) r;
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
                   'brand', card.brand, 'product_type_id', card.product_type_id
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
