-- 0122_merge_moves_photos.sql
-- Merging similar items now brings the hidden items' photos along (0116 left them behind).
--   Each photo of a hidden item MOVES to the combined item (not copied, so one file is never shared by two rows and cleanup stays safe),
--   after the combined item's own photos, tagged with the option it belonged to, so choosing "800 g" shows the 800 g photos first.
--   The plan's photo limit still applies: photos past it stay on the hidden item.
--   Undo moves exactly those photos back and clears the tag.
-- The two functions are patched in place (their other behaviour is unchanged).

do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'seller_merge_items';
  if position('v_moved' in v_def) = 0 then
    v_new := replace(v_def, E'  v_stock integer;\nbegin', E'  v_stock integer;\n  v_mrow public.item_media;\n  v_moved jsonb := ''[]''::jsonb;\n  v_first uuid;\n  v_vi integer;\nbegin');
    if v_new = v_def then raise exception 'seller_merge_items: declare block not found'; end if;
    v_def := v_new;
    v_new := replace(v_def, E'  update public.items set name = v_name, option_axes = v_axes, updated_at = now() where id = p_ids[1];\n',
      E'  update public.items set name = v_name, option_axes = v_axes, updated_at = now() where id = p_ids[1];\n' ||
      E'  -- Photos of the hidden items move to the combined item, tagged with the option they belonged to (the first axis).\n' ||
      E'  foreach v_id in array p_ids[2:v_n] loop\n' ||
      E'    v_first := null;\n' ||
      E'    for v_mrow in select * from public.item_media where item_id = v_id and kind = ''image'' order by sort, created_at, id loop\n' ||
      E'      exit when not public.media_limit_ok(p_ids[1], ''image'');\n' ||
      E'      update public.item_media set item_id = p_ids[1],\n' ||
      E'             sort = (select coalesce(max(x.sort) + 1, 0) from public.item_media x where x.item_id = p_ids[1]),\n' ||
      E'             option_ids = array[(v_choices -> v_id::text) ->> (v_axes -> 0 ->> ''key'')]\n' ||
      E'       where id = v_mrow.id;\n' ||
      E'      v_moved := v_moved || jsonb_build_array(jsonb_build_object(''id'', v_mrow.id, ''itemId'', v_id, ''sort'', v_mrow.sort));\n' ||
      E'      v_first := coalesce(v_first, v_mrow.id);\n' ||
      E'    end loop;\n' ||
      E'    -- The option\'s own photo (value.mediaId) is the first one that moved, unless it already has one.\n' ||
      E'    if v_first is not null then\n' ||
      E'      select t.n - 1 into v_vi from jsonb_array_elements(v_axes -> 0 -> ''values'') with ordinality as t(e, n)\n' ||
      E'       where t.e ->> ''id'' = (v_choices -> v_id::text) ->> (v_axes -> 0 ->> ''key'');\n' ||
      E'      if v_vi is not null and (v_axes -> 0 -> ''values'' -> v_vi) -> ''mediaId'' is null then\n' ||
      E'        v_axes := jsonb_set(v_axes, array[''0'', ''values'', v_vi::text, ''mediaId''], to_jsonb(v_first::text));\n' ||
      E'      end if;\n' ||
      E'    end if;\n' ||
      E'  end loop;\n' ||
      E'  update public.items set option_axes = v_axes where id = p_ids[1];\n' ||
      E'  update public.item_merges set snapshot = snapshot || jsonb_build_object(''media'', v_moved), merged_axes = v_axes where id = v_merge;\n');
    if v_new = v_def then raise exception 'seller_merge_items: final update not found'; end if;
    execute v_new;
  end if;

  select pg_get_functiondef(p.oid) into strict v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'seller_undo_merge';
  if position('item_media' in v_def) = 0 then
    v_new := replace(v_def, E'  delete from public.item_redirects where merge_id = m.id;\n',
      E'  for s in select jsonb_array_elements(coalesce(m.snapshot -> ''media'', ''[]''::jsonb)) loop\n' ||
      E'    update public.item_media set item_id = (s ->> ''itemId'')::uuid, sort = (s ->> ''sort'')::integer, option_ids = ''{}''\n' ||
      E'     where id = (s ->> ''id'')::uuid and item_id = m.target_id;\n' ||
      E'  end loop;\n' ||
      E'  delete from public.item_redirects where merge_id = m.id;\n');
    if v_new = v_def then raise exception 'seller_undo_merge: redirect delete not found'; end if;
    execute v_new;
  end if;
end $$;
