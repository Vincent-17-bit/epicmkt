-- Money in seller messages is written the same way everywhere in the product: "KSh 1,500".
-- Same function as 0006 with only the message text changed; safe to re-run.
create or replace function public.payment_apply_confirmation(p_id uuid, p_via text default 'admin', p_now timestamptz default now()) returns public.payments
language plpgsql security definer set search_path = public as $$
declare
  p public.payments;
  b public.businesses;
  v_today date := public.nairobi_day(p_now);
  v_paid date;
  v_start date;
  v_end date;
  v_body text;
begin
  if p_via not in ('admin','auto') then raise exception 'invalid_via'; end if;
  select * into p from public.payments x where x.id = p_id for update;
  if not found then raise exception 'payment_not_found'; end if;
  if p.status = 'confirmed' then return p; end if;
  if p.status = 'rejected' then raise exception 'payment_rejected'; end if;
  select * into b from public.businesses x where x.id = p.business_id for update;

  if p.kind in ('first','renewal') then
    v_paid := case when b.paid_until is null then null else public.nairobi_day(b.paid_until) end;
    v_start := case when v_paid is not null and v_today <= v_paid + 1 then v_paid else v_today end;
    v_end := public.add_calendar_month(v_start);
    update public.businesses x set paid_until = public.nairobi_midnight(v_end),
      status = case when x.status in ('pending','expired') then 'live' else x.status end
    where x.id = b.id;
    v_body := format('We received KSh %s. Your listing is paid until %s.', to_char(p.amount_kes, 'FM999,999,999'), to_char(v_end, 'DD Mon YYYY'));
  elsif p.kind = 'upgrade' then
    v_start := v_today;
    v_end := public.nairobi_day(b.paid_until);
    update public.businesses x set plan_key = coalesce(p.plan_key, x.plan_key) where x.id = b.id;
    v_body := format('We received KSh %s. You are now on %s until %s.', to_char(p.amount_kes, 'FM999,999,999'), initcap(coalesce(p.plan_key, b.plan_key)), to_char(v_end, 'DD Mon YYYY'));
  else
    v_start := v_today;
    v_end := case when b.paid_until is null then null else public.nairobi_day(b.paid_until) end;
    v_body := format('We received KSh %s for your category change. It now waits for admin approval.', to_char(p.amount_kes, 'FM999,999,999'));
  end if;

  update public.payments x set status = 'confirmed', period_start = v_start, period_end = v_end, confirmed_via = p_via, decline_reason = null
  where x.id = p.id returning * into p;
  perform public.post_seller_message(p.business_id, 'payment', 'Payment received', v_body || ' Receipt ' || p.receipt_no || '.',
    jsonb_build_object('payment_id', p.id, 'receipt_no', p.receipt_no), 'payment:' || p.id);
  perform public.write_audit(p.business_id, 'payment_confirmed', 'payment', p.id::text, jsonb_build_object('via', p_via, 'receipt', p.receipt_no));
  return p;
end $$;

