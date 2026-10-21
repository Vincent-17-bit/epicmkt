-- 0028_admin_audit_analytics.sql
-- B8a Audit viewer and Analytics.
--
-- Audit: any admin may read the audit log (the same rule as the table's policy), filtered and paged here so the
-- screen never pulls the whole table. Analytics: aggregates only, for any admin with payments or application
-- access; finance and owner see money, so the revenue block is empty for others. Times are Nairobi days.
-- Safe to run again.

create or replace function public.admin_audit_query(
  p_search text default null, p_action text default null, p_actor text default null,
  p_from date default null, p_to date default null, p_limit integer default 50, p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_action text := nullif(btrim(coalesce(p_action, '')), '');
  v_actor text := nullif(btrim(coalesce(p_actor, '')), '');
  v_from timestamptz := case when p_from is null then null else public.nairobi_midnight(p_from) end;
  v_to timestamptz := case when p_to is null then null else public.nairobi_midnight(p_to + 1) end;
  v_total bigint; v_rows jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_from is not null and v_to is not null and v_to <= v_from then raise exception 'invalid_range'; end if;

  select count(*) into v_total
    from public.audit_log a left join public.businesses b on b.id = a.business_id
   where (v_action is null or a.action = v_action or a.action like v_action || '.%')
     and (v_actor is null or a.actor_email ilike '%' || v_actor || '%')
     and (v_from is null or a.created_at >= v_from) and (v_to is null or a.created_at < v_to)
     and (v_search is null or a.action ilike '%' || v_search || '%' or a.target_id ilike '%' || v_search || '%'
          or a.reason ilike '%' || v_search || '%' or b.name ilike '%' || v_search || '%');

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc), '[]'::jsonb) into v_rows from (
    select a.id, a.created_at, a.action, a.actor_email, a.actor_role, a.target_type, a.target_id, a.reason, a.before, a.after,
           a.business_id, b.name as business_name
      from public.audit_log a left join public.businesses b on b.id = a.business_id
     where (v_action is null or a.action = v_action or a.action like v_action || '.%')
       and (v_actor is null or a.actor_email ilike '%' || v_actor || '%')
       and (v_from is null or a.created_at >= v_from) and (v_to is null or a.created_at < v_to)
       and (v_search is null or a.action ilike '%' || v_search || '%' or a.target_id ilike '%' || v_search || '%'
            or a.reason ilike '%' || v_search || '%' or b.name ilike '%' || v_search || '%')
     order by a.created_at desc, a.id desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
  ) x;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end $$;

-- The groups before the first dot ("payment", "business", "plan"...) for the filter, with counts.
create or replace function public.admin_audit_groups() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('group', g, 'n', n) order by g)
    from (select split_part(action, '.', 1) as g, count(*) as n from public.audit_log where action <> '' group by 1) s
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_analytics(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 7), 365);
  v_today date := public.nairobi_day(now());
  v_start date := public.nairobi_day(now()) - (least(greatest(coalesce(p_days, 30), 7), 365) - 1);
  v_money boolean := public.has_role(array['owner', 'finance']);
  v_apps boolean := public.has_role(array['owner', 'reviewer']);
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'days', v_days, 'from', v_start, 'to', v_today, 'can_see_money', v_money, 'can_see_applications', v_apps,
    'revenue_by_day', case when not v_money then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'kes', coalesce(r.kes, 0), 'payments', coalesce(r.n, 0)) order by d)
        from generate_series(v_start, v_today, interval '1 day') d
        left join (select public.nairobi_day(confirmed_at) as day, sum(amount_kes) as kes, count(*) as n
                     from public.payments where status = 'confirmed' and confirmed_at is not null
                      and public.nairobi_day(confirmed_at) between v_start and v_today group by 1) r on r.day = d::date
    ), '[]'::jsonb) end,
    'revenue_total', case when not v_money then null else coalesce((select sum(amount_kes) from public.payments
       where status = 'confirmed' and confirmed_at is not null and public.nairobi_day(confirmed_at) between v_start and v_today), 0) end,
    'mrr_kes', case when not v_money then null else coalesce((select sum(monthly_price) from public.businesses where status = 'live'), 0) end,
    'new_businesses_by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'n', coalesce(r.n, 0)) order by d)
        from generate_series(v_start, v_today, interval '1 day') d
        left join (select public.nairobi_day(created_at) as day, count(*) as n from public.businesses
                    where status <> 'deleted' and public.nairobi_day(created_at) between v_start and v_today group by 1) r on r.day = d::date
    ), '[]'::jsonb),
    'businesses', jsonb_build_object(
      'live', (select count(*) from public.businesses where status = 'live'),
      'expired', (select count(*) from public.businesses where status = 'expired'),
      'suspended', (select count(*) from public.businesses where status = 'suspended'),
      'premium_live', (select count(*) from public.businesses where status = 'live' and plan_key = 'premium')),
    'funnel', case when not v_apps then '{}'::jsonb else (
      select jsonb_build_object(
        'submitted', count(*) filter (where status <> 'uploading'),
        'approved', count(*) filter (where status in ('approved', 'payment_confirming', 'activated')),
        'activated', count(*) filter (where status = 'activated'),
        'rejected', count(*) filter (where status = 'rejected'))
      from public.applications where public.nairobi_day(created_at) between v_start and v_today) end,
    'by_category', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.live desc, x.name)
      from (select c.id, c.name, count(b.id) filter (where b.status = 'live') as live,
                   coalesce(sum(b.monthly_price) filter (where b.status = 'live' and v_money), 0) as monthly_kes
              from public.categories c left join public.businesses b on b.category_id = c.id group by c.id, c.name having count(b.id) filter (where b.status = 'live') > 0) x
    ), '[]'::jsonb),
    -- Of the listings whose paid period ended in the window, how many paid again within a week of it ending.
    'renewals', case when not v_money then '{}'::jsonb else (
      select jsonb_build_object('due', count(*), 'renewed', count(*) filter (where renewed))
        from (select b.id, exists (select 1 from public.payments p where p.business_id = b.id and p.status = 'confirmed'
                       and p.confirmed_at > b.paid_until - interval '1 day') as renewed
                from public.businesses b
               where b.status in ('live', 'expired') and b.paid_until is not null
                 and public.nairobi_day(b.paid_until) between v_start and v_today - 1) q) end
  );
end $$;

revoke all on function public.admin_audit_query(text, text, text, date, date, integer, integer), public.admin_audit_groups(), public.admin_analytics(integer) from public, anon;
grant execute on function public.admin_audit_query(text, text, text, date, date, integer, integer), public.admin_audit_groups(), public.admin_analytics(integer) to authenticated, service_role;
