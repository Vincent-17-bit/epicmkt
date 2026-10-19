alter table public.items
  add column if not exists tags text[] not null default '{}' check (cardinality(tags) <= 10),
  add column if not exists badge text check (badge in ('new','popular','bestseller','limited')),
  add column if not exists draft boolean not null default false,
  add column if not exists variants jsonb not null default '[]';

alter table public.items drop constraint if exists items_availability_check;
alter table public.items add constraint items_availability_check
  check (availability in ('available','limited_stock','out_of_stock','unavailable','by_appointment'));

create index if not exists items_business_draft_idx on public.items (business_id) where draft;

create or replace view public.public_items with (security_barrier = true) as
select
  i.id, i.business_id, i.name, i.description, i.section, i.price, i.price_max, i.price_type, i.unit,
  i.availability, i.sort, i.created_at,
  coalesce((select jsonb_agg(m.path order by m.sort, m.created_at) from public.item_media m where m.item_id = i.id and m.kind = 'image'), '[]'::jsonb) as image_paths
from public.items i
join public.businesses b on b.id = i.business_id
where public.business_is_visible(b) and i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin;
revoke all on public.public_items from public;
grant select on public.public_items to anon, authenticated, service_role;

create or replace function public.seller_catalog_stats(p_stale_days integer default 90) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_days integer := greatest(1, least(coalesce(p_stale_days, 90), 3650));
  v_b public.businesses;
  v_limit integer;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select * into v_b from public.businesses where id = v_id;
  select p.items_limit into v_limit from public.plans p where p.category_id = v_b.category_id and p.plan_key = v_b.plan_key;
  return (
    select jsonb_build_object(
      'total', count(*),
      'visible', count(*) filter (where i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin),
      'hidden', count(*) filter (where not i.visible),
      'hidden_by_me', count(*) filter (where not i.visible and not i.draft and not i.hidden_by_admin and not i.removed_by_admin),
      'hidden_by_admin', count(*) filter (where i.hidden_by_admin or i.removed_by_admin),
      'drafts', count(*) filter (where i.draft and not i.hidden_by_admin and not i.removed_by_admin),
      'available', count(*) filter (where i.availability = 'available'),
      'out_of_stock', count(*) filter (where i.availability = 'out_of_stock'),
      'limited_stock', count(*) filter (where i.availability = 'limited_stock'),
      'unavailable', count(*) filter (where i.availability = 'unavailable'),
      'by_appointment', count(*) filter (where i.availability = 'by_appointment'),
      'seasonal', count(*) filter (where i.season is not null),
      'coming_soon', count(*) filter (where i.available_from is not null and i.available_from > now()),
      'low_stock', count(*) filter (where i.track_stock and i.stock_count is not null and i.stock_count > 0 and i.stock_count <= i.low_stock_threshold),
      'without_photo', count(*) filter (where not exists (select 1 from public.item_media m where m.item_id = i.id and m.kind = 'image')),
      'stale_prices', count(*) filter (where i.price_type in ('fixed','from','range') and i.price is not null and i.price_confirmed_at < now() - make_interval(days => v_days)),
      'reported', count(*) filter (where exists (select 1 from public.reports r where r.item_id = i.id and r.created_at > now() - interval '30 days')),
      'flagged', count(*) filter (where exists (select 1 from public.flags f where f.item_id = i.id and f.status = 'open')),
      'items_limit', v_limit,
      'open_flags', (select count(*) from public.flags f where f.business_id = v_id and f.status = 'open'),
      'unread_messages', (select count(*) from public.messages m where m.business_id = v_id and m.read_at is null)
    ) from public.items i where i.business_id = v_id
  );
end $$;

create or replace function public.seller_catalog_items() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_b public.businesses;
  v_limit integer;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select * into v_b from public.businesses where id = v_id;
  select p.items_limit into v_limit from public.plans p where p.category_id = v_b.category_id and p.plan_key = v_b.plan_key;
  return jsonb_build_object(
    'shop', jsonb_build_object('slug', v_b.slug, 'status', v_b.status, 'live', public.business_is_visible(v_b), 'plan_key', v_b.plan_key, 'items_limit', v_limit),
    'items', coalesce((
      select jsonb_agg(to_jsonb(i) || jsonb_build_object(
        'image_paths', coalesce((select jsonb_agg(m.path order by m.sort, m.created_at) from public.item_media m where m.item_id = i.id and m.kind = 'image'), '[]'::jsonb),
        'has_video', exists (select 1 from public.item_media m where m.item_id = i.id and m.kind = 'video')
      ) order by i.sort, i.created_at, i.id)
      from public.items i where i.business_id = v_id
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.seller_scale_price(p_value numeric, p_tenths integer) returns numeric
language sql immutable as
$$ select case when p_value is null then null
  else greatest(1, floor((round(p_value * 100) * (1000 + p_tenths) + 50000) / 100000.0)) end $$;

create or replace function public.seller_bulk_items(p_action text, p_ids uuid[], p_args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_ids uuid[];
  v_n integer := 0;
  v_skipped integer := 0;
  v_tenths integer;
  v_section text;
  v_avail text;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('hide','show','delete','move_section','set_availability','price_percent','confirm_prices') then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'no_items' using errcode = 'P0001'; end if;
  if cardinality(p_ids) > 500 then raise exception 'too_many_items' using errcode = 'P0001'; end if;

  perform 1 from public.items i where i.business_id = v_id and i.id = any (p_ids) and not i.removed_by_admin order by i.id for update;
  select coalesce(array_agg(i.id order by i.id), '{}') into v_ids
    from public.items i
    where i.business_id = v_id and i.id = any (p_ids) and not i.removed_by_admin;
  v_skipped := cardinality(p_ids) - cardinality(v_ids);

  if p_action = 'hide' then
    update public.items set visible = false where id = any (v_ids) and visible;
    get diagnostics v_n = row_count;
  elsif p_action = 'show' then
    update public.items set visible = true, draft = false where id = any (v_ids) and (not visible or draft);
    get diagnostics v_n = row_count;
  elsif p_action = 'delete' then
    delete from public.items where id = any (v_ids);
    get diagnostics v_n = row_count;
  elsif p_action = 'move_section' then
    v_section := nullif(btrim(coalesce(p_args ->> 'section', '')), '');
    if v_section is not null and char_length(v_section) > 60 then raise exception 'invalid_section' using errcode = 'P0001'; end if;
    update public.items set section = v_section where id = any (v_ids) and section is distinct from v_section;
    get diagnostics v_n = row_count;
  elsif p_action = 'set_availability' then
    v_avail := p_args ->> 'availability';
    if v_avail is null or v_avail not in ('available','limited_stock','out_of_stock','unavailable','by_appointment') then
      raise exception 'invalid_availability' using errcode = 'P0001';
    end if;
    update public.items set availability = v_avail where id = any (v_ids) and availability <> v_avail;
    get diagnostics v_n = row_count;
  elsif p_action = 'price_percent' then
    begin
      v_tenths := round((p_args ->> 'percent')::numeric * 10)::integer;
    exception when others then
      raise exception 'invalid_percent' using errcode = 'P0001';
    end;
    if v_tenths = 0 or v_tenths < -900 or v_tenths > 3000 then raise exception 'invalid_percent' using errcode = 'P0001'; end if;
    if exists (
      select 1 from public.items i
      where i.id = any (v_ids) and i.price_type in ('fixed','from','range')
        and greatest(public.seller_scale_price(i.price, v_tenths), coalesce(public.seller_scale_price(i.price_max, v_tenths), 0)) > 9999999999.99
    ) then raise exception 'price_too_large' using errcode = 'P0001'; end if;
    update public.items i set
      price = public.seller_scale_price(i.price, v_tenths),
      price_max = public.seller_scale_price(i.price_max, v_tenths),
      sale_price = case
        when i.sale_price is null then null
        when public.seller_scale_price(i.sale_price, v_tenths) < public.seller_scale_price(i.price, v_tenths) then public.seller_scale_price(i.sale_price, v_tenths)
        when public.seller_scale_price(i.price, v_tenths) > 1 then public.seller_scale_price(i.price, v_tenths) - 1
        else null end
    where i.id = any (v_ids) and i.price_type in ('fixed','from','range') and i.price is not null;
    get diagnostics v_n = row_count;
    v_skipped := v_skipped + (cardinality(v_ids) - v_n);
  else
    update public.items set price_confirmed_at = now() where id = any (v_ids);
    get diagnostics v_n = row_count;
  end if;

  perform public.write_audit(v_id, 'items_bulk_' || p_action, 'item', null, jsonb_build_object('count', v_n, 'skipped', v_skipped, 'args', coalesce(p_args, '{}')));
  return jsonb_build_object('affected', v_n, 'skipped', v_skipped);
end $$;

create or replace function public.seller_reorder_items(p_ids uuid[]) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_n integer;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 1000 then raise exception 'no_items' using errcode = 'P0001'; end if;
  if exists (select 1 from public.items i where i.business_id = v_id and i.id = any (p_ids)) is false then
    raise exception 'no_items' using errcode = 'P0001';
  end if;
  update public.items i set sort = o.pos
    from (select u.id, u.ord::integer as pos from unnest(p_ids) with ordinality as u(id, ord)) o
    where i.id = o.id and i.business_id = v_id and i.sort <> o.pos;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.seller_duplicate_item(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_src public.items;
  v_new uuid;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select * into v_src from public.items where id = p_id and business_id = v_id and not removed_by_admin;
  if not found then raise exception 'item_not_found' using errcode = 'P0001'; end if;
  insert into public.items (business_id, name, description, section, price, price_max, price_type, unit, sale_price, availability, stock_count,
    track_stock, low_stock_threshold, show_stock_count, season, tags, badge, variants, visible, draft, sort)
  values (v_id, left(v_src.name, 111) || ' (copy)', v_src.description, v_src.section, v_src.price, v_src.price_max, v_src.price_type, v_src.unit,
    v_src.sale_price, v_src.availability, v_src.stock_count, v_src.track_stock, v_src.low_stock_threshold, v_src.show_stock_count, v_src.season,
    v_src.tags, v_src.badge, v_src.variants, false, true, v_src.sort + 1)
  returning id into v_new;
  return v_new;
end $$;

create or replace function public.seller_import_items(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_b public.businesses;
  r jsonb;
  v_sort integer;
  v_n integer := 0;
  v_tags text[];
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select * into v_b from public.businesses where id = v_id;
  if v_b.plan_key <> 'premium' then raise exception 'premium_required' using errcode = 'P0001'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'no_rows' using errcode = 'P0001'; end if;
  if jsonb_array_length(p_rows) > 500 then raise exception 'too_many_rows' using errcode = 'P0001'; end if;
  select coalesce(max(sort), 0) into v_sort from public.items where business_id = v_id;
  for r in select * from jsonb_array_elements(p_rows) loop
    if left(coalesce(r ->> 'name', ''), 1) in ('=','+','-','@') or left(coalesce(r ->> 'section', ''), 1) in ('=','+','-','@')
       or left(coalesce(r ->> 'unit', ''), 1) in ('=','+','-','@') then
      raise exception 'formula_rejected' using errcode = 'P0001';
    end if;
    select coalesce(array_agg(t), '{}') into v_tags from jsonb_array_elements_text(coalesce(r -> 'tags', '[]'::jsonb)) as t;
    v_sort := v_sort + 1;
    insert into public.items (business_id, name, section, price, price_max, price_type, unit, availability, tags, visible, draft, sort)
    values (v_id, btrim(r ->> 'name'), nullif(btrim(coalesce(r ->> 'section', '')), ''), (r ->> 'price')::numeric, (r ->> 'price_max')::numeric,
      coalesce(r ->> 'price_type', 'fixed'), nullif(btrim(coalesce(r ->> 'unit', '')), ''), coalesce(r ->> 'availability', 'available'), v_tags, false, true, v_sort);
    v_n := v_n + 1;
  end loop;
  perform public.write_audit(v_id, 'items_imported', 'item', null, jsonb_build_object('count', v_n));
  return jsonb_build_object('created', v_n);
end $$;

create or replace function public.seller_save_views(p_views jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v jsonb;
  v_names text[] := '{}';
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if p_views is null or jsonb_typeof(p_views) <> 'array' then raise exception 'invalid_views' using errcode = 'P0001'; end if;
  if jsonb_array_length(p_views) > 10 then raise exception 'too_many_views' using errcode = 'P0001'; end if;
  for v in select * from jsonb_array_elements(p_views) loop
    if jsonb_typeof(v) <> 'object'
       or coalesce(v ->> 'name', '') !~ '^[A-Za-z0-9][A-Za-z0-9 ._&''()-]{0,29}$'
       or coalesce(v ->> 'id', '') !~ '^[A-Za-z0-9_-]{1,36}$'
       or char_length(coalesce(v ->> 'query', '')) > 600
       or coalesce(v ->> 'query', '') ~ '[\x00-\x1f]' then
      raise exception 'invalid_view' using errcode = 'P0001';
    end if;
    if lower(v ->> 'name') = any (v_names) then raise exception 'duplicate_view' using errcode = 'P0001'; end if;
    v_names := v_names || lower(v ->> 'name');
  end loop;
  insert into public.seller_settings (business_id, settings)
    values (v_id, jsonb_build_object('saved_views', p_views))
    on conflict (business_id) do update set settings = public.seller_settings.settings || jsonb_build_object('saved_views', p_views);
  return p_views;
end $$;

create or replace function public.seller_get_views() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  return coalesce((select s.settings -> 'saved_views' from public.seller_settings s where s.business_id = v_id), '[]'::jsonb);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'seller_catalog_stats(integer)', 'seller_catalog_items()', 'seller_scale_price(numeric, integer)', 'seller_bulk_items(text, uuid[], jsonb)',
    'seller_reorder_items(uuid[])', 'seller_duplicate_item(uuid)', 'seller_import_items(jsonb)', 'seller_save_views(jsonb)', 'seller_get_views()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end $$;
