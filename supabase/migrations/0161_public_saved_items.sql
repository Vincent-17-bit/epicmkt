-- 0161_public_saved_items.sql
-- One read for the buyer's Saved drawer: public_saved_items(ids) returns, for each id asked (in the order asked, at most 200):
--   { id, item, options, tiers, redirect }
--   item      the public_items row, or null when the item is not listed any more (hidden, sold out, deleted)
--   options   public_item_options(id) for a listed item (options, optionVariants, ...), else null
--   tiers     public_item_tiers(id) for a listed item, else null
--   redirect  public_item_redirect(id) for an item that is not listed (the seller combined it into another), else null
-- It only calls the existing public reads, so it can show nothing they do not. Read-only: nothing is changed anywhere.

create or replace function public.public_saved_items(p_ids uuid[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id,
           'item', l.item,
           'options', case when l.item is not null then public.public_item_options(x.id) end,
           'tiers',   case when l.item is not null then public.public_item_tiers(x.id) end,
           'redirect', case when l.item is null then public.public_item_redirect(x.id) end
         ) order by x.n), '[]'::jsonb)
  from unnest(coalesce(p_ids[1:200], '{}'::uuid[])) with ordinality as x(id, n)
  left join lateral (select to_jsonb(pi) as item from public.public_items pi where pi.id = x.id) l on true
$$;

revoke all on function public.public_saved_items(uuid[]) from public;
grant execute on function public.public_saved_items(uuid[]) to anon, authenticated, service_role;
