-- 0113 (Prompt 11.1): the join. Each group left a hook; this migration closes what was left open on purpose.
--
-- Already wired by the groups themselves (and proved again by supabase/tests/wiring-fixtures.test.mjs):
--   * restriction     items_restricted_type trigger (0091): any writer, so seller_save_item and seller_check_item both refuse
--   * tiers           price_tiers saved through seller_save_item (0094)
--   * flash variants  flash_check_variants trigger (0095)
--   * price range and department columns   items denorm trigger (0096)
--   * publish gate    items_spec_gate trigger (0099) and the `publish` flag of seller_check_item
-- Left open, closed here:
--   1. seller_check_item adds the 3D issues (item_check_media3d) when the caller asks for the publish view.
--   2. item_options_apply accepts only photos and videos as a value's or variant's media (not a spin frame, poster or model).
--   3. a value that is removed from an item is dropped from item_media.option_ids (the lists live inside items.option_axes, so a foreign
--      key is not possible; the write functions already refuse unknown ids).
--   4. product_relations: a relation must point at a type or department that exists, and removing a type or department removes its
--      relations (the cascade a foreign key would give; the table names its target by kind, so it is a trigger).
-- Legacy items (no type, no options) touch none of this.

-- 1 + 2: redefine the two functions from their current text, so nothing else in them changes
do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'seller_check_item';
  v_def := replace(v_def, E'\r', ''); -- a pasted script may carry Windows line breaks
  if position('item_check_media3d' in v_def) = 0 then
    v_new := replace(v_def, replace($a$  v_issues := v_base -> 'issues';
$a$, E'\r', ''), $b$  v_issues := v_base -> 'issues';
  if p_id is not null and v_old.id is not null then
    for e in select jsonb_array_elements(public.item_check_media3d(jsonb_build_object('id', p_id))) loop
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'media3d_' || (e ->> 'code'), 'scope', e -> 'scope', 'level', 'warning'));
    end loop;
  end if;
$b$);
    if v_new = v_def then raise exception 'seller_check_item: issue list not found'; end if;
    execute v_new;
  end if;

  select pg_get_functiondef(p.oid) into strict v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'item_options_apply';
  v_def := replace(v_def, E'\r', ''); -- a pasted script may carry Windows line breaks
  if position('im.kind in' in v_def) = 0 then
    v_new := replace(v_def, 'and im.item_id = p_item) then', 'and im.item_id = p_item and im.kind in (''image'', ''video'')) then');
    if v_new = v_def then raise exception 'item_options_apply: media checks not found'; end if;
    execute v_new;
  end if;
end $$;

-- 3. media option ids. The value lists live inside items.option_axes, so there is no table to point a foreign key at; the write functions
--    (seller_set_media_options, attach_item_media3d) already refuse unknown ids, and a direct insert stays as 0101 left it. What is added
--    is the other direction: a value that is removed is dropped from its photos, so no row names a value that is gone.
-- a saved item that no longer has a value drops it from its photos (the public payload already ignores it; this keeps the rows true)
create or replace function public.item_media_prune_option_ids() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.option_axes is not distinct from old.option_axes then return new; end if;
  update public.item_media m set option_ids = coalesce((select array_agg(x order by ord) from unnest(m.option_ids) with ordinality as u(x, ord)
        where public.item_has_option_value(new.id, x)), '{}')
   where m.item_id = new.id and cardinality(m.option_ids) > 0
     and exists (select 1 from unnest(m.option_ids) y where not public.item_has_option_value(new.id, y));
  return new;
end $$;
drop trigger if exists items_prune_media_option_ids on public.items;
create trigger items_prune_media_option_ids after update of option_axes on public.items
  for each row execute function public.item_media_prune_option_ids();

-- 4. relations
create or replace function public.product_relation_targets_exist() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.from_kind = 'type' and not exists (select 1 from public.product_types t where t.id = new.from_id))
     or (new.from_kind = 'department' and not exists (select 1 from public.departments d where d.id = new.from_id))
     or (new.to_kind = 'type' and not exists (select 1 from public.product_types t where t.id = new.to_id))
     or (new.to_kind = 'department' and not exists (select 1 from public.departments d where d.id = new.to_id)) then
    raise exception 'relation_target_missing' using errcode = '23503';
  end if;
  return new;
end $$;
drop trigger if exists product_relations_targets on public.product_relations;
create trigger product_relations_targets before insert or update of from_kind, from_id, to_kind, to_id on public.product_relations
  for each row execute function public.product_relation_targets_exist();

create or replace function public.product_relation_cascade() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_kind text := case tg_table_name when 'product_types' then 'type' else 'department' end;
begin
  delete from public.product_relations r
   where (r.from_kind = v_kind and r.from_id = old.id) or (r.to_kind = v_kind and r.to_id = old.id);
  return old;
end $$;
drop trigger if exists product_types_relation_cascade on public.product_types;
create trigger product_types_relation_cascade after delete on public.product_types for each row execute function public.product_relation_cascade();
drop trigger if exists departments_relation_cascade on public.departments;
create trigger departments_relation_cascade after delete on public.departments for each row execute function public.product_relation_cascade();

revoke all on function public.item_media_prune_option_ids(), public.product_relation_targets_exist(), public.product_relation_cascade() from public, anon, authenticated;
