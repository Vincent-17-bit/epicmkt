-- 0031_plan_reprice_applications.sql
-- A plan price change reaches every application that has not been paid in full and activated, at once.
-- Live sellers keep the monthly price on their business. An admin's per-application price override still wins.

create or replace function public.plans_reprice_applications() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a public.applications;
  v_price integer;
begin
  for a in
    select * from public.applications x
     where x.category_id = new.category_id and x.plan_key = new.plan_key and x.status not in ('activated', 'rejected')
     for update
  loop
    update public.applications
       set price_at_submission = new.price_kes,
           plan_snapshot = jsonb_set(coalesce(plan_snapshot, '{}'::jsonb), '{price_kes}', to_jsonb(new.price_kes), true)
     where id = a.id returning * into a;
    v_price := public.mpesa_price(a);

    if a.status = 'payment_confirming' and a.credit_kes < v_price then
      update public.applications set status = 'approved', payment_code = null where id = a.id;
      insert into public.application_events (application_id, actor, type, data)
      values (a.id, 'system', 'price_changed', jsonb_build_object('price', v_price, 'credit', a.credit_kes, 'back_to', 'approved'));
    elsif a.status = 'approved' and v_price > 0 and a.credit_kes >= v_price then
      update public.applications set status = 'payment_confirming',
             payment_code = (select t.trans_id from public.mpesa_transactions t where t.application_id = a.id and t.state = 'credited' order by t.created_at desc limit 1)
       where id = a.id;
      insert into public.application_events (application_id, actor, type, data)
      values (a.id, 'system', 'price_changed', jsonb_build_object('price', v_price, 'credit', a.credit_kes, 'to', 'payment_confirming'));
      perform public.notify_admin('payment_received', null, jsonb_build_object('application_id', a.id, 'business_name', a.business_name, 'ready', true));
    else
      insert into public.application_events (application_id, actor, type, data)
      values (a.id, 'system', 'price_changed', jsonb_build_object('price', v_price));
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists t_plans_reprice on public.plans;
create trigger t_plans_reprice after update of price_kes on public.plans
  for each row when (old.price_kes is distinct from new.price_kes)
  execute function public.plans_reprice_applications();
