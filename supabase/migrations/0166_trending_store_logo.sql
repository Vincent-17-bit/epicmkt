-- Trending: a store shows its own profile picture (logo), never a product picture.
-- search_terms never held a picture for a store, so the row came back empty and the app filled it with a product photo.

create or replace function public.search_trending_resolve(p_label text)
returns table (kind text, item_id uuid, name text, slug text, image text, price numeric)
language plpgsql stable security definer set search_path = public, extensions set statement_timeout = '5s' as
$$
declare
  v_key text := public.search_key(p_label);
  r record;
begin
  if v_key = '' then return; end if;

  select st.label, st.ref as slug, b.logo_path as image into r
  from public.search_terms st
  join public.businesses b on b.slug = st.ref and public.business_is_visible(b)
  where st.kind = 'store' and st.key = v_key limit 1;
  if found then
    return query select 'store'::text, null::uuid, r.label, r.slug, r.image, null::numeric;
    return;
  end if;

  select st.label, st.ref as slug into r from public.search_terms st where st.kind = 'category' and st.key = v_key limit 1;
  if found then
    return query select 'category'::text, null::uuid, r.label, r.slug, null::text, null::numeric;
    return;
  end if;

  select i.id as item_id, i.name, b.slug,
         (select x.path from public.item_media x where x.item_id = i.id and x.kind = 'image' order by x.sort, x.created_at, x.id limit 1) as image,
         coalesce(i.price_min, i.price) as price into r
  from public.flash_sales fs
  join public.items i on i.id = fs.item_id
  join public.businesses b on b.id = fs.business_id
  where fs.status = 'live' and fs.starts_at <= now() and fs.ends_at > now()
    and public.item_is_public(i.visible, i.draft, i.hidden_by_admin, i.removed_by_admin, i.availability)
    and public.business_is_visible(b)
    and public.item_search_doc(i.name, i.brand, i.section) @@ public.search_tsquery(public.search_query_tokens(p_label))
  order by fs.ends_at limit 1;
  if found then
    return query select 'flash'::text, r.item_id, r.name, r.slug, r.image, r.price;
    return;
  end if;

  return query select 'product'::text, e.item_id, e.label, e.slug, e.image, e.price from public.search_example_item(p_label) e;
end $$;

select public.refresh_trending();
