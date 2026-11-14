-- 0112_import_option_value.sql
-- Prompt 11.7: a category kit carries approved open values (materials, colours, brands, finishes, flavours). Until now a value could
-- only be created by a seller and then approved, so an import into another environment had no way to add one.
--
-- admin_import_option_value(kind, label, fields) adds one value as approved, or finds the one already there:
--   no live value with that key        -> created as approved (created = true)
--   a pending value with that key      -> approved, and its tags and shade set (created = false)
--   an approved value with that key    -> left as it is, unless the kit brings tags or a shade the value does not have yet
-- Same roles as the review queue (reviewer, and the owner). The key comes from normalize_value_key, so "Rose Gold" and "rose gold" are one value.
-- Tags and shade go through admin_update_option_value, so they follow the same rules. Every change is audited. Safe to run again.

create or replace function public.admin_import_option_value(p_kind text, p_label text, p_fields jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_label text := btrim(coalesce(p_label, ''));
  v_key text;
  v public.option_values;
  v_created boolean := false;
  f jsonb := coalesce(p_fields, '{}'::jsonb);
begin
  if not public.has_role(array['reviewer']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('material', 'color', 'brand', 'finish', 'flavour') then raise exception 'invalid_kind' using errcode = 'P0001'; end if;
  if v_label = '' or char_length(v_label) > 60 then raise exception 'invalid_label' using errcode = 'P0001'; end if;
  if jsonb_typeof(f) <> 'object' then raise exception 'invalid_fields' using errcode = 'P0001'; end if;
  v_key := public.normalize_value_key(v_label);
  if v_key = '' then raise exception 'invalid_label' using errcode = 'P0001'; end if;

  select * into v from public.option_values where kind = p_kind and key = v_key and status <> 'merged' for update;
  if not found then
    insert into public.option_values (kind, key, label, status, reviewed_by, reviewed_at)
    values (p_kind, v_key, v_label, 'approved', auth.uid(), now()) returning * into v;
    v_created := true;
    perform public.admin_audit_action('option_value.import', 'option_value', v.id::text, null, jsonb_build_object('kind', v.kind, 'label', v.label), null, null);
  elsif v.status = 'pending' then
    update public.option_values set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() where id = v.id returning * into v;
    perform public.admin_audit_action('option_value.approve', 'option_value', v.id::text, jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'approved', 'label', v.label), null, null);
  end if;

  -- tags and shade: only what the kit brings, and only when the value does not already have it (an import never overwrites a reviewer's choice)
  if (f ? 'tags' and cardinality(v.tags) = 0) or (f ? 'hex' and v.hex is null) then
    perform public.admin_update_option_value(v.id, jsonb_strip_nulls(jsonb_build_object(
      'tags', case when f ? 'tags' and cardinality(v.tags) = 0 then f -> 'tags' end,
      'hex', case when f ? 'hex' and v.hex is null then f -> 'hex' end)));
    select * into v from public.option_values where id = v.id;
  end if;
  return jsonb_build_object('created', v_created, 'value', public.option_value_json(v));
end $$;

revoke all on function public.admin_import_option_value(text, text, jsonb) from public, anon;
grant execute on function public.admin_import_option_value(text, text, jsonb) to authenticated, service_role;
