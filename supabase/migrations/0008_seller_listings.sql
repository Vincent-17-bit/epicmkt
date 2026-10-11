alter table public.items
  add column if not exists draft boolean not null default false,
  add column if not exists kind text not null default 'product',
  add column if not exists badge text,
  add column if not exists search_tags text[] not null default '{}',
  add column if not exists variants jsonb not null default '[]';

alter table public.items drop constraint if exists items_availability_check;
alter table public.items add constraint items_availability_check check (availability in (
  'available', 'limited_stock', 'out_of_stock', 'seasonal', 'by_appointment', 'coming_soon', 'unavailable'
));

create index if not exists items_business_visible_idx on public.items (business_id, visible, draft);

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
      'limited_stock', count(*) filter (where i.availability = 'limited_stock'),
      'out_of_stock', count(*) filter (where i.availability = 'out_of_stock'),
      'seasonal', count(*) filter (where i.availability = 'seasonal'),
      'by_appointment', count(*) filter (where i.availability = 'by_appointment'),
      'coming_soon', count(*) filter (where i.availability = 'coming_soon'),
      'unavailable', count(*) filter (where i.availability = 'unavailable'),
      'without_photo', count(*) filter (where not exists (select 1 from public.item_media m where m.item_id = i.id and m.kind = 'image')),
      'stale_prices', count(*) filter (where i.price_confirmed_at < now() - make_interval(days => v_days)),
      'low_stock', count(*) filter (where i.track_stock and i.stock_count is not null and i.stock_count > 0 and i.stock_count <= i.low_stock_threshold),
      'reported', count(*) filter (where exists (select 1 from public.reports r where r.item_id = i.id and r.business_id = v_id and r.created_at > now() - interval '30 days')),
      'flagged', count(*) filter (where exists (select 1 from public.flags f where f.item_id = i.id and f.business_id = v_id and f.status = 'open')),
      'items_limit', v_limit,
      'open_flags', (select count(*) from public.flags f where f.business_id = v_id and f.status = 'open'),
      'unread_messages', (select count(*) from public.messages m where m.business_id = v_id and m.read_at is null)
    ) from public.items i where i.business_id = v_id
  );
end $$;

create or replace function public.seller_bulk_items(p_action text, p_ids uuid[], p_args jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_ids uuid[];
  v_found integer;
  v_changed integer := 0;
  v_section text;
  v_avail text;
  v_pct numeric;
  v_dir text;
  v_factor numeric;
  v_rows jsonb := '[]'::jsonb;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if p_action not in ('hide', 'show', 'delete', 'move_section', 'set_availability', 'price_percent', 'confirm_prices') then
    raise exception 'invalid_action';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_ids, '{}')) as x;
  if cardinality(v_ids) = 0 or cardinality(v_ids) > 500 then raise exception 'invalid_selection'; end if;
  perform 1 from public.items i where i.business_id = v_id and i.id = any(v_ids) order by i.id for update;
  select count(*) into v_found from public.items i where i.business_id = v_id and i.id = any(v_ids);
  if v_found <> cardinality(v_ids) then raise exception 'item_not_found'; end if;

  if p_action = 'hide' then
    update public.items i set visible = false where i.business_id = v_id and i.id = any(v_ids) and not i.hidden_by_admin and not i.removed_by_admin and i.visible;
    get diagnostics v_changed = row_count;
  elsif p_action = 'show' then
    update public.items i set visible = true, draft = false where i.business_id = v_id and i.id = any(v_ids) and not i.hidden_by_admin and not i.removed_by_admin and (not i.visible or i.draft);
    get diagnostics v_changed = row_count;
  elsif p_action = 'delete' then
    delete from public.items i where i.business_id = v_id and i.id = any(v_ids) and not i.hidden_by_admin and not i.removed_by_admin;
    get diagnostics v_changed = row_count;
  elsif p_action = 'move_section' then
    v_section := nullif(regexp_replace(btrim(coalesce(p_args ->> 'section', '')), '\s+', ' ', 'g'), '');
    if v_section is not null and (char_length(v_section) > 40 or v_section ~ '^[=+@-]') then raise exception 'invalid_section'; end if;
    update public.items i set section = v_section where i.business_id = v_id and i.id = any(v_ids) and not i.hidden_by_admin and not i.removed_by_admin and i.section is distinct from v_section;
    get diagnostics v_changed = row_count;
  elsif p_action = 'set_availability' then
    v_avail := p_args ->> 'availability';
    if v_avail is null or v_avail not in ('available', 'limited_stock', 'out_of_stock', 'seasonal', 'by_appointment', 'coming_soon', 'unavailable') then
      raise exception 'invalid_availability';
    end if;
    update public.items i set availability = v_avail where i.business_id = v_id and i.id = any(v_ids) and not i.hidden_by_admin and not i.removed_by_admin and i.availability is distinct from v_avail;
    get diagnostics v_changed = row_count;
  elsif p_action = 'confirm_prices' then
    update public.items i set price_confirmed_at = now() where i.business_id = v_id and i.id = any(v_ids) and not i.hidden_by_admin and not i.removed_by_admin;
    get diagnostics v_changed = row_count;
  else
    begin
      v_pct := (p_args ->> 'percent')::numeric;
    exception when others then
      raise exception 'invalid_percent';
    end;
    v_dir := p_args ->> 'direction';
    if v_pct is null or v_pct <= 0 or v_pct > 500 or v_pct <> round(v_pct, 2) or v_dir not in ('raise', 'lower') then
      raise exception 'invalid_percent';
    end if;
    v_factor := case v_dir when 'lower' then 10000 - round(v_pct * 100) else 10000 + round(v_pct * 100) end;
    with calc as (
      select i.id, i.price, i.price_max, i.sale_price,
             floor((i.price * v_factor + 5000) / 10000) as np,
             case when i.price_max is null then null else floor((i.price_max * v_factor + 5000) / 10000) end as nm,
             case when i.sale_price is null then null else floor((i.sale_price * v_factor + 5000) / 10000) end as ns
      from public.items i
      where i.business_id = v_id and i.id = any(v_ids) and not i.hidden_by_admin and not i.removed_by_admin
        and i.price is not null and i.price_type not in ('free', 'contact')
    ), ok as (
      select * from calc where np >= 1 and (nm is null or nm > np) and (ns is null or ns < np)
    ), upd as (
      update public.items i set price = ok.np, price_max = ok.nm, sale_price = ok.ns from ok where i.id = ok.id returning i.id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', ok.id,
             'before', jsonb_build_object('price', ok.price, 'priceMax', ok.price_max, 'salePrice', ok.sale_price),
             'after', jsonb_build_object('price', ok.np, 'priceMax', ok.nm, 'salePrice', ok.ns))), '[]'::jsonb)
      into v_rows from ok join upd on upd.id = ok.id;
    v_changed := jsonb_array_length(v_rows);
  end if;

  perform public.write_audit(v_id, 'bulk_' || p_action, 'items', null, jsonb_build_object('count', v_changed, 'selected', cardinality(v_ids)));
  return jsonb_build_object('changed', v_changed, 'skipped', cardinality(v_ids) - v_changed, 'rows', v_rows);
end $$;

create or replace function public.seller_import_items(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_b public.businesses;
  v_limit integer;
  v_count integer;
  v_next integer;
  v_n integer;
  r jsonb;
  i integer := 0;
  v_name text;
  v_type text;
  v_price numeric;
  v_max numeric;
  v_unit text;
  v_avail text;
  v_section text;
  v_tags text[];
  t text;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select * into v_b from public.businesses where id = v_id for update;
  if v_b.plan_key <> 'premium' then raise exception 'premium_only'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'invalid_rows'; end if;
  v_n := jsonb_array_length(p_rows);
  if v_n > 500 then raise exception 'too_many_rows'; end if;
  perform pg_advisory_xact_lock(hashtext(v_id::text || 'items'));
  select p.items_limit into v_limit from public.plans p where p.category_id = v_b.category_id and p.plan_key = v_b.plan_key;
  select count(*), coalesce(max(sort), 0) into v_count, v_next from public.items where business_id = v_id;
  if v_limit is not null and v_count + v_n > v_limit then raise exception 'limit_reached:items'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    v_name := regexp_replace(btrim(coalesce(r ->> 'name', '')), '\s+', ' ', 'g');
    v_type := coalesce(nullif(r ->> 'price_type', ''), 'fixed');
    v_unit := nullif(regexp_replace(btrim(coalesce(r ->> 'unit', '')), '\s+', ' ', 'g'), '');
    v_avail := coalesce(nullif(r ->> 'availability', ''), 'available');
    v_section := nullif(regexp_replace(btrim(coalesce(r ->> 'section', '')), '\s+', ' ', 'g'), '');
    if char_length(v_name) < 2 or char_length(v_name) > 80 then raise exception 'invalid_row:%:name', i; end if;
    if v_type not in ('fixed', 'from', 'range', 'free', 'contact') then raise exception 'invalid_row:%:price_type', i; end if;
    if v_avail not in ('available', 'limited_stock', 'out_of_stock', 'seasonal', 'by_appointment', 'coming_soon', 'unavailable') then raise exception 'invalid_row:%:availability', i; end if;
    if v_unit is not null and char_length(v_unit) > 30 then raise exception 'invalid_row:%:unit', i; end if;
    if v_section is not null and char_length(v_section) > 40 then raise exception 'invalid_row:%:section', i; end if;
    if v_name ~ '^[=+@-]' or v_unit ~ '^[=+@-]' or v_section ~ '^[=+@-]' then raise exception 'invalid_row:%:formula', i; end if;
    v_price := null;
    v_max := null;
    if v_type in ('free', 'contact') then
      if nullif(r ->> 'price', '') is not null then raise exception 'invalid_row:%:price', i; end if;
    else
      begin
        v_price := (r ->> 'price')::numeric;
        v_max := nullif(r ->> 'price_max', '')::numeric;
      exception when others then
        raise exception 'invalid_row:%:price', i;
      end;
      if v_price is null or v_price < 0 or v_price <> trunc(v_price) then raise exception 'invalid_row:%:price', i; end if;
      if v_type = 'range' and (v_max is null or v_max <= v_price or v_max <> trunc(v_max)) then raise exception 'invalid_row:%:price_max', i; end if;
      if v_type <> 'range' and v_max is not null then raise exception 'invalid_row:%:price_max', i; end if;
    end if;
    v_tags := '{}';
    if r ? 'search_tags' and jsonb_typeof(r -> 'search_tags') = 'array' then
      select coalesce(array_agg(x), '{}') into v_tags from jsonb_array_elements_text(r -> 'search_tags') as x;
    end if;
    if cardinality(v_tags) > 15 then raise exception 'invalid_row:%:tags', i; end if;
    foreach t in array v_tags loop
      if char_length(t) > 30 or t ~ '^[=+@-]' then raise exception 'invalid_row:%:tags', i; end if;
    end loop;
    v_next := v_next + 1;
    insert into public.items (business_id, name, price_type, price, price_max, unit, availability, section, search_tags, visible, draft, sort)
    values (v_id, v_name, v_type, v_price, v_max, v_unit, v_avail, v_section, v_tags, false, true, v_next);
  end loop;

  perform public.write_audit(v_id, 'items_imported', 'items', null, jsonb_build_object('count', v_n));
  return jsonb_build_object('imported', v_n);
end $$;

create or replace function public.seller_reorder_items(p_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_total integer;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) <> (select count(distinct x) from unnest(p_ids) as x) then raise exception 'invalid_selection'; end if;
  select count(*) into v_total from public.items i where i.business_id = v_id and i.id = any(p_ids);
  if v_total <> cardinality(p_ids) then raise exception 'item_not_found'; end if;
  perform 1 from public.items i where i.business_id = v_id and i.id = any(p_ids) order by i.id for update;
  update public.items i set sort = o.pos from (select x as id, ord as pos from unnest(p_ids) with ordinality as t(x, ord)) o where i.id = o.id and i.business_id = v_id and i.sort <> o.pos;
  return v_total;
end $$;

create or replace function public.seller_save_views(p_views jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  insert into public.seller_settings (business_id, settings) values (v_id, jsonb_build_object('saved_views', coalesce(p_views, '[]'::jsonb)))
  on conflict (business_id) do update set settings = jsonb_set(public.seller_settings.settings, '{saved_views}', coalesce(p_views, '[]'::jsonb), true);
  return (select settings -> 'saved_views' from public.seller_settings where business_id = v_id);
end $$;

create or replace function public.validate_saved_views() returns trigger
language plpgsql as $$
declare
  v jsonb := new.settings -> 'saved_views';
  e jsonb;
  seen text[] := '{}';
  nm text;
begin
  if v is null then return new; end if;
  if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 10 then raise exception 'invalid_saved_views'; end if;
  for e in select * from jsonb_array_elements(v) loop
    if jsonb_typeof(e) <> 'object' or jsonb_typeof(e -> 'id') <> 'string' or jsonb_typeof(e -> 'name') <> 'string' or jsonb_typeof(e -> 'params') <> 'string' then
      raise exception 'invalid_saved_views';
    end if;
    nm := e ->> 'name';
    if char_length(e ->> 'id') > 40 or char_length(e ->> 'params') > 600 or char_length(nm) < 1 or char_length(nm) > 40
       or nm !~ '^[[:alnum:]][[:alnum:] _&''.,()/-]*$' or lower(nm) = any(seen) then
      raise exception 'invalid_saved_views';
    end if;
    seen := seen || lower(nm);
  end loop;
  return new;
end $$;
drop trigger if exists t_seller_settings_views on public.seller_settings;
create trigger t_seller_settings_views before insert or update on public.seller_settings for each row execute function public.validate_saved_views();

do $$
declare fn text;
begin
  foreach fn in array array[
    'seller_catalog_stats(integer)', 'seller_bulk_items(text, uuid[], jsonb)', 'seller_import_items(jsonb)', 'seller_reorder_items(uuid[])', 'seller_save_views(jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end $$;
