create or replace function public.log_item_changes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
  f text;
begin
  foreach f in array array['name','price','price_max','price_type','unit','sale_price','availability','stock_count','visible','draft','hidden_by_admin','removed_by_admin',
                           'brand','short_description','highlights','specs','includes','terms','pack_size'] loop
    if o -> f is distinct from n -> f then
      insert into public.item_history (item_id, business_id, field, old_value, new_value, changed_by, actor_role)
      values (new.id, new.business_id, f, o ->> f, n ->> f, auth.uid(), public.actor_role());
    end if;
  end loop;
  return null;
end $$;

create or replace function public.seller_item_history(p_item uuid, p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
declare
  v_biz uuid := public.my_business_id();
begin
  perform public.assert_seller_active();
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if not exists (select 1 from public.items where id = p_item and business_id = v_biz) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', h.id, 'field', h.field, 'old_value', h.old_value, 'new_value', h.new_value, 'actor', h.actor_role, 'at', h.created_at) order by h.created_at desc, h.id desc)
    from (
      select * from public.item_history
      where item_id = p_item and business_id = v_biz
        and field in ('price', 'price_max', 'sale_price', 'stock_count', 'availability', 'visible', 'draft', 'hidden_by_admin', 'removed_by_admin')
      order by created_at desc, id desc
      limit least(greatest(coalesce(p_limit, 100), 1), 200)
    ) h
  ), '[]'::jsonb);
end $$;

create or replace function public.seller_item_stats(p_item uuid, p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
declare
  v_biz uuid := public.my_business_id();
  v_days integer := case when p_days in (7, 30, 90) then p_days else 30 end;
  v_tz text;
  v_today date;
  v_from timestamptz;
  v_out jsonb;
begin
  perform public.assert_seller_active();
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select b.timezone into v_tz from public.businesses b where b.id = v_biz;
  if not exists (select 1 from public.items where id = p_item and business_id = v_biz) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_today := (now() at time zone v_tz)::date;
  v_from := ((v_today - (v_days - 1))::timestamp) at time zone v_tz;

  select jsonb_build_object(
    'days', v_days,
    'views', count(*) filter (where e.kind = 'view'),
    'whatsapp', count(*) filter (where e.kind = 'whatsapp'),
    'calls', count(*) filter (where e.kind = 'call'),
    'flash_views', count(*) filter (where e.kind = 'view' and e.flash),
    'flash_taps', count(*) filter (where e.kind <> 'view' and e.flash),
    'offer_views', count(*) filter (where e.kind = 'view' and e.offer),
    'offer_taps', count(*) filter (where e.kind <> 'view' and e.offer),
    'series', (
      select jsonb_agg(jsonb_build_object(
        'day', d.day::date,
        'views', coalesce(s.views, 0),
        'taps', coalesce(s.taps, 0)
      ) order by d.day)
      from generate_series(v_today - (v_days - 1), v_today, interval '1 day') as d(day)
      left join (
        select (ev.at at time zone v_tz)::date as day,
               count(*) filter (where ev.kind = 'view') as views,
               count(*) filter (where ev.kind <> 'view') as taps
        from public.item_events ev
        where ev.item_id = p_item and ev.business_id = v_biz and ev.at >= v_from
        group by 1
      ) s on s.day = d.day::date
    )
  ) into v_out
  from public.item_events e
  where e.item_id = p_item and e.business_id = v_biz and e.at >= v_from;

  return v_out;
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['seller_item_history(uuid, integer)', 'seller_item_stats(uuid, integer)'] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end $$;

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['items', 'item_history'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
