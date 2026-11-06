-- 0090_option_values.sql
-- The open values dictionary (A18): typed material, colour, brand, finish and flavour shared by every shop.
--
--   * option_values            one row per value. `key` is the canonical form (normalize_value_key), so "Samsung", "SAMSUNG" and
--                              " samsung " are one row and one filter choice. kind: material | color | brand | finish | flavour.
--                              status: pending (typed by a seller, usable at once, shown as typed, waiting for review) | approved | merged
--                              (folded into another value; `merged_into` always points at a value that is not merged, never a chain).
--                              `tags` e.g. precious-metal; `hex` only for colours.
--   * item_option_value_uses   which items use which value, and where: slot 'brand' (items.brand), 'spec' (a row of items.specs or of a
--                              variant's specs) or 'axis' (the label of an option value in items.option_axes). This is what lets a
--                              rename or a merge find every item that uses a value and rewrite its text. Items with no rows here are
--                              untouched, so items with no dictionary value behave exactly as before.
--   * normalize_value_key(text)  the SQL twin of normalizeValueKey in shared/src/openValues.js (rules are written there; the db test runs
--                              one table of cases through both).
--   * seller_option_values(kind, query, limit)  type-ahead: "Mahog" -> Mahogany, Mahogany veneer; says whether Add "<typed>" is offered.
--   * seller_add_option_value(kind, label, hex)  usable at once; an existing value (same key, merged ones followed) is returned instead.
--   * seller_link_item_values(item, uses)        replaces the dictionary links of one of the seller's items.
--   * public_option_value_filter(kind)           the buyer's filter choices: one row per value, with how many live items use it.
--   * admin_option_values / admin_approve_option_value / admin_update_option_value / admin_rename_option_value /
--     admin_merge_option_value                   the review queue. Rename and merge rewrite the text on every item that uses the value.
-- No existing function or table is changed. seller_save_item is not touched: the app calls seller_link_item_values after a save.
-- TODO(contract:A01): once items store typed spec rows and option values with a valueId, point the rewrites at those and drop the text match.
-- Never edit this file once applied.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Canonical key
-- ---------------------------------------------------------------------------------------------------------------------

-- Same rules, same order as normalizeValueKey: NFKD, drop accents, NFC, lower case, drop apostrophes, "&" -> and, runs of spaces and
-- punctuation -> one space, trim. Letters outside a-z pass through.
create or replace function public.normalize_value_key(p text) returns text
language sql immutable parallel safe as
$$
  select btrim(regexp_replace(
    replace(
      regexp_replace(
        lower(normalize(regexp_replace(normalize(coalesce(p, ''), NFKD), '[̀-ͯ]', '', 'g'), NFC)),
        '[''‘’ʼ`´]', '', 'g'),
      '&', ' and '),
    '[[:space:]!"#$%()*+,./:;<=>?@\[\\\]^_{|}~‐-―…·• 　-]+', ' ', 'g'))
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------------------------------------------------

create table if not exists public.option_values (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('material', 'color', 'brand', 'finish', 'flavour')),
  key text not null check (key <> '' and key = public.normalize_value_key(key)),
  label text not null check (btrim(label) <> '' and char_length(label) <= 60),
  status text not null default 'pending' check (status in ('pending', 'approved', 'merged')),
  tags text[] not null default '{}' check (cardinality(tags) <= 8),
  hex text check (hex ~ '^#[0-9a-f]{6}$'),
  merged_into uuid references public.option_values (id),
  created_by_business uuid references public.businesses (id) on delete set null,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'merged') = (merged_into is not null)),
  check (merged_into is distinct from id),
  check (hex is null or kind = 'color')
);

-- One live value per kind and key. A merged row keeps its key so a seller who types the old spelling lands on the target.
create unique index if not exists option_values_live_key on public.option_values (kind, key) where status <> 'merged';
create index if not exists option_values_key_lookup on public.option_values (kind, key text_pattern_ops);
create index if not exists option_values_queue on public.option_values (status, created_at);
create index if not exists option_values_merged_into on public.option_values (merged_into) where merged_into is not null;

create table if not exists public.item_option_value_uses (
  item_id uuid not null references public.items (id) on delete cascade,
  slot text not null check (slot in ('brand', 'spec', 'axis')),
  value_id uuid not null references public.option_values (id),
  primary key (item_id, slot, value_id)
);
create index if not exists item_option_value_uses_value on public.item_option_value_uses (value_id);

drop trigger if exists t_option_values_touch on public.option_values;
create trigger t_option_values_touch before update on public.option_values for each row execute function public.touch_updated_at();

-- Everything goes through the functions below (security definer). Browser roles read and write nothing directly.
alter table public.option_values enable row level security;
alter table public.item_option_value_uses enable row level security;
revoke all on public.option_values, public.item_option_value_uses from public, anon, authenticated;
grant all on public.option_values, public.item_option_value_uses to service_role;
drop policy if exists "admin read option_values" on public.option_values;
create policy "admin read option_values" on public.option_values for select to authenticated using (public.is_admin());
grant select on public.option_values to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Helpers (not callable from the browser)
-- ---------------------------------------------------------------------------------------------------------------------

-- The live value for a typed label: the value with that key, or the target of a merged one. null when there is none.
create or replace function public.option_value_resolve(p_kind text, p_key text) returns public.option_values
language plpgsql stable security definer set search_path = public as $$
declare
  v public.option_values;
begin
  select * into v from public.option_values where kind = p_kind and key = p_key and status <> 'merged';
  if found then return v; end if;
  select t.* into v from public.option_values m join public.option_values t on t.id = m.merged_into
   where m.kind = p_kind and m.key = p_key and m.status = 'merged' order by m.updated_at desc limit 1;
  if found then return v; end if;
  return null;
end $$;

create or replace function public.option_value_json(v public.option_values) returns jsonb
language sql immutable as
$$ select jsonb_build_object('id', v.id, 'kind', v.kind, 'label', v.label, 'key', v.key, 'status', v.status, 'hex', v.hex, 'tags', to_jsonb(v.tags)) $$;

-- Rewrites, on one item, every spec row whose value has key p_old_key to p_label. Returns true when something changed.
create or replace function public.option_value_rewrite_specs(p jsonb, p_old_key text, p_label text) returns jsonb
language sql immutable as
$$
  select coalesce(jsonb_agg(case when public.normalize_value_key(e ->> 'value') = p_old_key then e || jsonb_build_object('value', p_label) else e end order by n), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p, '[]'::jsonb)) with ordinality as x(e, n)
$$;

-- Same for the label of every option value in the axes; the value id (used in variant combinations) is never changed.
create or replace function public.option_value_rewrite_axes(p jsonb, p_old_key text, p_label text, p_hex text) returns jsonb
language sql immutable as
$$
  select coalesce(jsonb_agg(a.e || jsonb_build_object('values', (
    select coalesce(jsonb_agg(case when public.normalize_value_key(v.e ->> 'label') = p_old_key
                                   then (v.e || jsonb_build_object('label', p_label)) || case when p_hex is not null and v.e ? 'color' then jsonb_build_object('color', p_hex) else '{}'::jsonb end
                                   else v.e end order by v.n), '[]'::jsonb)
    from jsonb_array_elements(a.e -> 'values') with ordinality as v(e, n))) order by a.n), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p, '[]'::jsonb)) with ordinality as a(e, n)
$$;

-- Makes every item that uses value p_from show p_to's label and (when p_from == p_to, a rename) keeps the links. p_old_key is the key the
-- items' text currently has. Links are moved to p_to first, dropping the ones an item already has on p_to.
create or replace function public.option_value_apply_to_items(p_from uuid, p_to uuid, p_old_key text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  t public.option_values;
  v_n integer := 0;
  r record;
begin
  select * into t from public.option_values where id = p_to;
  if p_from <> p_to then
    delete from public.item_option_value_uses u where u.value_id = p_from
      and exists (select 1 from public.item_option_value_uses o where o.item_id = u.item_id and o.slot = u.slot and o.value_id = p_to);
    update public.item_option_value_uses set value_id = p_to where value_id = p_from;
  end if;
  for r in select distinct item_id from public.item_option_value_uses where value_id = p_to loop
    if exists (select 1 from public.item_option_value_uses where item_id = r.item_id and value_id = p_to and slot = 'brand') then
      update public.items set brand = t.label where id = r.item_id and brand is distinct from t.label and public.normalize_value_key(brand) = p_old_key;
    end if;
    if exists (select 1 from public.item_option_value_uses where item_id = r.item_id and value_id = p_to and slot = 'spec') then
      update public.items set specs = public.option_value_rewrite_specs(specs, p_old_key, t.label)
       where id = r.item_id and specs is distinct from public.option_value_rewrite_specs(specs, p_old_key, t.label);
      update public.item_variants set specs = public.option_value_rewrite_specs(specs, p_old_key, t.label)
       where item_id = r.item_id and specs is distinct from public.option_value_rewrite_specs(specs, p_old_key, t.label);
    end if;
    if exists (select 1 from public.item_option_value_uses where item_id = r.item_id and value_id = p_to and slot = 'axis') then
      update public.items set option_axes = public.option_value_rewrite_axes(option_axes, p_old_key, t.label, t.hex)
       where id = r.item_id and option_axes is distinct from public.option_value_rewrite_axes(option_axes, p_old_key, t.label, t.hex);
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

revoke all on function public.option_value_resolve(text, text), public.option_value_json(public.option_values),
  public.option_value_rewrite_specs(jsonb, text, text), public.option_value_rewrite_axes(jsonb, text, text, text),
  public.option_value_apply_to_items(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.option_value_resolve(text, text), public.option_value_json(public.option_values),
  public.option_value_rewrite_specs(jsonb, text, text), public.option_value_rewrite_axes(jsonb, text, text, text),
  public.option_value_apply_to_items(uuid, uuid, text) to service_role;
revoke all on function public.normalize_value_key(text) from public;
grant execute on function public.normalize_value_key(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Seller functions
-- ---------------------------------------------------------------------------------------------------------------------

-- Type-ahead. { kind, query, matches: [{id,kind,label,key,status,hex,tags,uses}], canAdd, addLabel }.
-- "Mahog" -> Mahogany, Mahogany veneer. An empty query lists the most used values. Merged values are never listed: a merged spelling
-- that is typed in full answers with its target. canAdd is true when the query is a valid value and no value has exactly that key.
create or replace function public.seller_option_values(p_kind text, p_query text default '', p_limit integer default 8) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_biz uuid := public.my_business_id();
  v_label text := left(regexp_replace(btrim(coalesce(p_query, '')), '[[:space:]]+', ' ', 'g'), 200);
  v_key text := public.normalize_value_key(v_label);
  v_limit integer := least(greatest(coalesce(p_limit, 8), 1), 20);
  v_exact public.option_values;
  v_matches jsonb;
begin
  perform public.assert_seller_active();
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if p_kind is null or p_kind <> all (array['material', 'color', 'brand', 'finish', 'flavour']) then raise exception 'invalid_kind' using errcode = 'P0001'; end if;
  v_exact := case when v_key = '' then null else public.option_value_resolve(p_kind, v_key) end;
  select coalesce(jsonb_agg(m.j order by m.rank, m.approved desc, m.uses desc, m.label), '[]'::jsonb) into v_matches
  from (
    select public.option_value_json(v) || jsonb_build_object('uses', (select count(*) from public.item_option_value_uses u where u.value_id = v.id)) as j,
           v.label,
           (select count(*) from public.item_option_value_uses u where u.value_id = v.id) as uses,
           case when v.key = v_key then 0 when v.key like v_key || '%' then 1 else 2 end as rank,
           (v.status = 'approved') as approved
    from public.option_values v
    where v.kind = p_kind and v.status <> 'merged'
      and (v_key = '' or v.key like v_key || '%' or v.key like '% ' || v_key || '%')
    order by 4, 5 desc, 3 desc, v.label
    limit v_limit
  ) m;
  -- A merged spelling typed in full is answered with its target, listed first.
  if v_exact.id is not null and not exists (select 1 from jsonb_array_elements(v_matches) x where x ->> 'id' = v_exact.id::text) then
    v_matches := jsonb_build_array(public.option_value_json(v_exact) || jsonb_build_object('uses', (select count(*) from public.item_option_value_uses u where u.value_id = v_exact.id))) || v_matches;
  end if;
  return jsonb_build_object('kind', p_kind, 'query', v_label, 'matches', v_matches,
    'canAdd', v_key <> '' and char_length(v_label) <= 60 and v_exact.id is null,
    'addLabel', case when v_key <> '' and char_length(v_label) <= 60 and v_exact.id is null then v_label end);
end $$;

-- Adds a value so it can be used straight away. If the key is already known (a merged spelling follows its target) that value is
-- returned and nothing is created. A new value is pending, keeps the seller's spelling, and shows up in the admin queue.
-- Returns { created, value }. A shade (hex) is accepted for colours only and is stored lower case.
create or replace function public.seller_add_option_value(p_kind text, p_label text, p_hex text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_biz uuid := public.my_business_id();
  v_label text := regexp_replace(btrim(coalesce(p_label, '')), '[[:space:]]+', ' ', 'g');
  v_key text := public.normalize_value_key(v_label);
  v_hex text := nullif(lower(btrim(coalesce(p_hex, ''))), '');
  v public.option_values;
begin
  perform public.assert_seller_active();
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if p_kind is null or p_kind <> all (array['material', 'color', 'brand', 'finish', 'flavour']) then raise exception 'invalid_kind' using errcode = 'P0001'; end if;
  if v_key = '' then raise exception 'invalid_label' using errcode = 'P0001'; end if;
  if char_length(v_label) > 60 then raise exception 'label_too_long' using errcode = 'P0001'; end if;
  if v_hex is not null and (p_kind <> 'color' or v_hex !~ '^#[0-9a-f]{6}$') then raise exception 'invalid_hex' using errcode = 'P0001'; end if;
  v := public.option_value_resolve(p_kind, v_key);
  if v.id is not null then
    return jsonb_build_object('created', false, 'value', public.option_value_json(v));
  end if;
  -- A shop cannot flood the review queue.
  if (select count(*) from public.option_values where created_by_business = v_biz and status = 'pending') >= 50 then
    raise exception 'too_many_pending' using errcode = 'P0001';
  end if;
  begin
    insert into public.option_values (kind, key, label, status, hex, created_by_business) values (p_kind, v_key, v_label, 'pending', v_hex, v_biz) returning * into v;
  exception when unique_violation then   -- two sellers typed it at the same moment
    v := public.option_value_resolve(p_kind, v_key);
    return jsonb_build_object('created', false, 'value', public.option_value_json(v));
  end;
  return jsonb_build_object('created', true, 'value', public.option_value_json(v));
end $$;

-- Replaces the dictionary links of one of the seller's items. p_uses: [{ "slot": "brand"|"spec"|"axis", "valueId": uuid }].
-- Only values that are not merged can be linked (a merged id is followed to its target). The item text itself is saved by seller_save_item.
create or replace function public.seller_link_item_values(p_item uuid, p_uses jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_biz uuid := public.my_business_id();
  e jsonb;
  v public.option_values;
  v_n integer := 0;
begin
  perform public.assert_seller_active();
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if not exists (select 1 from public.items where id = p_item and business_id = v_biz and not removed_by_admin) then raise exception 'item_not_found' using errcode = 'P0001'; end if;
  if p_uses is null or jsonb_typeof(p_uses) <> 'array' or jsonb_array_length(p_uses) > 120 then raise exception 'invalid_uses' using errcode = 'P0001'; end if;
  delete from public.item_option_value_uses where item_id = p_item;
  for e in select jsonb_array_elements(p_uses) loop
    if jsonb_typeof(e) <> 'object' or e ->> 'slot' is null or (e ->> 'slot') <> all (array['brand', 'spec', 'axis'])
       or not public.option_uuid_ok(e -> 'valueId') then raise exception 'invalid_uses' using errcode = 'P0001'; end if;
    select * into v from public.option_values where id = (e ->> 'valueId')::uuid;
    if not found then raise exception 'value_not_found' using errcode = 'P0001'; end if;
    if v.status = 'merged' then select * into v from public.option_values where id = v.merged_into; end if;
    insert into public.item_option_value_uses (item_id, slot, value_id) values (p_item, e ->> 'slot', v.id) on conflict do nothing;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. Public filter choices
-- ---------------------------------------------------------------------------------------------------------------------

-- One row per value for a filter list: "Samsung", "SAMSUNG" and "samsung" are one value, so one choice. Counts items that are public now.
create or replace function public.public_option_value_filter(p_kind text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'label', x.label, 'key', x.key, 'hex', x.hex, 'count', x.n) order by x.n desc, x.label), '[]'::jsonb)
  from (
    select v.id, v.label, v.key, v.hex, count(distinct u.item_id) as n
    from public.option_values v
    join public.item_option_value_uses u on u.value_id = v.id
    join public.public_items pi on pi.id = u.item_id
    where v.kind = p_kind and v.status <> 'merged'
    group by v.id
  ) x
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. Admin review
-- ---------------------------------------------------------------------------------------------------------------------

create or replace function public.admin_option_values(p_status text default null, p_kind text default null, p_query text default '', p_limit integer default 50, p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_key text := public.normalize_value_key(p_query);
begin
  if not public.has_role(array['reviewer']) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'total', (select count(*) from public.option_values v where (p_status is null or v.status = p_status) and (p_kind is null or v.kind = p_kind) and (v_key = '' or v.key like '%' || v_key || '%')),
    'values', coalesce((
      select jsonb_agg(public.option_value_json(v) || jsonb_build_object(
        'uses', (select count(distinct u.item_id) from public.item_option_value_uses u where u.value_id = v.id),
        'mergedInto', v.merged_into, 'createdByBusiness', v.created_by_business, 'createdAt', v.created_at, 'reviewedAt', v.reviewed_at) order by v.created_at desc, v.label)
      from (select * from public.option_values w where (p_status is null or w.status = p_status) and (p_kind is null or w.kind = p_kind) and (v_key = '' or w.key like '%' || v_key || '%')
            order by w.created_at desc, w.label limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)) v), '[]'::jsonb));
end $$;

-- Change tags and/or the shade of a value without touching its status. p_fields: { tags: [text], hex: "#rrggbb" | null }; absent keys stay.
create or replace function public.admin_update_option_value(p_id uuid, p_fields jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f jsonb := coalesce(p_fields, '{}'::jsonb);
  v public.option_values;
  v_tags text[];
  v_hex text;
begin
  if not public.has_role(array['reviewer']) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v from public.option_values where id = p_id for update;
  if not found then raise exception 'value_not_found' using errcode = 'P0001'; end if;
  if v.status = 'merged' then raise exception 'value_merged' using errcode = 'P0001'; end if;
  v_tags := v.tags;
  v_hex := v.hex;
  if f ? 'tags' then
    if jsonb_typeof(f -> 'tags') <> 'array' or jsonb_array_length(f -> 'tags') > 8 then raise exception 'invalid_tags' using errcode = 'P0001'; end if;
    select coalesce(array_agg(distinct t order by t), '{}') into v_tags from (
      select regexp_replace(public.normalize_value_key(x), ' ', '-', 'g') as t from jsonb_array_elements_text(f -> 'tags') x) q;
    if exists (select 1 from unnest(v_tags) t where t = '' or char_length(t) > 30) then raise exception 'invalid_tags' using errcode = 'P0001'; end if;
  end if;
  if f ? 'hex' then
    v_hex := nullif(lower(btrim(coalesce(f ->> 'hex', ''))), '');
    if v_hex is not null and (v.kind <> 'color' or v_hex !~ '^#[0-9a-f]{6}$') then raise exception 'invalid_hex' using errcode = 'P0001'; end if;
  end if;
  update public.option_values set tags = v_tags, hex = v_hex where id = p_id returning * into v;
  perform public.admin_audit_action('option_value.update', 'option_value', p_id::text, null, jsonb_build_object('tags', to_jsonb(v.tags), 'hex', v.hex), null, null);
  return public.option_value_json(v);
end $$;

-- Approve a pending value (optionally setting tags and shade in the same step). Approving an approved value is a no-op.
create or replace function public.admin_approve_option_value(p_id uuid, p_fields jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v public.option_values;
  v_old_status text;
begin
  if not public.has_role(array['reviewer']) then raise exception 'forbidden' using errcode = '42501'; end if;
  select status into v_old_status from public.option_values where id = p_id for update;
  if not found then raise exception 'value_not_found' using errcode = 'P0001'; end if;
  if v_old_status = 'merged' then raise exception 'value_merged' using errcode = 'P0001'; end if;
  if p_fields is not null then perform public.admin_update_option_value(p_id, p_fields); end if;
  update public.option_values set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() where id = p_id returning * into v;
  perform public.admin_audit_action('option_value.approve', 'option_value', p_id::text, jsonb_build_object('status', v_old_status), jsonb_build_object('status', v.status, 'label', v.label), null, null);
  return public.option_value_json(v);
end $$;

-- Rename: the new spelling is shown on every item that uses the value. Refused when another live value already has that key (merge instead).
create or replace function public.admin_rename_option_value(p_id uuid, p_label text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_label text := regexp_replace(btrim(coalesce(p_label, '')), '[[:space:]]+', ' ', 'g');
  v_key text := public.normalize_value_key(v_label);
  v_old public.option_values;
  v public.option_values;
  v_items integer;
begin
  if not public.has_role(array['reviewer']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_key = '' then raise exception 'invalid_label' using errcode = 'P0001'; end if;
  if char_length(v_label) > 60 then raise exception 'label_too_long' using errcode = 'P0001'; end if;
  select * into v_old from public.option_values where id = p_id for update;
  if not found then raise exception 'value_not_found' using errcode = 'P0001'; end if;
  if v_old.status = 'merged' then raise exception 'value_merged' using errcode = 'P0001'; end if;
  if exists (select 1 from public.option_values where kind = v_old.kind and key = v_key and status <> 'merged' and id <> p_id) then
    raise exception 'value_exists' using errcode = 'P0001';
  end if;
  update public.option_values set label = v_label, key = v_key where id = p_id returning * into v;
  v_items := public.option_value_apply_to_items(p_id, p_id, v_old.key);
  perform public.admin_audit_action('option_value.rename', 'option_value', p_id::text, jsonb_build_object('label', v_old.label), jsonb_build_object('label', v.label, 'items', v_items), null, null);
  return public.option_value_json(v) || jsonb_build_object('itemsUpdated', v_items);
end $$;

-- Merge p_from into p_into (same kind). Every item that used p_from now uses p_into and shows its label; p_from keeps its key, so the old
-- spelling still resolves to p_into. Tags are combined and a missing shade is copied. If p_into was itself merged, its target is used.
create or replace function public.admin_merge_option_value(p_from uuid, p_into uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_from public.option_values;
  v_into public.option_values;
  v_items integer;
begin
  if not public.has_role(array['reviewer']) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_from from public.option_values where id = p_from for update;
  if not found then raise exception 'value_not_found' using errcode = 'P0001'; end if;
  select * into v_into from public.option_values where id = p_into for update;
  if not found then raise exception 'value_not_found' using errcode = 'P0001'; end if;
  if v_into.status = 'merged' then select * into v_into from public.option_values where id = v_into.merged_into for update; end if;
  if v_from.status = 'merged' then raise exception 'value_merged' using errcode = 'P0001'; end if;
  if v_from.id = v_into.id then raise exception 'same_value' using errcode = 'P0001'; end if;
  if v_from.kind <> v_into.kind then raise exception 'kind_mismatch' using errcode = 'P0001'; end if;
  update public.option_values set status = 'merged', merged_into = v_into.id, reviewed_by = auth.uid(), reviewed_at = now() where id = v_from.id;
  update public.option_values set merged_into = v_into.id where merged_into = v_from.id;     -- never leave a chain
  update public.option_values set
      tags = (select coalesce(array_agg(distinct t order by t), '{}') from unnest(v_into.tags || v_from.tags) t),
      hex = coalesce(v_into.hex, v_from.hex)
    where id = v_into.id returning * into v_into;
  v_items := public.option_value_apply_to_items(v_from.id, v_into.id, v_from.key);
  perform public.admin_audit_action('option_value.merge', 'option_value', v_from.id::text, jsonb_build_object('label', v_from.label),
    jsonb_build_object('into', v_into.id, 'label', v_into.label, 'items', v_items), null, null);
  return public.option_value_json(v_into) || jsonb_build_object('itemsUpdated', v_items, 'mergedFrom', v_from.id);
end $$;

revoke all on function public.seller_option_values(text, text, integer), public.seller_add_option_value(text, text, text), public.seller_link_item_values(uuid, jsonb),
  public.public_option_value_filter(text), public.admin_option_values(text, text, text, integer, integer), public.admin_approve_option_value(uuid, jsonb),
  public.admin_update_option_value(uuid, jsonb), public.admin_rename_option_value(uuid, text), public.admin_merge_option_value(uuid, uuid) from public, anon;
grant execute on function public.seller_option_values(text, text, integer), public.seller_add_option_value(text, text, text), public.seller_link_item_values(uuid, jsonb),
  public.admin_option_values(text, text, text, integer, integer), public.admin_approve_option_value(uuid, jsonb), public.admin_update_option_value(uuid, jsonb),
  public.admin_rename_option_value(uuid, text), public.admin_merge_option_value(uuid, uuid) to authenticated, service_role;
grant execute on function public.public_option_value_filter(text) to anon, authenticated, service_role;
