-- S1: rename and remove item sections atomically.
-- Sections are an ordered list of names in seller_settings.settings.sections; items.section holds the name.
-- Both functions derive the business from the signed-in seller (never from an argument), change the list and the
-- items in one transaction, and write an audit row. Items are never deleted.
-- The same rules live in shared/src/seller/sections.js; shared/src/seller/section-cases.js runs through both.
-- Safe to run again.

create or replace function public.rename_item_section(p_old text, p_new text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_old text := regexp_replace(btrim(coalesce(p_old, '')), '\s+', ' ', 'g');
  v_new text := regexp_replace(btrim(coalesce(p_new, '')), '\s+', ' ', 'g');
  v_list text[];
  v_i integer;
  v_j integer;
  v_current text;
  v_target text;
  v_moved integer := 0;
  v_merged boolean := false;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if char_length(v_new) < 2 or char_length(v_new) > 40 then raise exception 'invalid_section_name'; end if;

  insert into public.seller_settings (business_id) values (v_id) on conflict (business_id) do nothing;
  perform 1 from public.seller_settings where business_id = v_id for update;
  select coalesce(array(select jsonb_array_elements_text(coalesce(settings -> 'sections', '[]'::jsonb))), '{}')
    into v_list from public.seller_settings where business_id = v_id;

  select i into v_i from generate_subscripts(v_list, 1) i where lower(v_list[i]) = lower(v_old) limit 1;
  if v_i is null then raise exception 'section_not_found'; end if;
  v_current := v_list[v_i];
  if v_current = v_new then
    return jsonb_build_object('sections', to_jsonb(v_list), 'moved', 0, 'merged', false);
  end if;

  select i into v_j from generate_subscripts(v_list, 1) i where i <> v_i and lower(v_list[i]) = lower(v_new) limit 1;
  if v_j is not null then
    v_merged := true;
    v_target := v_list[v_j];
    v_list := v_list[1:v_i - 1] || v_list[v_i + 1:array_length(v_list, 1)];
  else
    v_target := v_new;
    v_list[v_i] := v_new;
  end if;

  update public.items set section = v_target where business_id = v_id and lower(section) = lower(v_current);
  get diagnostics v_moved = row_count;

  update public.seller_settings
     set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{sections}', to_jsonb(v_list), true), updated_at = now()
   where business_id = v_id;

  perform public.write_audit(v_id, 'section_renamed', 'business', v_id::text,
    jsonb_build_object('from', v_current, 'to', v_target, 'merged', v_merged, 'items', v_moved));
  return jsonb_build_object('sections', to_jsonb(v_list), 'moved', v_moved, 'merged', v_merged);
end $$;

create or replace function public.remove_item_section(p_name text, p_move_to text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_move text := nullif(regexp_replace(btrim(coalesce(p_move_to, '')), '\s+', ' ', 'g'), '');
  v_list text[];
  v_i integer;
  v_j integer;
  v_current text;
  v_target text := null;
  v_moved integer := 0;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;

  insert into public.seller_settings (business_id) values (v_id) on conflict (business_id) do nothing;
  perform 1 from public.seller_settings where business_id = v_id for update;
  select coalesce(array(select jsonb_array_elements_text(coalesce(settings -> 'sections', '[]'::jsonb))), '{}')
    into v_list from public.seller_settings where business_id = v_id;

  select i into v_i from generate_subscripts(v_list, 1) i where lower(v_list[i]) = lower(v_name) limit 1;
  if v_i is null then raise exception 'section_not_found'; end if;
  v_current := v_list[v_i];

  if v_move is not null then
    select i into v_j from generate_subscripts(v_list, 1) i where lower(v_list[i]) = lower(v_move) limit 1;
    if v_j is null or v_j = v_i then raise exception 'invalid_move_target'; end if;
    v_target := v_list[v_j];
  end if;

  v_list := v_list[1:v_i - 1] || v_list[v_i + 1:array_length(v_list, 1)];
  update public.items set section = v_target where business_id = v_id and lower(section) = lower(v_current);
  get diagnostics v_moved = row_count;

  update public.seller_settings
     set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{sections}', to_jsonb(v_list), true), updated_at = now()
   where business_id = v_id;

  perform public.write_audit(v_id, 'section_removed', 'business', v_id::text,
    jsonb_build_object('name', v_current, 'moved_to', v_target, 'items', v_moved));
  return jsonb_build_object('sections', to_jsonb(v_list), 'moved', v_moved, 'merged', false);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['rename_item_section(text, text)', 'remove_item_section(text, text)'] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end $$;
