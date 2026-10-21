-- 0026_admin_plans.sql
-- B6a Plans and pricing: edit a plan's price, three headline benefits and badge, with an immutable history.
--
-- Roles: any admin may read plans and their history; the owner and finance change them.
-- A price change needs a reason. Existing sellers keep the monthly price stored on their business (see
-- businesses.monthly_price); a plan change applies to new applications, and the list says how many live
-- businesses are on each plan so nobody is surprised. Every save writes the audit log. Safe to run again.

create table if not exists public.plan_versions (
  id          bigint generated always as identity primary key,
  category_id text not null,
  plan_key    text not null,
  snapshot    jsonb not null,
  reason      text,
  changed_by  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists plan_versions_lookup_idx on public.plan_versions (category_id, plan_key, created_at desc);
alter table public.plan_versions enable row level security;
revoke all on public.plan_versions from public, anon, authenticated; -- read only through admin_plan_history()

-- Written by trigger only, so no path (SQL editor included) can change a plan without leaving a snapshot.
create or replace function public.snapshot_plan_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.plan_versions (category_id, plan_key, snapshot, reason, changed_by)
  values (new.category_id, new.plan_key, to_jsonb(new), nullif(current_setting('app.change_reason', true), ''), auth.uid());
  return new;
end $$;
drop trigger if exists t_plans_version on public.plans;
create trigger t_plans_version after insert or update on public.plans for each row execute function public.snapshot_plan_version();

create or replace function public.admin_plans_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.sort, x.category_name, x.plan_key)
    from (
      select c.id as category_id, c.name as category_name, c.grp, c.sort, c.active as category_active,
             p.plan_key, p.price_kes, p.top_benefits, p.badge, p.updated_at,
             (select count(*) from public.businesses b where b.category_id = c.id and b.plan_key = p.plan_key and b.status = 'live') as live_businesses,
             (select coalesce(sum(b.monthly_price), 0) from public.businesses b where b.category_id = c.id and b.plan_key = p.plan_key and b.status = 'live') as live_monthly_kes,
             (select count(*) from public.plan_versions v where v.category_id = c.id and v.plan_key = p.plan_key) as versions
        from public.categories c join public.plans p on p.category_id = c.id
    ) x
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_save_plan(
  p_category text, p_plan text, p_price integer, p_benefits jsonb, p_badge text default null, p_reason text default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  old public.plans;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_badge text := nullif(btrim(coalesce(p_badge, '')), '');
  v_benefits jsonb;
begin
  if not public.has_role(array['owner', 'finance']) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into old from public.plans where category_id = p_category and plan_key = p_plan for update;
  if not found then raise exception 'plan_not_found'; end if;
  if p_price is null or p_price not between 0 and 100000 then raise exception 'invalid_price'; end if;
  if v_badge is not null and v_badge not in ('Best value', 'Popular') then raise exception 'invalid_badge'; end if;
  if jsonb_typeof(p_benefits) <> 'array' or jsonb_array_length(p_benefits) <> 3 then raise exception 'three_benefits_required'; end if;
  -- Trim each benefit and refuse blanks or very long lines.
  select jsonb_agg(btrim(b)) into v_benefits from jsonb_array_elements_text(p_benefits) b;
  if exists (select 1 from jsonb_array_elements_text(v_benefits) b where char_length(b) not between 2 and 80) then raise exception 'invalid_benefit'; end if;
  if p_price is distinct from old.price_kes and (v_reason is null or char_length(v_reason) < 5) then raise exception 'reason_required'; end if;
  if p_price = old.price_kes and v_benefits = old.top_benefits and v_badge is not distinct from old.badge then return 0; end if; -- nothing changed

  perform set_config('app.change_reason', coalesce(v_reason, ''), true);
  update public.plans set price_kes = p_price, top_benefits = v_benefits, badge = v_badge, updated_at = now()
   where category_id = p_category and plan_key = p_plan;
  perform public.admin_audit_action('plan.update', 'plan', p_category || ':' || p_plan,
    jsonb_build_object('price_kes', old.price_kes, 'top_benefits', old.top_benefits, 'badge', old.badge),
    jsonb_build_object('price_kes', p_price, 'top_benefits', v_benefits, 'badge', v_badge), v_reason, null);
  return (select count(*)::int from public.plan_versions where category_id = p_category and plan_key = p_plan);
end $$;

create or replace function public.admin_plan_history(p_category text, p_plan text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
    from (
      select v.id, v.created_at, v.reason, (v.snapshot->>'price_kes')::int as price_kes, v.snapshot->'top_benefits' as top_benefits,
             v.snapshot->>'badge' as badge, (select a.email from public.admins a where a.user_id = v.changed_by) as changed_by_email
        from public.plan_versions v where v.category_id = p_category and v.plan_key = p_plan
       order by v.created_at desc limit 50
    ) x
  ), '[]'::jsonb);
end $$;

revoke all on function public.admin_plans_list(), public.admin_save_plan(text, text, integer, jsonb, text, text), public.admin_plan_history(text, text) from public, anon;
grant execute on function public.admin_plans_list(), public.admin_save_plan(text, text, integer, jsonb, text, text), public.admin_plan_history(text, text) to authenticated, service_role;
