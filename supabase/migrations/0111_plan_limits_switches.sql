-- 0111_plan_limits_switches.sql
-- Prompt 11.5: plan limits and feature switches for options, 3D, recommend, delivery and demand signals.
--
-- Stored per plan in global_limits (standard / premium), as before. Three keys are added to a plan's JSON, and only when they differ from the defaults:
--   options  { axes, values, variants }      lowers the editor's hard limits (the seller app already reads this key)
--   threeD   { models, spinFrames }          lowers the 3D limits
--   features { options, threeD, recommend, delivery, demand }   a switch is on unless it is false
-- A plan can only LOWER a hard limit. The same rules live in shared/src/planLimits.js; the db test checks that the two agree.
-- Nothing is enforced here beyond what Prompt 3.1 already does; this is the place the admin sets the numbers. Safe to run again.

create or replace function public.admin_plan_limits() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_build_object('standard', g.standard, 'premium', g.premium, 'updated_at', g.updated_at) from public.global_limits g where g.id = 1), '{}'::jsonb);
end $$;

-- Cleans one group of whole-number limits: keeps only values below the hard cap, refuses anything outside min..max or not a whole number.
create or replace function public.plan_limit_group(p_group jsonb, p_rules jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  k text; rule jsonb; v jsonb; n numeric; out jsonb := '{}'::jsonb;
begin
  if p_group is null or p_group = 'null'::jsonb then return out; end if;
  if jsonb_typeof(p_group) <> 'object' then raise exception 'invalid_limits'; end if;
  for k in select jsonb_object_keys(p_group) loop
    rule := p_rules -> k;
    if rule is null then raise exception 'invalid_limits'; end if;
    v := p_group -> k;
    if v = 'null'::jsonb then continue; end if;
    if jsonb_typeof(v) <> 'number' then raise exception 'invalid_limits'; end if;
    n := (v #>> '{}')::numeric;
    if n <> trunc(n) or n < (rule->>'min')::numeric or n > (rule->>'max')::numeric then raise exception 'invalid_limits'; end if;
    if n < (rule->>'max')::numeric then out := out || jsonb_build_object(k, n::int); end if;
  end loop;
  return out;
end $$;

create or replace function public.admin_save_plan_limits(p_plan text, p_limits jsonb, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_reason text := nullif(btrim(p_reason), '');
  v_old jsonb; v_new jsonb; v_options jsonb; v_threed jsonb; v_features jsonb := '{}'::jsonb;
  k text; v jsonb;
  v_switches text[] := array['options', 'threeD', 'recommend', 'delivery', 'demand'];
begin
  if not public.has_role(array['owner', 'finance']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_plan not in ('standard', 'premium') then raise exception 'invalid_plan'; end if;
  if p_limits is null or jsonb_typeof(p_limits) <> 'object' then raise exception 'invalid_limits'; end if;
  if exists (select 1 from jsonb_object_keys(p_limits) x where x not in ('options', 'threeD', 'features')) then raise exception 'invalid_limits'; end if;

  v_options := public.plan_limit_group(p_limits -> 'options', '{"axes":{"min":1,"max":3},"values":{"min":1,"max":40},"variants":{"min":1,"max":200}}'::jsonb);
  v_threed  := public.plan_limit_group(p_limits -> 'threeD',  '{"models":{"min":0,"max":40},"spinFrames":{"min":12,"max":72}}'::jsonb);
  if p_limits ? 'features' and jsonb_typeof(p_limits -> 'features') <> 'null' then
    if jsonb_typeof(p_limits -> 'features') <> 'object' then raise exception 'invalid_limits'; end if;
    for k in select jsonb_object_keys(p_limits -> 'features') loop
      v := p_limits -> 'features' -> k;
      if not (k = any (v_switches)) or jsonb_typeof(v) <> 'boolean' then raise exception 'invalid_limits'; end if;
      if v = 'false'::jsonb then v_features := v_features || jsonb_build_object(k, false); end if;
    end loop;
  end if;

  select case when p_plan = 'premium' then g.premium else g.standard end into v_old from public.global_limits g where g.id = 1 for update;
  if v_old is null then raise exception 'limits_not_found'; end if;
  -- the plan's other limits (photos, offers, flash) stay exactly as they are; only these three keys are replaced
  v_new := (v_old - 'options' - 'threeD' - 'features')
    || case when v_options = '{}'::jsonb then '{}'::jsonb else jsonb_build_object('options', v_options) end
    || case when v_threed  = '{}'::jsonb then '{}'::jsonb else jsonb_build_object('threeD', v_threed) end
    || case when v_features = '{}'::jsonb then '{}'::jsonb else jsonb_build_object('features', v_features) end;

  if v_new = v_old then return v_new; end if; -- nothing changed
  if v_reason is null or char_length(v_reason) < 5 then raise exception 'reason_required'; end if;

  if p_plan = 'premium' then update public.global_limits set premium = v_new where id = 1;
  else update public.global_limits set standard = v_new where id = 1; end if;
  perform public.admin_audit_action('plan.limits', 'plan_limits', p_plan,
    jsonb_build_object('options', v_old -> 'options', 'threeD', v_old -> 'threeD', 'features', v_old -> 'features'),
    jsonb_build_object('options', v_new -> 'options', 'threeD', v_new -> 'threeD', 'features', v_new -> 'features'), v_reason, null);
  return v_new;
end $$;

revoke all on function public.admin_plan_limits(), public.plan_limit_group(jsonb, jsonb), public.admin_save_plan_limits(text, jsonb, text) from public, anon;
grant execute on function public.admin_plan_limits(), public.admin_save_plan_limits(text, jsonb, text) to authenticated, service_role;
