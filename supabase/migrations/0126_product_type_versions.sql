-- 0126_product_type_versions.sql
-- Product type versions (A06, B25, B28): the admin edits a draft of a type, and live items keep the published type until the
-- owner publishes it. The admin page also sets everything else a type carries: kind, quantity mode, size chart, the shop
-- categories it is restricted to, and per option the Contract v1 AxisDef fields (scale, open, optional, affectsPrice).
--
--   product_type_versions               one row per version of a type: one draft at most, and published versions numbered 1, 2, 3 ...
--   admin_check_product_type(id, type)   the one validation every write goes through; returns the whole type as stored
--   admin_save_type_draft(id, type)      owner: write the draft (a new id is fine: the type appears when it is published)
--   admin_discard_type_draft(id)         owner: drop the draft; the published type is untouched
--   admin_publish_type_version(id, note) owner: the draft becomes the live type and gets the next number
--   admin_save_product_type(id, type)    unchanged call, now takes the new fields too; a direct save is published at once
--   admin_product_types_list()           also returns kind, quantityMode, sizeChartId, restrictedTo, version, draft and the size charts

create table if not exists public.product_type_versions (
  id bigint generated always as identity primary key,
  type_id text not null,
  version integer,
  status text not null check (status in ('draft', 'published')),
  body jsonb not null check (jsonb_typeof(body) = 'object'),
  note text check (note is null or char_length(note) <= 200),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint product_type_versions_numbered check ((status = 'draft') = (version is null))
);
create unique index if not exists product_type_versions_one_draft on public.product_type_versions (type_id) where status = 'draft';
create unique index if not exists product_type_versions_number on public.product_type_versions (type_id, version) where version is not null;
-- Read and written only through the functions below.
alter table public.product_type_versions enable row level security;
revoke all on public.product_type_versions from public, anon, authenticated;

-- Options: the 0108 rules, plus the optional AxisDef fields. scale names a registered scale (shared/src/scales), open is a boolean
-- or the kind of value typed, optional is a boolean, affectsPrice is "auto" or a boolean, dependsOn names an earlier option.
create or replace function public.product_type_axes_valid(p jsonb) returns boolean
language plpgsql immutable as $$
declare
  a jsonb;
  keys text[] := '{}';
  s jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 3 then return false; end if;
  for a in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(a) <> 'object' then return false; end if;
    if coalesce(a ->> 'key', '') !~ '^[a-z][a-z0-9_]{0,29}$' or (a ->> 'key') = any(keys) then return false; end if;
    if btrim(coalesce(a ->> 'label', '')) = '' or char_length(a ->> 'label') > 40 then return false; end if;
    if coalesce(a ->> 'display', '') not in ('swatch', 'image-card', 'button', 'text-card', 'dropdown') then return false; end if;
    if a ? 'scale' and jsonb_typeof(a -> 'scale') <> 'null' and coalesce(a ->> 'scale', '') !~ '^[a-z][a-z-]{1,30}$' then return false; end if;
    -- open: true, or the kind of value sellers type ("colour", "material", "brand"), as the A24 to A28 seeds store it.
    if a ? 'open' and not (jsonb_typeof(a -> 'open') = 'boolean' or coalesce(a ->> 'open', '') ~ '^[a-z][a-z-]{1,30}$') then return false; end if;
    if a ? 'optional' and jsonb_typeof(a -> 'optional') <> 'boolean' then return false; end if;
    if a ? 'affectsPrice' and not (jsonb_typeof(a -> 'affectsPrice') = 'boolean' or a -> 'affectsPrice' = '"auto"'::jsonb) then return false; end if;
    if a ? 'dependsOn' and jsonb_typeof(a -> 'dependsOn') = 'string' and not ((a ->> 'dependsOn') = any(keys)) then return false; end if;
    if a ? 'suggested' then
      if jsonb_typeof(a -> 'suggested') <> 'array' or jsonb_array_length(a -> 'suggested') > 40 then return false; end if;
      for s in select * from jsonb_array_elements(a -> 'suggested') loop
        if jsonb_typeof(s) <> 'object' or coalesce(s ->> 'id', '') !~ '^[a-z0-9][a-z0-9-]{0,39}$' or btrim(coalesce(s ->> 'label', '')) = '' or char_length(s ->> 'label') > 40 then return false; end if;
      end loop;
    end if;
    keys := keys || (a ->> 'key');
  end loop;
  return true;
end $$;

-- A type row as the page and the versions see it.
create or replace function public.product_type_body(t public.product_types) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('name', t.name, 'kind', t.kind, 'departmentId', t.department_id, 'categoryIds', to_jsonb(coalesce(t.category_ids, '{}')),
    'restrictedTo', to_jsonb(coalesce(t.restricted_to, '{}')), 'quantityMode', t.quantity_mode, 'sizeChartId', t.size_chart_id, 'axes', t.axes, 'active', t.active)
$$;

-- Validate a type and fill in what the input leaves out from the live row (or the defaults for a new type). Raises the same
-- codes as 0108, plus invalid_kind, invalid_quantity_mode, invalid_size_chart and invalid_restricted_to.
create or replace function public.admin_check_product_type(p_id text, p_type jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_cur jsonb;
  v_name text := btrim(coalesce(p_type ->> 'name', ''));
  v_dept text := nullif(p_type ->> 'departmentId', '');
  v_cats text[];
  v_restricted text[];
  v_axes jsonb := coalesce(p_type -> 'axes', '[]'::jsonb);
  v_kind text;
  v_mode text;
  v_chart uuid;
begin
  if p_id is null or p_id !~ '^[a-z][a-z0-9-]{1,39}$' then raise exception 'invalid_type_id' using errcode = 'P0001'; end if;
  select public.product_type_body(t) into v_cur from public.product_types t where t.id = p_id;
  if v_name = '' or char_length(v_name) > 60 then raise exception 'invalid_type_name' using errcode = 'P0001'; end if;
  if v_dept is not null and not exists (select 1 from public.departments where id = v_dept) then raise exception 'invalid_department' using errcode = 'P0001'; end if;
  select coalesce(array_agg(distinct c order by c), '{}') into v_cats from jsonb_array_elements_text(coalesce(p_type -> 'categoryIds', '[]'::jsonb)) c;
  if exists (select 1 from unnest(v_cats) c where not exists (select 1 from public.categories k where k.id = c)) then raise exception 'invalid_categories' using errcode = 'P0001'; end if;
  if not public.product_type_axes_valid(v_axes) then raise exception 'invalid_axes' using errcode = 'P0001'; end if;

  v_kind := coalesce(nullif(p_type ->> 'kind', ''), v_cur ->> 'kind', 'good');
  if v_kind not in ('good', 'service', 'package') then raise exception 'invalid_kind' using errcode = 'P0001'; end if;
  v_mode := coalesce(nullif(p_type ->> 'quantityMode', ''), v_cur ->> 'quantityMode', 'units');
  if v_mode not in ('units', 'measure', 'none') then raise exception 'invalid_quantity_mode' using errcode = 'P0001'; end if;

  if p_type ? 'sizeChartId' then
    if jsonb_typeof(p_type -> 'sizeChartId') = 'null' or p_type ->> 'sizeChartId' = '' then v_chart := null;
    elsif p_type ->> 'sizeChartId' !~ '^[0-9a-f-]{36}$' or not exists (select 1 from public.size_charts where id = (p_type ->> 'sizeChartId')::uuid) then
      raise exception 'invalid_size_chart' using errcode = 'P0001';
    else v_chart := (p_type ->> 'sizeChartId')::uuid; end if;
  else
    v_chart := nullif(v_cur ->> 'sizeChartId', '')::uuid;
  end if;

  if p_type ? 'restrictedTo' then
    if jsonb_typeof(p_type -> 'restrictedTo') <> 'array' then raise exception 'invalid_restricted_to' using errcode = 'P0001'; end if;
    select coalesce(array_agg(distinct c order by c), '{}') into v_restricted from jsonb_array_elements_text(p_type -> 'restrictedTo') c;
    if exists (select 1 from unnest(v_restricted) c where c = '' or not exists (select 1 from public.categories k where k.id = c)) then
      raise exception 'invalid_restricted_to' using errcode = 'P0001';
    end if;
  else
    select coalesce(array_agg(c), '{}') into v_restricted from jsonb_array_elements_text(coalesce(v_cur -> 'restrictedTo', '[]'::jsonb)) c;
  end if;

  return jsonb_build_object('name', v_name, 'kind', v_kind, 'departmentId', v_dept, 'categoryIds', to_jsonb(v_cats), 'restrictedTo', to_jsonb(v_restricted),
    'quantityMode', v_mode, 'sizeChartId', v_chart, 'axes', v_axes, 'active', coalesce((p_type ->> 'active')::boolean, (v_cur ->> 'active')::boolean, true));
end $$;

-- Write a checked body to the live type (insert when new). Internal: callers check the owner first.
create or replace function public.apply_product_type(p_id text, p_body jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cats text[] := array(select jsonb_array_elements_text(p_body -> 'categoryIds'));
  v_restricted text[] := array(select jsonb_array_elements_text(p_body -> 'restrictedTo'));
begin
  insert into public.product_types (id, slug, name, kind, department_id, category_ids, restricted_to, quantity_mode, size_chart_id, axes, active)
  values (p_id, p_id, p_body ->> 'name', p_body ->> 'kind', p_body ->> 'departmentId', v_cats, v_restricted, p_body ->> 'quantityMode',
    nullif(p_body ->> 'sizeChartId', '')::uuid, p_body -> 'axes', (p_body ->> 'active')::boolean)
  on conflict (id) do update set name = excluded.name, kind = excluded.kind, department_id = excluded.department_id, category_ids = excluded.category_ids,
    restricted_to = excluded.restricted_to, quantity_mode = excluded.quantity_mode, size_chart_id = excluded.size_chart_id, axes = excluded.axes, active = excluded.active;
end $$;

-- The next published number of a type, recorded with its body.
create or replace function public.record_type_version(p_id text, p_body jsonb, p_note text) returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  perform pg_advisory_xact_lock(hashtext('product_type_version:' || p_id));
  select coalesce(max(version), 0) + 1 into v_n from public.product_type_versions where type_id = p_id and status = 'published';
  insert into public.product_type_versions (type_id, version, status, body, note, created_by, published_at)
  values (p_id, v_n, 'published', p_body, nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), now());
  return v_n;
end $$;

-- Every type that exists today is its own version 1.
insert into public.product_type_versions (type_id, version, status, body, note, published_at)
select t.id, 1, 'published', public.product_type_body(t), 'As it was before versions', now()
from public.product_types t
where not exists (select 1 from public.product_type_versions v where v.type_id = t.id and v.status = 'published');

create or replace function public.admin_save_type_draft(p_id text, p_type jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_body jsonb;
  v_at timestamptz := now();
begin
  if not public.has_role(array['owner']) then raise exception 'forbidden' using errcode = '42501'; end if;
  v_body := public.admin_check_product_type(p_id, p_type);
  insert into public.product_type_versions (type_id, status, body, created_by, updated_at) values (p_id, 'draft', v_body, auth.uid(), v_at)
  on conflict (type_id) where status = 'draft' do update set body = excluded.body, created_by = excluded.created_by, updated_at = excluded.updated_at;
  perform public.admin_audit_action('product_type.draft', 'product_type', p_id, null, v_body, null, null);
  return jsonb_build_object('id', p_id, 'draft', v_body, 'draftUpdatedAt', v_at);
end $$;

create or replace function public.admin_discard_type_draft(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_old jsonb;
begin
  if not public.has_role(array['owner']) then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.product_type_versions where type_id = p_id and status = 'draft' returning body into v_old;
  if v_old is null then raise exception 'no_draft' using errcode = 'P0001'; end if;
  perform public.admin_audit_action('product_type.draft_discard', 'product_type', p_id, v_old, null, null, null);
  return jsonb_build_object('id', p_id, 'draft', null);
end $$;

create or replace function public.admin_publish_type_version(p_id text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_draft public.product_type_versions;
  v_old jsonb;
  v_body jsonb;
  v_n integer;
begin
  if not public.has_role(array['owner']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_note is not null and char_length(p_note) > 200 then raise exception 'invalid_note' using errcode = 'P0001'; end if;
  select * into v_draft from public.product_type_versions where type_id = p_id and status = 'draft' for update;
  if not found then raise exception 'no_draft' using errcode = 'P0001'; end if;
  -- Checked again: a department, category or size chart may have gone since the draft was saved.
  v_body := public.admin_check_product_type(p_id, v_draft.body);
  select public.product_type_body(t) into v_old from public.product_types t where t.id = p_id;
  perform public.apply_product_type(p_id, v_body);
  delete from public.product_type_versions where id = v_draft.id;
  v_n := public.record_type_version(p_id, v_body, p_note);
  perform public.admin_audit_action('product_type.publish', 'product_type', p_id, v_old, v_body || jsonb_build_object('version', v_n), p_note, null);
  return jsonb_build_object('id', p_id, 'version', v_n, 'draft', null) || v_body;
end $$;

-- 0108's direct save, now with the new fields; it publishes at once (and leaves any draft where it is).
create or replace function public.admin_save_product_type(p_id text, p_type jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_body jsonb;
  v_n integer;
begin
  if not public.has_role(array['owner']) then raise exception 'forbidden' using errcode = '42501'; end if;
  v_body := public.admin_check_product_type(p_id, p_type);
  select public.product_type_body(t) into v_old from public.product_types t where t.id = p_id for update;
  perform public.apply_product_type(p_id, v_body);
  v_n := public.record_type_version(p_id, v_body, null);
  perform public.admin_audit_action(case when v_old is null then 'product_type.create' else 'product_type.update' end, 'product_type', p_id, v_old,
    v_body, null, null);
  return jsonb_build_object('id', p_id, 'version', v_n) || v_body;
end $$;

create or replace function public.admin_product_types_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(array['reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'types', coalesce((select jsonb_agg(jsonb_build_object('id', t.id) || public.product_type_body(t) || jsonb_build_object(
      'items', (select count(*) from public.items i where i.product_type_id = t.id),
      'version', (select max(v.version) from public.product_type_versions v where v.type_id = t.id and v.status = 'published'),
      'publishedAt', (select max(v.published_at) from public.product_type_versions v where v.type_id = t.id and v.status = 'published'),
      'draft', (select v.body from public.product_type_versions v where v.type_id = t.id and v.status = 'draft'),
      'draftUpdatedAt', (select v.updated_at from public.product_type_versions v where v.type_id = t.id and v.status = 'draft'))
      order by t.name) from public.product_types t), '[]'::jsonb),
    -- A draft of a type that is not published yet.
    'newDrafts', coalesce((select jsonb_agg(jsonb_build_object('id', v.type_id, 'draft', v.body, 'draftUpdatedAt', v.updated_at) order by v.type_id)
      from public.product_type_versions v where v.status = 'draft' and not exists (select 1 from public.product_types t where t.id = v.type_id)), '[]'::jsonb),
    'departments', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by d.name) from public.departments d), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name) from public.categories c), '[]'::jsonb),
    'sizeCharts', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name) from public.size_charts s where s.active), '[]'::jsonb));
end $$;

revoke all on function public.product_type_body(public.product_types), public.admin_check_product_type(text, jsonb), public.apply_product_type(text, jsonb),
  public.record_type_version(text, jsonb, text), public.admin_save_type_draft(text, jsonb), public.admin_discard_type_draft(text),
  public.admin_publish_type_version(text, text) from public, anon, authenticated;
grant execute on function public.admin_save_type_draft(text, jsonb), public.admin_discard_type_draft(text), public.admin_publish_type_version(text, text)
  to authenticated, service_role;
