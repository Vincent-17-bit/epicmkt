-- Trending read, global. Restores the read-time live check that 0147 added (trending_row_is_live), which 0149 left out, and ranks the
-- "nothing searched yet" categories by how many live shops each has instead of a fixed weight.

create or replace function public.trending_lists(p_county text default null, p_limit integer default 10) returns jsonb
language plpgsql stable security definer set search_path = public set statement_timeout = '3s' as
$$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 20);
  v_fresh boolean := coalesce((select last_run_at > now() - make_interval(hours => stale_hours) from public.trending_settings limit 1), false);
  v_scope text := '*';
  v_rscope text := '*';
  v_fallback text := 'none';
  v_pop jsonb := '[]'::jsonb;
  v_rise jsonb := '[]'::jsonb;
  v_at timestamptz := now();
  v_live boolean := false;
begin
  if v_fresh then
    select last_run_at into v_at from public.trending_settings limit 1;

    select coalesce(jsonb_agg(jsonb_build_object('rank', rank, 'term', label, 'count', people, 'hot', hot, 'pinned', pinned, 'kind', kind,
                                                 'label', name, 'itemId', item_id, 'slug', slug, 'image', image, 'price', price) order by rank), '[]'::jsonb)
      into v_pop from (select * from public.search_trending s where s.list = 'popular' and s.scope = v_scope and public.trending_row_is_live(s.kind, s.item_id, s.slug) order by s.rank limit v_limit) t;
    select coalesce(jsonb_agg(jsonb_build_object('rank', rank, 'term', label, 'count', people, 'ratio', ratio, 'hot', true, 'kind', kind,
                                                 'label', name, 'itemId', item_id, 'slug', slug, 'image', image, 'price', price) order by rank), '[]'::jsonb)
      into v_rise from (select * from public.search_trending s where s.list = 'rising' and s.scope = v_rscope and public.trending_row_is_live(s.kind, s.item_id, s.slug) order by s.rank limit v_limit) t;
  else
    -- the stored list is missing or older than stale_hours: the live count (0039) of the last 24 hours, kind unknown
    v_live := true;
    select coalesce(jsonb_agg(jsonb_build_object('rank', rn, 'term', term, 'count', count, 'hot', hot, 'pinned', false, 'kind', null) order by rn), '[]'::jsonb)
      into v_pop from (select row_number() over () as rn, * from public.top_searches(v_limit)) t;
  end if;

  if jsonb_array_length(v_pop) = 0 then
    -- a young site: nothing has been searched enough yet, so show the categories with the most live shops (a real count, no fixed order)
    v_fallback := 'categories';
    select coalesce(jsonb_agg(jsonb_build_object('rank', rn, 'term', label, 'count', 0, 'hot', false, 'pinned', false, 'kind', 'category',
                                                 'label', label, 'slug', slug) order by rn), '[]'::jsonb)
      into v_pop from (select row_number() over (order by n desc, label) as rn, label, slug
                       from (select t.label, t.ref as slug,
                                    (select count(*) from public.businesses b where b.category_id = t.ref and public.business_is_visible(b)) as n
                             from public.search_terms t where t.kind = 'category') c
                       order by n desc, label limit v_limit) t;
  end if;

  return jsonb_build_object('computedAt', v_at, 'live', v_live, 'scope', v_scope, 'fallback', v_fallback,
                            'popular', v_pop, 'rising', v_rise, 'risingScope', v_rscope, 'items', v_pop);
end $$;
revoke all on function public.trending_lists(text, integer) from public;
grant execute on function public.trending_lists(text, integer) to anon, authenticated, service_role;
