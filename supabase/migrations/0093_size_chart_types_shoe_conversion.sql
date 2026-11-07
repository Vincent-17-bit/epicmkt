-- A05: size charts attach to product types, and the shoe conversion chart becomes admin-editable data.
--
-- What A04 (0086) already gave: size_charts (library owned by admin), public_size_charts, admin_save_size_chart / admin_delete_size_chart /
-- admin_size_charts_list, items.size_chart_id and items.size_chart_override. What A08 (0091) gave: product_types with size_chart_id (the contract's
-- ProductType.sizeChartId; seller_product_types already returns it). This migration changes nothing that exists except where said:
--   * product_types.size_chart_id   gets its foreign key to size_charts (on delete restrict). A type has ONE default chart (the contract); an item can
--                                   still choose any chart (items.size_chart_id) and override its rows (items.size_chart_override).
--   * public_size_charts            gains product_type_ids (appended), worked out from product_types.size_chart_id. Existing readers are unaffected.
--   * admin_size_charts_list        gains product_type_ids the same way.
--   * admin_save_size_chart         accepts product_type_ids: it points those types at the chart (a type moves from its old chart) and releases types
--                                   that are no longer listed. An absent key changes nothing; null or [] releases every type. New error invalid_type_ids
--                                   (a type that does not exist, a repeat, or more than 20).
--   * admin_delete_size_chart       also refuses a chart that a type uses (size_chart_in_use), as it already refused one that items use.
--   * size_charts_for_type(type, category)  public read: the type's chart; when the type has none, the category's charts that no type uses.
--   * attach_default_size_charts()  points the types dress and shirt at the seeded charts when they have none (service role; safe to repeat).
--                                   Called here, and A06 calls it again after it seeds its types.
--   * shoe_conversion               ONE row, the shoe conversion chart: {adult: [{eu, uk, usM, usW, cm}], kids: [{eu, uk: null, usM: null, usW: null, cm}]}
--                                   (the shape of shared/src/scales/shoeChart.js, so A02's shoe scale reads it as it is). Only the rows are stored; the
--                                   systems and widths are fixed in code. A version number rises with every save.
--   * public_shoe_conversion        public read of the chart and its version.
--   * admin_save_shoe_conversion(chart) -> version   owner only, validated, audited. Edits do not change items: a size is stored as typed.
--   * Seeds: dress and tops (cm), shirt collar, men's shoes, women's shoes, kids clothes (age), and the default shoe conversion chart.
-- Errors (P0001): invalid_type_ids, invalid_shoe_chart, size_chart_in_use. forbidden (42501) for anyone but an owner.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Charts by product type (the link lives on product_types.size_chart_id)
-- ---------------------------------------------------------------------------------------------------------------------

alter table public.product_types drop constraint if exists product_types_size_chart_fk;
alter table public.product_types add constraint product_types_size_chart_fk foreign key (size_chart_id) references public.size_charts (id) on delete restrict;
create index if not exists product_types_size_chart_idx on public.product_types (size_chart_id) where size_chart_id is not null;

create or replace view public.public_size_charts with (security_barrier = true) as
select c.id, c.name, c.category, c.unit, c.columns, c.rows,
       coalesce((select array_agg(t.id order by t.id) from public.product_types t where t.size_chart_id = c.id and t.active), '{}'::text[]) as product_type_ids
  from public.size_charts c where c.active;
revoke all on public.public_size_charts from public;
grant select on public.public_size_charts to anon, authenticated, service_role;

create or replace function public.admin_size_charts_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.category nulls last, x.name)
    from (select c.id, c.name, c.category, c.unit, c.columns, c.rows, c.active, c.updated_at,
                 coalesce((select array_agg(t.id order by t.id) from public.product_types t where t.size_chart_id = c.id), '{}'::text[]) as product_type_ids,
                 (select count(*) from public.items i where i.size_chart_id = c.id) as items_using
            from public.size_charts c) x), '[]'::jsonb);
end $$;

create or replace function public.admin_save_size_chart(p_id uuid, p_fields jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  f jsonb := coalesce(p_fields, '{}'::jsonb);
  v_name text := btrim(coalesce(f ->> 'name', ''));
  v_category text := nullif(btrim(coalesce(f ->> 'category', '')), '');
  v_unit text := coalesce(f ->> 'unit', 'cm');
  v_active boolean := coalesce((f ->> 'active')::boolean, true);
  v_has_types boolean := f ? 'product_type_ids';
  v_types text[] := '{}';
  v_old public.size_charts;
  v_id uuid;
begin
  if not public.has_role(array['owner']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(v_name) not between 2 and 80 then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  if v_unit not in ('cm', 'in', 'mm', 'kg', 'lb', 'none') then raise exception 'invalid_unit' using errcode = 'P0001'; end if;
  if v_category is not null and not exists (select 1 from public.categories c where c.id = v_category) then raise exception 'invalid_category' using errcode = 'P0001'; end if;
  if not public.size_chart_columns_valid(f -> 'columns') or not public.size_chart_rows_valid(f -> 'rows', jsonb_array_length(f -> 'columns')) then
    raise exception 'invalid_chart' using errcode = 'P0001';
  end if;
  if v_has_types and jsonb_typeof(f -> 'product_type_ids') <> 'null' then
    if jsonb_typeof(f -> 'product_type_ids') <> 'array'
       or jsonb_array_length(f -> 'product_type_ids') > 20
       or exists (select 1 from jsonb_array_elements(f -> 'product_type_ids') e where jsonb_typeof(e) <> 'string') then
      raise exception 'invalid_type_ids' using errcode = 'P0001';
    end if;
    select coalesce(array_agg(t), '{}') into v_types from jsonb_array_elements_text(f -> 'product_type_ids') t;
    if cardinality(v_types) <> (select count(distinct t) from unnest(v_types) t)
       or exists (select 1 from unnest(v_types) t where not exists (select 1 from public.product_types pt where pt.id = t)) then
      raise exception 'invalid_type_ids' using errcode = 'P0001';
    end if;
  end if;
  begin
    if p_id is null then
      insert into public.size_charts (name, category, unit, columns, rows, active)
        values (v_name, v_category, v_unit, f -> 'columns', f -> 'rows', v_active) returning id into v_id;
      perform public.admin_audit_action('size_chart.create', 'size_chart', v_id::text, null, jsonb_build_object('name', v_name, 'category', v_category, 'product_type_ids', v_types), null, null);
    else
      select * into v_old from public.size_charts where id = p_id for update;
      if not found then raise exception 'chart_not_found' using errcode = 'P0001'; end if;
      update public.size_charts set name = v_name, category = v_category, unit = v_unit, columns = f -> 'columns', rows = f -> 'rows', active = v_active, updated_at = now() where id = p_id;
      v_id := p_id;
      perform public.admin_audit_action('size_chart.update', 'size_chart', v_id::text,
        jsonb_build_object('name', v_old.name, 'active', v_old.active),
        jsonb_build_object('name', v_name, 'active', v_active, 'product_type_ids', case when v_has_types then to_jsonb(v_types) else null end), null, null);
    end if;
  exception when unique_violation then
    raise exception 'duplicate_chart' using errcode = 'P0001';
  end;
  if v_has_types then
    update public.product_types set size_chart_id = null where size_chart_id = v_id and not (id = any (v_types));
    update public.product_types set size_chart_id = v_id where id = any (v_types) and size_chart_id is distinct from v_id;
  end if;
  return v_id;
end $$;

create or replace function public.admin_delete_size_chart(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old public.size_charts;
begin
  if not public.has_role(array['owner']) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_old from public.size_charts where id = p_id for update;
  if not found then raise exception 'chart_not_found' using errcode = 'P0001'; end if;
  if exists (select 1 from public.items i where i.size_chart_id = p_id) or exists (select 1 from public.product_types t where t.size_chart_id = p_id) then
    raise exception 'size_chart_in_use' using errcode = 'P0001';
  end if;
  delete from public.size_charts where id = p_id;
  perform public.admin_audit_action('size_chart.delete', 'size_chart', p_id::text, jsonb_build_object('name', v_old.name), null, null, null);
end $$;
revoke all on function public.admin_size_charts_list(), public.admin_save_size_chart(uuid, jsonb), public.admin_delete_size_chart(uuid) from public, anon;
grant execute on function public.admin_size_charts_list(), public.admin_save_size_chart(uuid, jsonb), public.admin_delete_size_chart(uuid) to authenticated, service_role;

-- The charts a buyer can be shown for a product type: the type's own chart. When the type has none (or the chart is switched off), the charts of the
-- shop's category that no type uses.
create or replace function public.size_charts_for_type(p_type text, p_category text default null) returns jsonb
language sql stable set search_path = public as $$
  with own as (
    select c.* from public.public_size_charts c where c.id = (select t.size_chart_id from public.product_types t where t.id = p_type and t.active)
  ), picked as (
    select * from own
    union all
    select c.* from public.public_size_charts c
     where not exists (select 1 from own) and p_category is not null and c.category = p_category and cardinality(c.product_type_ids) = 0
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'category', x.category, 'unit', x.unit, 'columns', x.columns, 'rows', x.rows, 'product_type_ids', to_jsonb(x.product_type_ids)) order by x.name), '[]'::jsonb)
    from picked x
$$;
revoke all on function public.size_charts_for_type(text, text) from public;
grant execute on function public.size_charts_for_type(text, text) to anon, authenticated, service_role;

-- Default charts for the types that have none yet. A06 calls this after it seeds its types; it is safe to call again.
create or replace function public.attach_default_size_charts() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  update public.product_types t set size_chart_id = c.id
    from (values ('dress', 'Dresses and tops (cm)'), ('shirt', 'Shirt collar')) as m (type_id, chart_name)
    join public.size_charts c on c.category is null and lower(btrim(c.name)) = lower(m.chart_name)
   where t.id = m.type_id and t.size_chart_id is null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.attach_default_size_charts() from public, anon, authenticated;
grant execute on function public.attach_default_size_charts() to service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Shoe conversion chart (one row, admin-editable)
-- ---------------------------------------------------------------------------------------------------------------------

-- Rows of one set. adult: every size is needed. kids: EU and cm are needed, the other sizes may be null.
-- EU and cm rise row to row, and so does every other size that is filled in.
create or replace function public.shoe_chart_rows_valid(p jsonb, p_adult boolean) returns boolean
language plpgsql immutable parallel safe as $$
declare
  r jsonb;
  k text;
  v numeric;
  v_last jsonb := '{}'::jsonb;
  v_n integer;
begin
  if p is null or jsonb_typeof(p) <> 'array' then return false; end if;
  v_n := jsonb_array_length(p);
  if v_n > 60 or (p_adult and v_n < 2) then return false; end if;
  for r in select jsonb_array_elements(p) loop
    if jsonb_typeof(r) <> 'object' then return false; end if;
    if exists (select 1 from jsonb_object_keys(r) key where key not in ('eu', 'uk', 'usM', 'usW', 'cm')) then return false; end if;
    foreach k in array array['eu', 'uk', 'usM', 'usW', 'cm'] loop
      if not (r ? k) or jsonb_typeof(r -> k) = 'null' then
        if p_adult or k in ('eu', 'cm') then return false; end if;
        continue;
      end if;
      if jsonb_typeof(r -> k) <> 'number' then return false; end if;
      v := (r ->> k)::numeric;
      if k = 'eu' and v not between 10 and 60 then return false; end if;
      if k = 'cm' and v not between 8 and 40 then return false; end if;
      if k in ('uk', 'usM', 'usW') and v not between 0 and 25 then return false; end if;
      if v_last ? k and v <= (v_last ->> k)::numeric then return false; end if;
      v_last := v_last || jsonb_build_object(k, v);
    end loop;
  end loop;
  return true;
end $$;

create or replace function public.shoe_chart_valid(p jsonb) returns boolean
language plpgsql immutable parallel safe as $$
declare
  v_kids_cm numeric;
  v_kids_eu numeric;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  if exists (select 1 from jsonb_object_keys(p) key where key not in ('adult', 'kids')) then return false; end if;
  if not public.shoe_chart_rows_valid(p -> 'adult', true) or not public.shoe_chart_rows_valid(coalesce(p -> 'kids', '[]'::jsonb), false) then return false; end if;
  if jsonb_array_length(coalesce(p -> 'kids', '[]'::jsonb)) > 0 then
    v_kids_cm := (p -> 'kids' -> (jsonb_array_length(p -> 'kids') - 1) ->> 'cm')::numeric;
    v_kids_eu := (p -> 'kids' -> (jsonb_array_length(p -> 'kids') - 1) ->> 'eu')::numeric;
    if v_kids_cm >= (p -> 'adult' -> 0 ->> 'cm')::numeric or v_kids_eu >= (p -> 'adult' -> 0 ->> 'eu')::numeric then return false; end if;
  end if;
  return true;
end $$;
revoke all on function public.shoe_chart_rows_valid(jsonb, boolean), public.shoe_chart_valid(jsonb) from public;
grant execute on function public.shoe_chart_rows_valid(jsonb, boolean), public.shoe_chart_valid(jsonb) to anon, authenticated, service_role;

create table if not exists public.shoe_conversion (
  id text primary key default 'default' check (id = 'default'),
  chart jsonb not null check (public.shoe_chart_valid(chart)),
  version integer not null default 1 check (version >= 1),
  updated_at timestamptz not null default now()
);
alter table public.shoe_conversion enable row level security;
drop policy if exists "admin reads shoe_conversion" on public.shoe_conversion;
create policy "admin reads shoe_conversion" on public.shoe_conversion for select to authenticated using (public.is_admin());
revoke all on public.shoe_conversion from public, anon, authenticated;
grant select on public.shoe_conversion to authenticated;
grant all on public.shoe_conversion to service_role;

create or replace view public.public_shoe_conversion with (security_barrier = true) as
select s.chart, s.version, s.updated_at from public.shoe_conversion s where s.id = 'default';
revoke all on public.public_shoe_conversion from public;
grant select on public.public_shoe_conversion to anon, authenticated, service_role;

create or replace function public.admin_save_shoe_conversion(p_chart jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_old public.shoe_conversion;
  v_version integer;
begin
  if not public.has_role(array['owner']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not public.shoe_chart_valid(p_chart) then raise exception 'invalid_shoe_chart' using errcode = 'P0001'; end if;
  select * into v_old from public.shoe_conversion where id = 'default' for update;
  if not found then
    insert into public.shoe_conversion (id, chart) values ('default', p_chart) returning version into v_version;
    perform public.admin_audit_action('shoe_conversion.create', 'shoe_conversion', 'default', null, jsonb_build_object('version', v_version), null, null);
  else
    update public.shoe_conversion set chart = p_chart, version = v_old.version + 1, updated_at = now() where id = 'default' returning version into v_version;
    perform public.admin_audit_action('shoe_conversion.update', 'shoe_conversion', 'default', jsonb_build_object('version', v_old.version), jsonb_build_object('version', v_version), null, null);
  end if;
  return v_version;
end $$;
revoke all on function public.admin_save_shoe_conversion(jsonb) from public, anon;
grant execute on function public.admin_save_shoe_conversion(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Seeds (shared/src/sizeCharts.js SEED_SIZE_CHARTS and shared/src/scales/shoeChart.js; a test keeps them equal)
-- ---------------------------------------------------------------------------------------------------------------------

insert into public.shoe_conversion (id, chart) values ('default', $j${"adult":[{"eu":35,"uk":2.5,"usM":3.5,"usW":4.5,"cm":22.1},{"eu":36,"uk":3.5,"usM":4.5,"usW":5.5,"cm":22.7},{"eu":37,"uk":4,"usM":5,"usW":6,"cm":23.4},{"eu":38,"uk":5,"usM":6,"usW":7,"cm":24.1},{"eu":39,"uk":6,"usM":7,"usW":8,"cm":24.7},{"eu":40,"uk":6.5,"usM":7.5,"usW":8.5,"cm":25.4},{"eu":41,"uk":7.5,"usM":8.5,"usW":9.5,"cm":26.1},{"eu":42,"uk":8,"usM":9,"usW":10,"cm":26.7},{"eu":43,"uk":9,"usM":10,"usW":11,"cm":27.4},{"eu":44,"uk":9.5,"usM":10.5,"usW":11.5,"cm":28.1},{"eu":45,"uk":10.5,"usM":11.5,"usW":12.5,"cm":28.7},{"eu":46,"uk":11,"usM":12,"usW":13,"cm":29.4},{"eu":47,"uk":12,"usM":13,"usW":14,"cm":30.1},{"eu":48,"uk":12.5,"usM":13.5,"usW":14.5,"cm":30.7}],"kids":[{"eu":19,"uk":null,"usM":null,"usW":null,"cm":11.4},{"eu":20,"uk":null,"usM":null,"usW":null,"cm":12.1},{"eu":21,"uk":null,"usM":null,"usW":null,"cm":12.7},{"eu":22,"uk":null,"usM":null,"usW":null,"cm":13.4},{"eu":23,"uk":null,"usM":null,"usW":null,"cm":14.1},{"eu":24,"uk":null,"usM":null,"usW":null,"cm":14.7},{"eu":25,"uk":null,"usM":null,"usW":null,"cm":15.4},{"eu":26,"uk":null,"usM":null,"usW":null,"cm":16.1},{"eu":27,"uk":null,"usM":null,"usW":null,"cm":16.7},{"eu":28,"uk":null,"usM":null,"usW":null,"cm":17.4},{"eu":29,"uk":null,"usM":null,"usW":null,"cm":18.1},{"eu":30,"uk":null,"usM":null,"usW":null,"cm":18.7},{"eu":31,"uk":null,"usM":null,"usW":null,"cm":19.4},{"eu":32,"uk":null,"usM":null,"usW":null,"cm":20.1},{"eu":33,"uk":null,"usM":null,"usW":null,"cm":20.7},{"eu":34,"uk":null,"usM":null,"usW":null,"cm":21.4}]}$j$::jsonb) on conflict do nothing;

insert into public.size_charts (name, category, unit, columns, rows)
values ('Dresses and tops (cm)', null, 'cm', $j$["Size","Bust","Waist","Hip"]$j$::jsonb, $j$[["XS","80","62","88"],["S","84","66","92"],["M","90","72","98"],["L","96","78","104"],["XL","102","84","110"]]$j$::jsonb)
on conflict do nothing;
insert into public.size_charts (name, category, unit, columns, rows)
values ('Shirt collar', null, 'in', $j$["Collar (in)","Collar (cm)","Shirt size"]$j$::jsonb, $j$[["14","35.6","S"],["14.5","36.8","S"],["15","38.1","M"],["15.5","39.4","M"],["16","40.6","L"],["16.5","41.9","L"],["17","43.2","XL"],["17.5","44.5","XL"],["18","45.7","2XL"]]$j$::jsonb)
on conflict do nothing;
insert into public.size_charts (name, category, unit, columns, rows)
values ('Men''s shoes', null, 'cm', $j$["EU","UK","US men","Foot length (cm)"]$j$::jsonb, $j$[["35","2.5","3.5","22.1"],["36","3.5","4.5","22.7"],["37","4","5","23.4"],["38","5","6","24.1"],["39","6","7","24.7"],["40","6.5","7.5","25.4"],["41","7.5","8.5","26.1"],["42","8","9","26.7"],["43","9","10","27.4"],["44","9.5","10.5","28.1"],["45","10.5","11.5","28.7"],["46","11","12","29.4"],["47","12","13","30.1"],["48","12.5","13.5","30.7"]]$j$::jsonb)
on conflict do nothing;
insert into public.size_charts (name, category, unit, columns, rows)
values ('Women''s shoes', null, 'cm', $j$["EU","UK","US women","Foot length (cm)"]$j$::jsonb, $j$[["35","2.5","4.5","22.1"],["36","3.5","5.5","22.7"],["37","4","6","23.4"],["38","5","7","24.1"],["39","6","8","24.7"],["40","6.5","8.5","25.4"],["41","7.5","9.5","26.1"],["42","8","10","26.7"],["43","9","11","27.4"],["44","9.5","11.5","28.1"],["45","10.5","12.5","28.7"],["46","11","13","29.4"],["47","12","14","30.1"],["48","12.5","14.5","30.7"]]$j$::jsonb)
on conflict do nothing;
insert into public.size_charts (name, category, unit, columns, rows)
values ('Kids clothes (age)', null, 'cm', $j$["Age","Height","Chest","Waist"]$j$::jsonb, $j$[["2-3 years","98","53","52"],["3-4 years","104","55","53"],["4-5 years","110","57","54"],["5-6 years","116","60","55"],["6-7 years","122","63","56"],["7-8 years","128","66","58"],["8-9 years","134","69","59"],["9-10 years","140","72","61"]]$j$::jsonb)
on conflict do nothing;

select public.attach_default_size_charts();
