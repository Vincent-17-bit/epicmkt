-- 0027_admin_categories.sql
-- B6b Categories and the template builder.
--
-- A category carries the extra questions asked on the seller application (`template`) and the extra documents
-- required for it (`extra_docs`). A broken template would break the public application form, so the shape is
-- validated here, not just in the screen. Owner only for changes (catalogue.edit); any admin may read.
-- Categories are never deleted, only switched off: sellers already in a category keep it.
-- A new category starts switched off with two placeholder plans at KES 0, and cannot be switched on until both
-- plans have a price, so nothing goes live for free by accident. Safe to run again.

create or replace function public.validate_category_template(p_template jsonb) returns void
language plpgsql immutable as $$
declare f jsonb; v_keys text[] := '{}'; v_key text; v_type text; o jsonb;
begin
  if jsonb_typeof(p_template) <> 'array' then raise exception 'invalid_template'; end if;
  if jsonb_array_length(p_template) > 40 then raise exception 'too_many_fields'; end if;
  for f in select * from jsonb_array_elements(p_template) loop
    if jsonb_typeof(f) <> 'object' then raise exception 'invalid_template'; end if;
    v_key := f->>'key'; v_type := f->>'type';
    if v_key is null or v_key !~ '^[a-zA-Z][a-zA-Z0-9]{0,39}$' then raise exception 'invalid_field_key'; end if;
    if v_key = any (v_keys) then raise exception 'duplicate_field_key'; end if;
    v_keys := v_keys || v_key;
    if coalesce(char_length(btrim(f->>'label')), 0) not between 1 and 80 then raise exception 'invalid_field_label'; end if;
    if v_type is null or v_type not in ('text', 'number', 'price', 'boolean', 'select', 'multiselect', 'itemlist') then raise exception 'invalid_field_type'; end if;
    if v_type in ('select', 'multiselect') then
      -- NULL-safe: a missing `options` key must fail, not slip through a NULL comparison.
      if coalesce(jsonb_typeof(f->'options'), '') <> 'array' then raise exception 'options_required'; end if;
      if jsonb_array_length(f->'options') not between 2 and 30 then raise exception 'options_required'; end if;
      for o in select * from jsonb_array_elements(f->'options') loop
        if jsonb_typeof(o) <> 'string' or char_length(btrim(o #>> '{}')) not between 1 and 60 then raise exception 'invalid_option'; end if;
      end loop;
    end if;
  end loop;
  -- A condition must point at a field that exists in this template.
  for f in select * from jsonb_array_elements(p_template) loop
    if f ? 'showIf' then
      if coalesce(jsonb_typeof(f->'showIf'), '') <> 'object'
         or coalesce((f->'showIf'->>'field') = any (v_keys), false) is false
         or (f->'showIf'->>'field') = (f->>'key') then
        raise exception 'invalid_condition';
      end if;
    end if;
  end loop;
end $$;

create or replace function public.validate_category_docs(p_docs jsonb) returns void
language plpgsql immutable as $$
declare d jsonb; v_keys text[] := '{}';
begin
  if jsonb_typeof(p_docs) <> 'array' then raise exception 'invalid_docs'; end if;
  if jsonb_array_length(p_docs) > 10 then raise exception 'too_many_docs'; end if;
  for d in select * from jsonb_array_elements(p_docs) loop
    if jsonb_typeof(d) <> 'object' or (d->>'key') is null or (d->>'key') !~ '^[a-z0-9_]{2,40}$' then raise exception 'invalid_doc_key'; end if;
    if (d->>'key') = any (v_keys) then raise exception 'duplicate_doc_key'; end if;
    v_keys := v_keys || (d->>'key');
    if coalesce(char_length(btrim(d->>'label')), 0) not between 1 and 120 then raise exception 'invalid_doc_label'; end if;
    if (d->>'rule') is null or (d->>'rule') not in ('required', 'conditional') then raise exception 'invalid_doc_rule'; end if;
    if (d->>'rule') = 'conditional' and coalesce(char_length(btrim(d->>'condition')), 0) = 0 then raise exception 'condition_required'; end if;
    if coalesce(char_length(btrim(d->>'why')), 0) not between 1 and 200 then raise exception 'invalid_doc_why'; end if;
  end loop;
end $$;

create or replace function public.admin_categories_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.sort, x.name)
    from (
      select c.id, c.name, c.grp, c.icon, c.tier, c.sort, c.active, c.template, c.extra_docs, c.updated_at,
             (select count(*) from public.businesses b where b.category_id = c.id and b.status = 'live') as live_businesses,
             (select count(*) from public.businesses b where b.category_id = c.id and b.status <> 'deleted') as businesses,
             (select min(p.price_kes) from public.plans p where p.category_id = c.id) as min_price,
             (select count(*) from public.plans p where p.category_id = c.id and p.price_kes > 0) as priced_plans
        from public.categories c
    ) x
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_save_category(
  p_id text, p_name text, p_grp text, p_icon text, p_tier text, p_sort integer, p_active boolean,
  p_template jsonb, p_extra_docs jsonb, p_reason text default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  old public.categories;
  v_name text := btrim(coalesce(p_name, ''));
  v_grp text := btrim(coalesce(p_grp, ''));
  v_icon text := coalesce(nullif(btrim(coalesce(p_icon, '')), ''), 'store');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_new boolean;
begin
  if not public.has_role(array['owner']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(p_id, '') !~ '^[a-z0-9-]{2,50}$' then raise exception 'invalid_id'; end if;
  if char_length(v_name) not between 2 and 80 or char_length(v_grp) not between 2 and 60 then raise exception 'invalid_input'; end if;
  if v_icon !~ '^[a-z0-9-]{2,40}$' then raise exception 'invalid_icon'; end if;
  if p_tier not in ('A', 'B', 'C', 'D') then raise exception 'invalid_tier'; end if;
  perform public.validate_category_template(coalesce(p_template, '[]'::jsonb));
  perform public.validate_category_docs(coalesce(p_extra_docs, '[]'::jsonb));

  select * into old from public.categories where id = p_id for update;
  v_new := not found;

  if v_new then
    insert into public.categories (id, name, grp, icon, tier, sort, active, template, extra_docs)
    values (p_id, v_name, v_grp, v_icon, p_tier, coalesce(p_sort, 0), false, coalesce(p_template, '[]'::jsonb), coalesce(p_extra_docs, '[]'::jsonb));
    insert into public.plans (category_id, plan_key, price_kes, items_limit, top_benefits)
    select p_id, k, 0, null, '["Listed on EpicMKT", "Contact buttons", "Opening hours"]'::jsonb from unnest(array['standard', 'premium']) k;
    if coalesce(p_active, false) then raise exception 'plans_not_priced'; end if;
  else
    if coalesce(p_active, false) and not old.active
       and (select count(*) from public.plans where category_id = p_id and price_kes > 0) < 2 then
      raise exception 'plans_not_priced';
    end if;
    if not coalesce(p_active, false) and old.active and (v_reason is null or char_length(v_reason) < 5) then raise exception 'reason_required'; end if;
    update public.categories
       set name = v_name, grp = v_grp, icon = v_icon, tier = p_tier, sort = coalesce(p_sort, sort), active = coalesce(p_active, false),
           template = coalesce(p_template, '[]'::jsonb), extra_docs = coalesce(p_extra_docs, '[]'::jsonb), updated_at = now()
     where id = p_id;
  end if;

  perform public.admin_audit_action(case when v_new then 'category.create' else 'category.update' end, 'category', p_id,
    case when v_new then null else jsonb_build_object('name', old.name, 'active', old.active, 'tier', old.tier,
      'template_fields', jsonb_array_length(old.template), 'extra_docs', jsonb_array_length(old.extra_docs)) end,
    jsonb_build_object('name', v_name, 'active', case when v_new then false else coalesce(p_active, false) end, 'tier', p_tier,
      'template_fields', jsonb_array_length(coalesce(p_template, '[]'::jsonb)), 'extra_docs', jsonb_array_length(coalesce(p_extra_docs, '[]'::jsonb))),
    v_reason, null);
  return v_new;
end $$;

revoke all on function public.validate_category_template(jsonb), public.validate_category_docs(jsonb),
  public.admin_categories_list(), public.admin_save_category(text, text, text, text, text, integer, boolean, jsonb, jsonb, text) from public, anon;
grant execute on function public.validate_category_template(jsonb), public.validate_category_docs(jsonb),
  public.admin_categories_list(), public.admin_save_category(text, text, text, text, text, integer, boolean, jsonb, jsonb, text) to authenticated, service_role;
