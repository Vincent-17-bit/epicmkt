-- B6a: plan editor support. Trial days, immutable version history, coupons.

alter table public.plans
  add column if not exists trial_days integer not null default 0 check (trial_days between 0 and 90);

create table if not exists public.plan_versions (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('plan', 'global_limits')),
  category_id text,
  plan_key text,
  snapshot jsonb not null,
  reason text,
  changed_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists plan_versions_lookup_idx on public.plan_versions (kind, category_id, plan_key, created_at desc);

-- Snapshots are written only by the triggers below; the reason comes from the session setting app.change_reason.
create or replace function public.snapshot_plan_version() returns trigger
language plpgsql security definer set search_path = public as
$$
declare
  v_reason text := nullif(current_setting('app.change_reason', true), '');
begin
  if tg_table_name = 'plans' then
    insert into public.plan_versions (kind, category_id, plan_key, snapshot, reason, changed_by)
    values ('plan', new.category_id, new.plan_key, to_jsonb(new), v_reason, auth.uid());
  else
    insert into public.plan_versions (kind, snapshot, reason, changed_by)
    values ('global_limits', to_jsonb(new), v_reason, auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists t_plans_version on public.plans;
create trigger t_plans_version after insert or update on public.plans
  for each row execute function public.snapshot_plan_version();
drop trigger if exists t_global_limits_version on public.global_limits;
create trigger t_global_limits_version after insert or update on public.global_limits
  for each row execute function public.snapshot_plan_version();

alter table public.plan_versions enable row level security;
drop policy if exists "finance reads plan versions" on public.plan_versions;
create policy "finance reads plan versions" on public.plan_versions for select to authenticated
  using (public.has_role(array['finance']));
revoke all on public.plan_versions from public, anon, authenticated;
grant select on public.plan_versions to authenticated;

create table if not exists public.coupons (
  code text primary key check (code ~ '^[A-Z0-9-]{3,24}$'),
  kind text not null check (kind in ('percent', 'fixed')),
  value integer not null check (value > 0),
  scope_category text references public.categories(id) on delete cascade,
  scope_plan text check (scope_plan in ('standard', 'premium')),
  valid_from date,
  valid_until date,
  max_redemptions integer check (max_redemptions > 0),
  redeemed integer not null default 0 check (redeemed >= 0),
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'percent' or value <= 100),
  check (valid_from is null or valid_until is null or valid_until >= valid_from)
);
drop trigger if exists t_coupons_touch on public.coupons;
create trigger t_coupons_touch before update on public.coupons for each row execute function public.touch_updated_at();

alter table public.coupons enable row level security;
drop policy if exists "finance manages coupons" on public.coupons;
create policy "finance manages coupons" on public.coupons for all to authenticated
  using (public.has_role(array['finance'])) with check (public.has_role(array['finance']));
revoke all on public.coupons from public, anon, authenticated;
grant select, insert, update, delete on public.coupons to authenticated;

-- Saves go through these so the reason is recorded in the version and the rules are enforced server-side.
create or replace function public.save_plan(p_category text, p_plan text, p_patch jsonb, p_reason text default null)
returns public.plans
language plpgsql security definer set search_path = public as
$$
declare
  v_old public.plans;
  v_new public.plans;
begin
  if not public.has_role(array['finance']) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_old from public.plans where category_id = p_category and plan_key = p_plan for update;
  if not found then raise exception 'plan_not_found'; end if;
  if p_patch ? 'price_kes' and (p_patch->>'price_kes')::int is distinct from v_old.price_kes
     and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'reason_required';
  end if;
  perform set_config('app.change_reason', coalesce(p_reason, ''), true);
  update public.plans set
    price_kes = coalesce((p_patch->>'price_kes')::int, price_kes),
    items_limit = coalesce((p_patch->>'items_limit')::int, items_limit),
    top_benefits = coalesce(p_patch->'top_benefits', top_benefits),
    badge = case when p_patch ? 'badge' then nullif(p_patch->>'badge', '') else badge end,
    trial_days = coalesce((p_patch->>'trial_days')::int, trial_days)
  where category_id = p_category and plan_key = p_plan
  returning * into v_new;
  perform public.admin_audit_action('plan.update', 'plans', p_category || ':' || p_plan, to_jsonb(v_old), to_jsonb(v_new), p_reason);
  return v_new;
end $$;
revoke all on function public.save_plan(text, text, jsonb, text) from public, anon;
grant execute on function public.save_plan(text, text, jsonb, text) to authenticated;

create or replace function public.save_global_limits(p_standard jsonb, p_premium jsonb, p_reason text default null)
returns public.global_limits
language plpgsql security definer set search_path = public as
$$
declare
  v_old public.global_limits;
  v_new public.global_limits;
begin
  if not public.has_role(array['finance']) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_old from public.global_limits where id = 1 for update;
  perform set_config('app.change_reason', coalesce(p_reason, ''), true);
  update public.global_limits set standard = p_standard, premium = p_premium where id = 1 returning * into v_new;
  perform public.admin_audit_action('global_limits.update', 'global_limits', '1', to_jsonb(v_old), to_jsonb(v_new), p_reason);
  return v_new;
end $$;
revoke all on function public.save_global_limits(jsonb, jsonb, text) from public, anon;
grant execute on function public.save_global_limits(jsonb, jsonb, text) to authenticated;
