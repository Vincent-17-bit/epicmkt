-- 0060: clearer, shorter payment and renewal messages (SMS, email and in-app).
-- Wording only. No logic, columns or amounts change.

create or replace function public.mpesa_credit_target(p_tx uuid, p_type text, p_id uuid, p_method text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  t public.mpesa_transactions;
  a public.applications;
  b public.businesses;
  v_price integer;
  v_body text;
begin
  select * into t from public.mpesa_transactions where id = p_tx for update;
  if not found then raise exception 'tx_not_found'; end if;
  if t.state <> 'needs_assignment' then return jsonb_build_object('outcome', 'skipped', 'state', t.state); end if;

  if p_type = 'application' then
    select * into a from public.applications where id = p_id for update;
    if not found then raise exception 'target_not_found'; end if;
    -- An activated application's money belongs to its business.
    select * into b from public.businesses y where y.application_id = a.id and y.status <> 'deleted';
    if found then return public.mpesa_credit_target(p_tx, 'business', b.id, p_method); end if;
    if a.status in ('rejected', 'draft') then raise exception 'application_not_payable'; end if;

    update public.applications set credit_kes = credit_kes + t.amount_kes where id = a.id returning * into a;
    update public.mpesa_transactions set state = 'credited', target_type = 'application', application_id = a.id, business_id = null,
      match_method = p_method, note = null, candidates = '[]' where id = t.id;
    v_price := public.mpesa_price(a);

    if a.status = 'approved' and a.credit_kes >= v_price then
      update public.applications set status = 'payment_confirming', payment_code = t.trans_id where id = a.id;
      insert into public.application_events (application_id, actor, type, data)
      values (a.id, 'system', 'payment_submitted', jsonb_build_object('code', t.trans_id, 'amount', t.amount_kes, 'auto', true, 'credit', a.credit_kes));
      perform public.notify_admin('payment_received', null, jsonb_build_object('code', t.trans_id, 'amount', t.amount_kes, 'application_id', a.id,
        'business_name', a.business_name, 'ready', true));
      v_body := format('KES %s received for %s. We are confirming it and will send your login shortly.', trim(to_char(t.amount_kes, 'FM999G999G990')), a.business_name);
      perform public.mpesa_queue_sms(null, a.id, a.phone, 'EpicMKT: ' || v_body, 'mpesa:' || t.id || ':sms');
      return jsonb_build_object('outcome', 'ready', 'application_id', a.id, 'reference_no', a.reference_no, 'business_name', a.business_name, 'credit', a.credit_kes);
    elsif a.status = 'payment_confirming' then
      return jsonb_build_object('outcome', 'extra_credit', 'application_id', a.id, 'reference_no', a.reference_no, 'business_name', a.business_name, 'credit', a.credit_kes);
    elsif a.status = 'approved' then
      v_body := format('KES %s received for %s. One month costs KES %s. Balance KES %s. Pay to Paybill %s, Account %s.',
        trim(to_char(t.amount_kes, 'FM999G999G990')), a.business_name, v_price, trim(to_char(v_price - a.credit_kes, 'FM999G999G990')),
        coalesce(public.mpesa_paybill(), '-'), a.reference_no);
      perform public.mpesa_queue_sms(null, a.id, a.phone, 'EpicMKT: ' || v_body, 'mpesa:' || t.id || ':sms');
      return jsonb_build_object('outcome', 'part_paid', 'application_id', a.id, 'reference_no', a.reference_no, 'business_name', a.business_name,
        'credit', a.credit_kes, 'balance', v_price - a.credit_kes);
    end if;
    -- Paid before approval. The money is safe; the approval step moves it forward.
    v_body := format('KES %s received for %s. It will be applied once your application is approved.', trim(to_char(t.amount_kes, 'FM999G999G990')), a.business_name);
    perform public.mpesa_queue_sms(null, a.id, a.phone, 'EpicMKT: ' || v_body, 'mpesa:' || t.id || ':sms');
    return jsonb_build_object('outcome', 'early', 'application_id', a.id, 'reference_no', a.reference_no, 'business_name', a.business_name, 'credit', a.credit_kes);
  elsif p_type = 'business' then
    select * into b from public.businesses where id = p_id for update;
    if not found or b.status = 'deleted' then raise exception 'target_not_found'; end if;
    update public.businesses set credit_kes = credit_kes + t.amount_kes where id = b.id;
    update public.mpesa_transactions set state = 'credited', target_type = 'business', business_id = b.id, application_id = null,
      match_method = p_method, note = null, candidates = '[]' where id = t.id;
    return public.mpesa_settle_business(b.id, t.id);
  end if;
  raise exception 'invalid_target';
end $$;

CREATE OR REPLACE FUNCTION public.payment_apply_confirmation(p_id uuid, p_via text DEFAULT 'admin'::text, p_now timestamp with time zone DEFAULT now())
 RETURNS payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    v_start := case when v_paid is not null and v_today <= v_paid + public.grace_days_of(b.grace_days) then v_paid else v_today end;
    v_end := public.add_calendar_month(v_start);
    update public.businesses x set paid_until = public.nairobi_midnight(v_end),
      status = case when x.status in ('pending','expired') then 'live' else x.status end
    where x.id = b.id;
    v_body := format('KES %s received. Your business page is paid until %s.', p.amount_kes, to_char(v_end, 'DD Mon YYYY'));
  elsif p.kind = 'upgrade' then
    v_start := v_today;
    v_end := public.nairobi_day(b.paid_until);
    update public.businesses x set plan_key = coalesce(p.plan_key, x.plan_key) where x.id = b.id;
    v_body := format('KES %s received. You are now on %s until %s.', p.amount_kes, initcap(coalesce(p.plan_key, b.plan_key)), to_char(v_end, 'DD Mon YYYY'));
  else
    v_start := v_today;
    v_end := case when b.paid_until is null then null else public.nairobi_day(b.paid_until) end;
    v_body := format('KES %s received for your category change. It is now awaiting approval.', p.amount_kes);
  end if;

  update public.payments x set status = 'confirmed', period_start = v_start, period_end = v_end, confirmed_via = p_via, decline_reason = null
  where x.id = p.id returning * into p;
  perform public.post_seller_message(p.business_id, 'payment', 'Payment received', v_body || ' Receipt ' || p.receipt_no || '.',
    jsonb_build_object('payment_id', p.id, 'receipt_no', p.receipt_no), 'payment:' || p.id);
  perform public.write_audit(p.business_id, 'payment_confirmed', 'payment', p.id::text, jsonb_build_object('via', p_via, 'receipt', p.receipt_no));
  return p;
end $function$;

CREATE OR REPLACE FUNCTION public.mpesa_settle_business(p_business uuid, p_tx uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  b public.businesses;
  t public.mpesa_transactions;
  v_price integer;
  v_max integer;
  v_today date := public.nairobi_day(now());
  v_paid date;
  v_start date;
  v_end date;
  v_cap_end date;
  v_months integer;
  v_pay public.payments;
  v_credit numeric;
  v_body text;
  v_ref text;
  v_q jsonb;
  v_need integer;
  v_intent jsonb;
begin
  select * into b from public.businesses where id = p_business for update;
  if not found or b.status = 'deleted' then raise exception 'target_not_found'; end if;
  if p_tx is not null then select * into t from public.mpesa_transactions where id = p_tx; end if;
  v_price := coalesce(b.monthly_price, (select p.price_kes from public.plans p where p.category_id = b.category_id and p.plan_key = b.plan_key));
  if v_price is null or v_price <= 0 then return jsonb_build_object('outcome', 'no_price', 'credit', b.credit_kes); end if;
  v_ref := b.seller_id;

  -- The seller opened an upgrade or category-change payment: that is what this money is for. Apply it when the credit
  -- covers it; until then hold it instead of turning it into a renewal month.
  if b.pay_intent is not null and (b.pay_intent ->> 'set_at')::timestamptz > now() - interval '48 hours' then
    begin
      v_q := public.payment_quote(b, b.pay_intent ->> 'purpose', b.pay_intent ->> 'target_plan', b.pay_intent ->> 'category');
      v_need := (v_q ->> 'amount_kes')::integer;
      if v_need > 0 and b.credit_kes >= v_need then
        v_intent := public.mpesa_apply_purpose(b.id, b.pay_intent ->> 'purpose', b.pay_intent ->> 'target_plan', b.pay_intent ->> 'category', nullif(b.pay_intent ->> 'change_id', '')::uuid);
        select * into b from public.businesses where id = p_business for update;
        -- The upgrade used the money. Anything left over only becomes renewal months if it covers a whole month.
        if b.credit_kes < v_price then
          return v_intent || jsonb_build_object('credit', b.credit_kes, 'business_id', b.id, 'business_name', b.name);
        end if;
      elsif v_need > 0 then
        v_body := format('KES %s received toward your %s. It costs KES %s. Balance KES %s. Pay to Paybill %s, Account %s.',
          trim(to_char(coalesce(t.amount_kes, b.credit_kes), 'FM999G999G990')), case when b.pay_intent ->> 'purpose' = 'upgrade' then 'upgrade' else 'category change' end,
          v_need, trim(to_char(v_need - b.credit_kes, 'FM999G999G990')), coalesce(public.mpesa_paybill(), '-'), v_ref);
        perform public.post_seller_message(b.id, 'payment', 'Payment received, balance due', v_body, jsonb_build_object('credit', b.credit_kes, 'price', v_need),
          'mpesa-hold:' || coalesce(t.id::text, gen_random_uuid()::text));
        perform public.mpesa_queue_sms(b.id, b.application_id, b.phone, 'EpicMKT: ' || v_body, 'mpesa-hold:' || coalesce(t.id::text, gen_random_uuid()::text) || ':sms');
        return jsonb_build_object('outcome', 'held', 'credit', b.credit_kes, 'price', v_need, 'balance', v_need - b.credit_kes, 'business_id', b.id, 'business_name', b.name);
      end if;
    exception when others then
      -- The quote no longer applies (for example the listing expired). Forget the intent and treat the money as a renewal.
      update public.businesses set pay_intent = null where id = b.id;
      select * into b from public.businesses where id = p_business for update;
    end;
  end if;

  v_max := coalesce((select (s.value #>> '{}')::integer from public.site_settings s where s.key = 'max_prepay_months'), 12);
  v_paid := case when b.paid_until is null then null else public.nairobi_day(b.paid_until) end;
  -- Same rule as a manual confirmation: paying on the last day or one day late carries on from the old date.
  v_start := case when v_paid is not null and v_today <= v_paid + public.grace_days_of(b.grace_days) then v_paid else v_today end;
  v_cap_end := (v_today + (v_max || ' months')::interval)::date;
  v_months := floor(b.credit_kes / v_price)::integer;
  v_months := least(v_months, greatest(0, (extract(year from age(v_cap_end, v_start)) * 12 + extract(month from age(v_cap_end, v_start)))::integer));

  if v_months >= 1 then
    v_end := (v_start + (v_months || ' months')::interval)::date;
    insert into public.payments (business_id, application_id, amount_kes, method, reference, mpesa_code, status, kind, plan_key, category_id,
                                 months, period_start, period_end, account_ref, phone, source, confirmed_via, submitted_at, confirmed_at)
    values (b.id, b.application_id, v_months * v_price, 'mpesa', coalesce(t.trans_id, 'CREDIT-' || left(gen_random_uuid()::text, 8)), t.trans_id,
            'confirmed', 'renewal', b.plan_key, b.category_id, v_months, v_start, v_end, t.account, t.payer_phone, 'auto', 'auto',
            coalesce(t.created_at, now()), now())
    returning * into v_pay;
    update public.businesses x set paid_until = public.nairobi_midnight(v_end), credit_kes = x.credit_kes - v_months * v_price,
      status = case when x.status in ('pending', 'expired') then 'live' else x.status end
    where x.id = b.id returning credit_kes into v_credit;
    update public.mpesa_transactions set state = 'applied', payment_id = v_pay.id, applied_at = now()
      where business_id = b.id and state = 'credited';

    v_body := format('Payment received. %s month%s added. Paid until %s.%s Receipt %s.',
      v_months, case when v_months = 1 then '' else 's' end, to_char(v_end, 'DD Mon YYYY'),
      case when v_credit > 0 then format(' KES %s kept as credit.', trim(to_char(v_credit, 'FM999G999G990'))) else '' end,
      v_pay.receipt_no);
    perform public.post_seller_message(b.id, 'payment', 'Payment received', v_body,
      jsonb_build_object('payment_id', v_pay.id, 'receipt_no', v_pay.receipt_no, 'months', v_months), 'payment:' || v_pay.id);
    perform public.mpesa_queue_sms(b.id, b.application_id, b.phone, 'EpicMKT: ' || v_body, 'mpesa:' || v_pay.id || ':sms');
    perform public.write_audit(b.id, 'payment_confirmed', 'payment', v_pay.id::text, jsonb_build_object('via', 'auto', 'months', v_months, 'receipt', v_pay.receipt_no));
    return jsonb_build_object('outcome', 'applied', 'months', v_months, 'paid_until', v_end, 'credit', v_credit, 'receipt_no', v_pay.receipt_no,
      'payment_id', v_pay.id, 'business_id', b.id, 'business_name', b.name);
  end if;

  v_credit := b.credit_kes;
  if v_credit >= v_price then
    v_body := format('Payment received. Your business page is already paid ahead for the maximum of %s months. KES %s is kept as credit and applied when due.',
      v_max, trim(to_char(v_credit, 'FM999G999G990')));
  else
    v_body := format('KES %s received. One month costs KES %s. Balance KES %s. Pay to Paybill %s, Account %s.',
      trim(to_char(coalesce(t.amount_kes, v_credit), 'FM999G999G990')), v_price, trim(to_char(v_price - v_credit, 'FM999G999G990')),
      coalesce(public.mpesa_paybill(), '-'), v_ref);
  end if;
  perform public.post_seller_message(b.id, 'payment', 'Payment received, balance due', v_body,
    jsonb_build_object('credit', v_credit, 'price', v_price), 'mpesa-part:' || coalesce(t.id::text, gen_random_uuid()::text));
  perform public.mpesa_queue_sms(b.id, b.application_id, b.phone, 'EpicMKT: ' || v_body, 'mpesa-part:' || coalesce(t.id::text, gen_random_uuid()::text) || ':sms');
  return jsonb_build_object('outcome', case when v_credit >= v_price then 'capped' else 'part_paid' end, 'credit', v_credit, 'price', v_price,
    'balance', greatest(v_price - v_credit, 0), 'business_id', b.id, 'business_name', b.name);
end $function$;

CREATE OR REPLACE FUNCTION public.queue_billing_notices(p_now timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b record;
  v_left integer;
  v_day text;
  v_kind text;
  v_key text;
  v_subject text;
  v_body text;
  v_name text;
  v_inapp integer;
  v_queued integer := 0;
  v_n integer;
  v_g integer;
begin
  v_inapp := public.generate_billing_notices(p_now);

  for b in
    select x.id, x.name, x.paid_until, x.phone, x.email, x.grace_days
      from public.businesses x
     where x.paid_until is not null and x.status in ('live', 'paused', 'suspended', 'expired')
  loop
    v_left := public.nairobi_day(b.paid_until) - public.nairobi_day(p_now);
    v_day := to_char(public.nairobi_day(b.paid_until), 'YYYY-MM-DD');
    v_g := public.grace_days_of(b.grace_days);
    v_name := left(b.name, 40);
    v_kind := null;

    if v_left in (7, 3, 1) then
      v_kind := 'reminder';
      v_key := format('reminder:%s:%s', v_left, v_day);
      v_subject := format('Your listing expires in %s day%s', v_left, case when v_left = 1 then '' else 's' end);
      v_body := format('EpicMKT: %s expires in %s day%s (%s). Renew to stay visible.',
        v_name, v_left, case when v_left = 1 then '' else 's' end, to_char(public.nairobi_day(b.paid_until), 'DD Mon YYYY'));
    elsif v_left = -1 and v_g > 0 then
      v_kind := 'grace';
      v_key := 'grace:' || v_day;
      v_subject := format('Your subscription has ended: %s day%s of grace', v_g, case when v_g = 1 then '' else 's' end);
      v_body := format('EpicMKT: %s has expired. You have %s day%s of grace. Renew now to stay visible.', v_name, v_g, case when v_g = 1 then '' else 's' end);
    elsif v_left between -(v_g + 3) and -(v_g + 1) then
      -- Only the first days after grace; sellers who lapsed long ago are not texted when this first runs.
      v_kind := 'expiry';
      v_key := 'expiry:' || v_day;
      v_subject := 'Your subscription has expired';
      v_body := format('EpicMKT: %s is now hidden from customers. Renew to bring it back.', v_name);
    end if;

    if v_kind is null then continue; end if;

    insert into public.messages (business_id, channel, kind, template_key, to_address, subject, body, status, transactional, scheduled_at, read_at, dedupe_key, data)
    values (b.id, 'sms', v_kind, 'billing_' || v_kind, b.phone, v_subject, v_body, 'queued', true, p_now, p_now, v_key || ':sms',
            jsonb_build_object('days_left', v_left))
    on conflict (business_id, dedupe_key) where dedupe_key is not null do nothing;
    get diagnostics v_n = row_count;
    v_queued := v_queued + v_n;

    if b.email is not null and b.email <> '' then
      insert into public.messages (business_id, channel, kind, template_key, to_address, subject, body, status, transactional, scheduled_at, read_at, dedupe_key, data)
      values (b.id, 'email', v_kind, 'billing_' || v_kind, b.email, v_subject, v_body, 'queued', true, p_now, p_now, v_key || ':email',
              jsonb_build_object('days_left', v_left))
      on conflict (business_id, dedupe_key) where dedupe_key is not null do nothing;
      get diagnostics v_n = row_count;
      v_queued := v_queued + v_n;
    end if;
  end loop;

  return jsonb_build_object('inApp', v_inapp, 'queued', v_queued);
end $function$;
