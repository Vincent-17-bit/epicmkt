-- 0138_renew_plan_choice.sql
-- Renew on Standard or Premium.
--
-- Until now a seller could only renew on the plan they were on. Premium could be bought mid-period (upgrade, prorated),
-- but nobody could go back to Standard, and a seller whose subscription had ended could not renew straight onto Premium.
-- Now the renewal says which plan it is for, and the money is applied for that plan whichever way it arrives (phone
-- prompt, Paybill with the Seller ID, or credit already held):
--
--   * one month costs the chosen plan's price in the shop's own category (plans.price_kes, as the admin sets it);
--   * the days still left in the current period move to the new plan at once: going up charges the prorated difference
--     for those days, going down gives it back as credit (plan_switch_quote, the same day count as a category change);
--     with no days left (grace or expired) nothing extra is charged or given back;
--   * the switch is applied first, then whole months are added at the new price, by the usual rule (carry on from the
--     paid-until date when paid by the end of the grace days, never more than max_prepay_months ahead).
--
-- The choice is a payment intent ('plan_switch', like an upgrade's), set when the seller picks the plan (seller page) or
-- presses Pay (phone prompt). Money that does not yet cover the switch and one month is held as credit with a message,
-- never turned into a month on the old plan. An intent older than 48 hours is dropped and the money renews the current plan.
--
-- The seller page asks for the plan only when seller_payment_instructions returns plan_choices (this migration), so the
-- page works the same before and after it is applied.

-- ---------------------------------------------------------------------------
-- 1. What moving the days left to another plan costs (or gives back).
-- ---------------------------------------------------------------------------
create or replace function public.plan_switch_quote(p_old integer, p_new integer, p_paid timestamptz, p_now timestamptz default now()) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  v_end date;
  v_days integer;
  v_left integer := 0;
  v_due integer := 0;
  v_back integer := 0;
begin
  if p_paid is not null and p_old is not null and p_new is not null and p_new <> p_old then
    v_end := public.nairobi_day(p_paid);
    v_days := v_end - public.add_calendar_month(v_end, -1);
    v_left := least(v_days, greatest(0, v_end - public.nairobi_day(p_now)));
    if p_new > p_old then
      v_due := ceil(((p_new - p_old)::numeric * v_left) / v_days)::integer;
    else
      v_back := floor(((p_old - p_new)::numeric * v_left) / v_days)::integer;
    end if;
  end if;
  return jsonb_build_object('switchDue', v_due, 'switchCredit', v_back, 'daysLeft', v_left, 'oldMonthlyPrice', p_old, 'newMonthlyPrice', p_new,
    'appliesFromNextRenewal', false);
end $$;

-- ---------------------------------------------------------------------------
-- 2. The quote: a renewal may name the plan (p_target). Everything else is as in 0136.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payment_quote(p_b businesses, p_purpose text, p_target text, p_category text, p_now timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_purpose text := p_purpose;
  v_old integer;
  v_new integer;
  v_app public.applications;
  v_state text := public.listing_state(p_b.paid_until, p_now, p_b.grace_days);
  v_amount integer;
  v_account text := p_b.seller_id;
  v_plan text := p_b.plan_key;
  v_cat text := p_b.category_id;
  v_quote jsonb;
  v_unit integer := public.business_unit_price(p_b);
  v_switch integer := 0;
begin
  select p.price_kes into v_old from public.plans p where p.category_id = p_b.category_id and p.plan_key = p_b.plan_key;
  if v_purpose is null then
    v_purpose := case when p_b.paid_until is null and not exists (select 1 from public.payments x where x.business_id = p_b.id and x.status = 'confirmed') then 'first' else 'renewal' end;
  end if;
  if v_purpose = 'first' then
    select * into v_app from public.applications a where a.id = p_b.application_id;
    -- A shop created before its first payment pays what its application was approved at (unchanged).
    v_amount := coalesce((v_app.plan_snapshot -> 'priceOverride' ->> 'amount')::integer, v_app.price_at_submission, v_unit);
    v_account := coalesce(v_app.reference_no, p_b.seller_id);
  elsif v_purpose = 'renewal' then
    -- 0138: renewing on the other plan. One month costs the target plan's price, and the days still left in the current
    -- period are moved to the new plan now: a dearer plan charges the prorated difference, a cheaper one gives it back as credit.
    if p_target is not null and p_target is distinct from p_b.plan_key then
      if p_target not in ('standard', 'premium') then raise exception 'invalid_plan'; end if;
      select p.price_kes into v_new from public.plans p where p.category_id = p_b.category_id and p.plan_key = p_target;
      if v_new is null or v_new <= 0 then raise exception 'invalid_plan'; end if;
      v_quote := public.plan_switch_quote(v_unit, v_new, p_b.paid_until, p_now) || jsonb_build_object('fromPlan', p_b.plan_key, 'toPlan', p_target);
      v_switch := (v_quote ->> 'switchDue')::integer - (v_quote ->> 'switchCredit')::integer;
      v_unit := v_new;
      v_plan := p_target;
    end if;
    v_amount := v_unit;
  elsif v_purpose = 'upgrade' then
    if p_b.plan_key <> 'standard' or p_target is distinct from 'premium' then raise exception 'invalid_upgrade'; end if;
    if v_state <> 'active' then raise exception 'renew_first'; end if;
    select p.price_kes into v_new from public.plans p where p.category_id = p_b.category_id and p.plan_key = 'premium';
    if v_new is null then raise exception 'invalid_upgrade'; end if;
    v_quote := public.category_change_quote(coalesce(v_old, v_unit), v_new, p_b.paid_until, p_now);
    v_amount := (v_quote ->> 'extraDueNow')::integer;
    v_plan := 'premium';
  elsif v_purpose = 'category_change' then
    select p.price_kes into v_new from public.plans p where p.category_id = p_category and p.plan_key = p_b.plan_key;
    if v_new is null then raise exception 'invalid_category'; end if;
    if v_new > coalesce(v_old, 0) and v_state <> 'active' then raise exception 'renew_first'; end if;
    v_quote := public.category_change_quote(coalesce(v_old, 0), v_new, p_b.paid_until, p_now);
    v_amount := (v_quote ->> 'extraDueNow')::integer;
    v_cat := p_category;
  else
    raise exception 'invalid_purpose';
  end if;
  return jsonb_build_object('purpose', v_purpose, 'amount_kes', v_amount, 'account', v_account, 'plan_key', v_plan, 'category_id', v_cat,
    'listing_state', v_state, 'grace_days', public.grace_days_of(p_b.grace_days), 'quote', v_quote, 'unit_price_kes', v_unit,
    'switch_kes', v_switch);
end $function$;

-- ---------------------------------------------------------------------------
-- 3. Apply a plan switch from the shop's credit. Going up records an "upgrade" payment for the days left (it shows in the
--    history and has a receipt); going down adds the unused days to the credit. Both are audited and the seller is told.
-- ---------------------------------------------------------------------------
create or replace function public.mpesa_plan_switch(p_business uuid, p_target text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  b public.businesses;
  q jsonb;
  v_due integer;
  v_back integer;
  v_from text;
  pay public.payments;
begin
  select * into b from public.businesses where id = p_business for update;
  if not found or b.status = 'deleted' then raise exception 'target_not_found'; end if;
  q := public.payment_quote(b, 'renewal', p_target, null);
  if q ->> 'plan_key' = b.plan_key then
    update public.businesses set pay_intent = null where id = b.id;
    return jsonb_build_object('outcome', 'same_plan', 'plan', b.plan_key);
  end if;
  v_from := b.plan_key;
  v_due := coalesce((q -> 'quote' ->> 'switchDue')::integer, 0);
  v_back := coalesce((q -> 'quote' ->> 'switchCredit')::integer, 0);
  if v_due > 0 then
    if b.credit_kes < v_due then raise exception 'not_enough_credit'; end if;
    insert into public.payments (business_id, amount_kes, method, reference, mpesa_code, status, kind, plan_key, category_id, account_ref, source, submitted_at)
    values (b.id, v_due, 'mpesa', 'CREDIT-' || left(gen_random_uuid()::text, 8), null, 'submitted', 'upgrade', q ->> 'plan_key', b.category_id, b.seller_id, 'auto', now())
    returning * into pay;
    update public.businesses set credit_kes = credit_kes - v_due, pay_intent = null where id = b.id;
    -- Confirming an upgrade payment moves the shop to its plan (and the price mirror follows by trigger).
    pay := public.payment_apply_confirmation(pay.id, 'auto');
  else
    update public.businesses set plan_key = q ->> 'plan_key', credit_kes = credit_kes + v_back, pay_intent = null where id = b.id;
    perform public.post_seller_message(b.id, 'payment', 'Plan changed',
      format('You are now on %s at KES %s a month.%s', initcap(q ->> 'plan_key'), trim(to_char((q ->> 'amount_kes')::integer, 'FM999G999G990')),
        case when v_back > 0 then format(' KES %s for the %s unused %s days is kept as credit toward your renewal.',
          trim(to_char(v_back, 'FM999G999G990')), q -> 'quote' ->> 'daysLeft', initcap(v_from)) else '' end),
      jsonb_build_object('from', v_from, 'to', q ->> 'plan_key', 'credited', v_back), 'plan-switch:' || b.id || ':' || extract(epoch from clock_timestamp())::text);
  end if;
  perform public.write_audit(b.id, 'plan_switched', 'business', b.id::text,
    jsonb_build_object('from', v_from, 'to', q ->> 'plan_key', 'charged', v_due, 'credited', v_back, 'payment_id', pay.id));
  return jsonb_build_object('outcome', 'switched', 'from', v_from, 'to', q ->> 'plan_key', 'charged', v_due, 'credited', v_back, 'payment_id', pay.id);
end $$;
revoke all on function public.mpesa_plan_switch(uuid, text) from public, anon, authenticated;
grant execute on function public.mpesa_plan_switch(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Crediting: a plan_switch intent is applied before the months. Everything else is as in 0136.
-- ---------------------------------------------------------------------------
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
  v_have numeric;
begin
  select * into b from public.businesses where id = p_business for update;
  if not found or b.status = 'deleted' then raise exception 'target_not_found'; end if;
  if p_tx is not null then select * into t from public.mpesa_transactions where id = p_tx; end if;
  v_price := public.business_unit_price(b);
  if v_price is null or v_price <= 0 then return jsonb_build_object('outcome', 'no_price', 'credit', b.credit_kes); end if;
  v_ref := b.seller_id;

  -- 0138: the seller chose the other plan when renewing. Switch first (the days left move to the new plan: charged or credited),
  -- then the months below are at the new plan's price. Until the money covers the switch and one month, hold it.
  if b.pay_intent is not null and b.pay_intent ->> 'purpose' = 'plan_switch' then
    begin
      if (b.pay_intent ->> 'set_at')::timestamptz <= now() - interval '48 hours' then raise exception 'intent_expired'; end if;
      v_q := public.payment_quote(b, 'renewal', b.pay_intent ->> 'target_plan', null);
      if v_q ->> 'plan_key' = b.plan_key then
        update public.businesses set pay_intent = null where id = b.id;
      else
        v_need := (v_q ->> 'amount_kes')::integer + greatest((v_q ->> 'switch_kes')::integer, 0);
        v_have := b.credit_kes + greatest(-(v_q ->> 'switch_kes')::integer, 0);
        if v_have >= v_need then
          perform public.mpesa_plan_switch(b.id, b.pay_intent ->> 'target_plan');
        else
          v_body := format('We received KES %s toward renewing on %s. The first month%s comes to KES %s, so KES %s more is needed. Pay it to Paybill %s, account %s.',
            trim(to_char(coalesce(t.amount_kes, b.credit_kes), 'FM999G999G990')), initcap(v_q ->> 'plan_key'),
            case when (v_q ->> 'switch_kes')::integer > 0 then ' and the move for the days left' else '' end,
            trim(to_char(v_need, 'FM999G999G990')), trim(to_char(v_need - v_have, 'FM999G999G990')), coalesce(public.mpesa_paybill(), '-'), v_ref);
          perform public.post_seller_message(b.id, 'payment', 'Payment received, balance due', v_body, jsonb_build_object('credit', b.credit_kes, 'price', v_need),
            'mpesa-hold:' || coalesce(t.id::text, gen_random_uuid()::text));
          perform public.mpesa_queue_sms(b.id, b.application_id, b.phone, 'EpicMKT: ' || v_body, 'mpesa-hold:' || coalesce(t.id::text, gen_random_uuid()::text) || ':sms');
          return jsonb_build_object('outcome', 'held', 'credit', b.credit_kes, 'price', v_need, 'balance', v_need - v_have, 'business_id', b.id, 'business_name', b.name);
        end if;
      end if;
    exception when others then
      -- The choice no longer applies (too old, or the plan has no price). The money is a renewal on the current plan.
      update public.businesses set pay_intent = null where id = b.id;
    end;
    select * into b from public.businesses where id = p_business for update;
    v_price := public.business_unit_price(b);
    if v_price is null or v_price <= 0 then return jsonb_build_object('outcome', 'no_price', 'credit', b.credit_kes); end if;
  end if;

  -- The seller opened an upgrade or category-change payment: that is what this money is for. Apply it when the credit
  -- covers it; until then hold it instead of turning it into a renewal month.
  if b.pay_intent is not null and (b.pay_intent ->> 'set_at')::timestamptz > now() - interval '48 hours' then
    begin
      v_q := public.payment_quote(b, b.pay_intent ->> 'purpose', b.pay_intent ->> 'target_plan', b.pay_intent ->> 'category');
      v_need := (v_q ->> 'amount_kes')::integer;
      if v_need > 0 and b.credit_kes >= v_need then
        v_intent := public.mpesa_apply_purpose(b.id, b.pay_intent ->> 'purpose', b.pay_intent ->> 'target_plan', b.pay_intent ->> 'category', nullif(b.pay_intent ->> 'change_id', '')::uuid);
        select * into b from public.businesses where id = p_business for update;
        -- An upgrade changes the plan, so the price of a renewal month changes with it.
        v_price := coalesce(public.business_unit_price(b), v_price);
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
  -- Same rule as a manual confirmation: paying on the last day or within the grace days carries on from the old date.
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

-- ---------------------------------------------------------------------------
-- 5. Phone prompts: the amount includes the switch, and the request remembers the plan. Everything else is as in 0136.
-- ---------------------------------------------------------------------------
create or replace function public.mpesa_stk_prepare(
  p_type text, p_id uuid, p_purpose text, p_target_plan text, p_category text, p_change_id uuid, p_months integer, p_phone text,
  p_by text, p_actor uuid default null, p_ip_hash text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_phone text := public.mpesa_stk_phone(p_phone);
  v_max integer := coalesce((select (s.value #>> '{}')::integer from public.site_settings s where s.key = 'max_prepay_months'), 12);
  v_months integer := greatest(1, coalesce(p_months, 1));
  v_open public.mpesa_stk_requests;
  r public.mpesa_stk_requests;
  a public.applications;
  b public.businesses;
  q jsonb;
  v_purpose text;
  v_unit integer;
  v_credit numeric := 0;
  v_amount numeric;
  v_account text;
  v_desc text;
  v_today date := public.nairobi_day(now());
  v_paid date;
  v_start date;
  v_allowed integer;
  v_switch integer := 0;
  v_plan text;
begin
  if p_type not in ('application', 'business') or p_id is null then raise exception 'invalid_target'; end if;
  if p_by not in ('seller', 'applicant', 'admin') then raise exception 'invalid_actor'; end if;
  if v_phone is null then raise exception 'invalid_phone'; end if;
  if p_months is not null and (p_months < 1 or p_months > 24) then raise exception 'invalid_months'; end if;
  perform pg_advisory_xact_lock(hashtext('mpesa-stk:' || p_id::text));

  -- A prompt is already on its way or on the phone: answer with it, so a double press never sends two prompts.
  select * into v_open from public.mpesa_stk_requests s
   where coalesce(s.business_id, s.application_id) = p_id and s.status in ('creating', 'pending')
   order by s.created_at desc limit 1 for update;
  if found then
    if coalesce(v_open.sent_at, v_open.created_at) > now() - interval '75 seconds' then
      return jsonb_build_object('reused', true, 'request', public.mpesa_stk_view(v_open));
    end if;
    -- Older than any prompt stays open on a phone. A late success for it is still credited (see mpesa_stk_process).
    update public.mpesa_stk_requests set status = case when status = 'creating' then 'error' else 'expired' end,
      note = coalesce(note, 'replaced by a newer request'), completed_at = now() where id = v_open.id;
  end if;

  if p_type = 'application' then
    select * into a from public.applications where id = p_id for update;
    if not found then raise exception 'target_not_found'; end if;
    if exists (select 1 from public.businesses y where y.application_id = a.id and y.status <> 'deleted') then raise exception 'already_activated'; end if;
    if a.status = 'payment_confirming' then raise exception 'already_paid'; end if;
    if a.status <> 'approved' then raise exception 'not_payable'; end if;
    v_purpose := 'first';
    v_unit := public.mpesa_price(a);
    if v_unit is null or v_unit <= 0 then raise exception 'not_priced'; end if;
    v_months := least(v_months, v_max);
    v_credit := a.credit_kes;
    v_amount := v_unit * v_months - v_credit;
    v_account := public.mpesa_stk_account(a.reference_no);
  else
    select * into b from public.businesses where id = p_id for update;
    if not found or b.status = 'deleted' then raise exception 'target_not_found'; end if;
    q := public.payment_quote(b, p_purpose, p_target_plan, p_category);
    v_purpose := q ->> 'purpose';
    v_unit := (q ->> 'amount_kes')::integer;
    -- 0138: renewing on the other plan adds (or takes off) the difference for the days left.
    v_switch := coalesce((q ->> 'switch_kes')::integer, 0);
    v_plan := case when v_purpose = 'renewal' and (q ->> 'plan_key') is distinct from b.plan_key then q ->> 'plan_key' end;
    if v_unit is null or v_unit <= 0 then raise exception 'nothing_to_pay'; end if;
    if v_purpose = 'category_change' and (p_change_id is null or not exists (
         select 1 from public.change_requests c where c.id = p_change_id and c.business_id = b.id and c.status = 'pending'
            and c.field = 'category_id' and c.new_value = p_category)) then
      raise exception 'change_not_found';
    end if;
    v_credit := b.credit_kes;
    if v_purpose in ('first', 'renewal') then
      -- Never ask for more months than the prepay limit lets the crediting add.
      v_paid := case when b.paid_until is null then null else public.nairobi_day(b.paid_until) end;
      v_start := case when v_paid is not null and v_today <= v_paid + public.grace_days_of(b.grace_days) then v_paid else v_today end;
      v_allowed := greatest(0, (extract(year from age((v_today + (v_max || ' months')::interval)::date, v_start)) * 12
                              + extract(month from age((v_today + (v_max || ' months')::interval)::date, v_start)))::integer);
      if v_allowed < 1 then raise exception 'paid_ahead'; end if;
      v_months := least(v_months, v_allowed);
      v_amount := v_unit * v_months + v_switch - v_credit;
    else
      v_months := 1;
      v_amount := v_unit - v_credit;
    end if;
    v_account := public.mpesa_stk_account(b.seller_id);
    -- If the Paybill confirmation for this payment arrives before the STK callback, it must be applied for the same purpose.
    update public.businesses set pay_intent = case when v_purpose in ('upgrade', 'category_change') then
        jsonb_build_object('purpose', v_purpose, 'target_plan', p_target_plan, 'category', p_category, 'change_id', p_change_id, 'set_at', now())
        when v_plan is not null then jsonb_build_object('purpose', 'plan_switch', 'target_plan', v_plan, 'set_at', now())
      end where id = b.id;
  end if;

  v_amount := ceil(v_amount);
  if v_amount <= 0 then raise exception 'use_credit'; end if;
  if v_amount > 250000 then raise exception 'amount_too_large'; end if;
  v_desc := case v_purpose when 'first' then 'Listing fee' when 'renewal' then 'Renewal' when 'upgrade' then 'Upgrade' else 'Category fee' end;

  insert into public.mpesa_stk_requests (target_type, application_id, business_id, purpose, target_plan, category_id, change_id, months,
    unit_price, credit_used, amount_kes, phone, account_ref, description, initiated_by, actor_id, ip_hash)
  values (p_type, a.id, b.id, v_purpose, case when v_purpose = 'renewal' then v_plan else p_target_plan end, p_category, p_change_id, v_months,
    v_unit, least(v_credit, v_unit * v_months), v_amount::integer, v_phone, v_account, v_desc, p_by, p_actor, p_ip_hash)
  returning * into r;

  insert into public.audit_log (business_id, actor_id, actor_role, action, entity, entity_id, data)
  values (b.id, p_actor, case when p_by = 'admin' then 'admin' when p_by = 'seller' then 'seller' else 'system' end, 'stk_requested',
          'mpesa_stk_request', r.id::text,
          jsonb_build_object('amount', r.amount_kes, 'months', r.months, 'purpose', r.purpose, 'plan', r.target_plan, 'application_id', a.id, 'by', p_by));
  return jsonb_build_object('reused', false, 'request', public.mpesa_stk_view(r));
end $$;
revoke all on function public.mpesa_stk_prepare(text, uuid, text, text, text, uuid, integer, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.mpesa_stk_prepare(text, uuid, text, text, text, uuid, integer, text, text, uuid, text) to service_role;

create or replace function public.mpesa_stk_settle(p_id uuid, p_receipt text, p_amount numeric, p_phone text, p_time timestamptz,
  p_callback uuid, p_verification text, p_raw jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  r public.mpesa_stk_requests;
  t public.mpesa_transactions;
  v_target uuid;
  v_new boolean := false;
  res jsonb;
begin
  select * into r from public.mpesa_stk_requests where id = p_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if r.status = 'paid' then return jsonb_build_object('outcome', 'duplicate', 'duplicate', true, 'request_id', r.id); end if;
  v_target := coalesce(r.business_id, r.application_id);

  -- The Paybill (C2B) confirmation of the same payment may have arrived first (or be arriving right now): link to it,
  -- never credit twice. The receipt is unique in the ledger, so of two racing writers exactly one inserts.
  select * into t from public.mpesa_transactions where trans_id = p_receipt for update;
  if not found then
    insert into public.mpesa_transactions (trans_id, trans_time, amount_kes, account, payer_phone, msisdn_hash, short_code, raw, callback_id, channel, stk_request_id)
    values (p_receipt, coalesce(p_time, now()), p_amount, r.account_ref, nullif(p_phone, ''), public.msisdn_hash(coalesce(nullif(p_phone, ''), r.phone)),
            nullif(btrim(coalesce(p_raw ->> 'BusinessShortCode', '')), ''), coalesce(p_raw, '{}'), p_callback, 'stk', r.id)
    on conflict (trans_id) do nothing
    returning * into t;
    if t.id is null then
      select * into t from public.mpesa_transactions where trans_id = p_receipt for update;
    else
      v_new := true;
    end if;
  end if;
  if t.state <> 'needs_assignment' then
    -- Already credited (the Paybill confirmation matched it first). Nothing more to do with the money.
    res := jsonb_build_object('outcome', 'already_recorded', 'state', t.state,
      'business_id', t.business_id, 'application_id', t.application_id);
  elsif v_target is null then
    update public.mpesa_transactions set note = 'stk_target_deleted' where id = t.id;
    perform public.notify_admin('payment_unmatched', null, jsonb_build_object('code', p_receipt, 'amount', p_amount, 'note', 'stk_target_deleted'));
    res := jsonb_build_object('outcome', 'needs_assignment', 'note', 'stk_target_deleted');
  else
    if r.target_type = 'business' then
      -- The request says what the money is for; that beats any older intent.
      update public.businesses x set pay_intent = case when r.purpose in ('upgrade', 'category_change') then
        jsonb_build_object('purpose', r.purpose, 'target_plan', r.target_plan, 'category', r.category_id, 'change_id', r.change_id, 'set_at', now())
        -- 0138: a renewal on the other plan.
        when r.purpose = 'renewal' and r.target_plan is not null and r.target_plan is distinct from x.plan_key then
        jsonb_build_object('purpose', 'plan_switch', 'target_plan', r.target_plan, 'set_at', now()) end
       where id = r.business_id;
    end if;
    begin
      res := public.mpesa_credit_target(t.id, r.target_type, v_target, 'stk');
    exception when others then
      -- The money is recorded; the admin assigns it by hand with the request's shop as the suggestion.
      update public.mpesa_transactions set state = 'needs_assignment', note = 'credit_failed: ' || left(sqlerrm, 200),
        candidates = jsonb_build_array(public.mpesa_candidate(r.target_type, v_target, 'paid by phone prompt')) where id = t.id;
      perform public.notify_admin('payment_unmatched', null, jsonb_build_object('code', p_receipt, 'amount', p_amount, 'account', r.account_ref, 'note', 'credit_failed'));
      res := jsonb_build_object('outcome', 'needs_assignment', 'note', 'credit_failed');
    end;
  end if;
  if not v_new then
    update public.mpesa_transactions set channel = 'stk', stk_request_id = r.id where id = t.id;
  end if;

  update public.mpesa_stk_requests set status = 'paid', mpesa_receipt = p_receipt, paid_amount = p_amount, paid_phone = nullif(p_phone, ''),
    paid_at = coalesce(p_time, now()), verification = p_verification, tx_id = t.id, outcome = res, result_code = '0',
    callback_id = coalesce(p_callback, callback_id), completed_at = now()
   where id = r.id returning * into r;
  insert into public.audit_log (business_id, actor_id, actor_role, action, entity, entity_id, data)
  values (coalesce(r.business_id, (res ->> 'business_id')::uuid), null, 'system', 'stk_paid', 'mpesa_stk_request', r.id::text,
          jsonb_build_object('receipt', p_receipt, 'amount', p_amount, 'outcome', res ->> 'outcome', 'verification', p_verification));
  return res || jsonb_build_object('duplicate', false, 'request_id', r.id, 'code', p_receipt, 'amount', p_amount, 'account', r.account_ref,
    'application_id', coalesce(res ->> 'application_id', r.application_id::text));
end $$;
revoke all on function public.mpesa_stk_settle(uuid, text, numeric, text, timestamptz, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.mpesa_stk_settle(uuid, text, numeric, text, timestamptz, uuid, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 6. The seller page says which plan the renewal is for (the same call it makes for an upgrade), and credit already held can
--    pay a renewal on the other plan.
-- ---------------------------------------------------------------------------
create or replace function public.seller_set_payment_intent(p_purpose text default null, p_target_plan text default null, p_category text default null, p_change_id uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_b public.businesses;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select * into v_b from public.businesses where id = v_id;
  if p_purpose in ('upgrade', 'category_change') then
    update public.businesses set pay_intent = jsonb_build_object('purpose', p_purpose, 'target_plan', p_target_plan, 'category', p_category,
      'change_id', p_change_id, 'set_at', now()) where id = v_id;
  elsif coalesce(p_purpose, 'renewal') = 'renewal' and p_target_plan in ('standard', 'premium') and p_target_plan is distinct from v_b.plan_key
        and (v_b.paid_until is not null or exists (select 1 from public.payments x where x.business_id = v_id and x.status = 'confirmed')) then
    update public.businesses set pay_intent = jsonb_build_object('purpose', 'plan_switch', 'target_plan', p_target_plan, 'set_at', now()) where id = v_id;
  else
    update public.businesses set pay_intent = null where id = v_id;
  end if;
end $$;
revoke all on function public.seller_set_payment_intent(text, text, text, uuid) from public, anon;
grant execute on function public.seller_set_payment_intent(text, text, text, uuid) to authenticated;

create or replace function public.seller_apply_credit(p_purpose text default null, p_target_plan text default null, p_category text default null, p_change_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid := public.my_business_id();
  b public.businesses;
  q jsonb;
  v_need integer;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext(v_id::text || 'payments'));
  select * into b from public.businesses where id = v_id for update;
  q := public.payment_quote(b, p_purpose, p_target_plan, p_category);
  v_need := (q ->> 'amount_kes')::integer + coalesce((q ->> 'switch_kes')::integer, 0);
  if (q ->> 'amount_kes')::integer <= 0 then raise exception 'nothing_to_pay'; end if;
  if b.credit_kes < v_need then raise exception 'not_enough_credit'; end if;
  if (q ->> 'purpose') in ('first', 'renewal') then
    if (q ->> 'purpose') = 'renewal' and (q ->> 'plan_key') is distinct from b.plan_key then
      update public.businesses set pay_intent = jsonb_build_object('purpose', 'plan_switch', 'target_plan', q ->> 'plan_key', 'set_at', now()) where id = b.id;
    end if;
    return public.mpesa_settle_business(b.id, null);
  end if;
  return public.mpesa_apply_purpose(b.id, q ->> 'purpose', p_target_plan, p_category, p_change_id);
end $$;
revoke all on function public.seller_apply_credit(text, text, text, uuid) from public, anon;
grant execute on function public.seller_apply_credit(text, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. The seller page: the plans this shop can renew on, and the amount due including any switch.
-- ---------------------------------------------------------------------------
create or replace function public.seller_payment_instructions(p_purpose text default null, p_target_plan text default null, p_category text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid := public.my_business_id();
  v_b public.businesses;
  v_q jsonb;
  v_m jsonb;
  v_ok boolean;
  v_amount integer;
  v_switch integer;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select * into v_b from public.businesses where id = v_id;
  v_q := public.payment_quote(v_b, p_purpose, p_target_plan, p_category);
  v_amount := (v_q ->> 'amount_kes')::integer;
  v_switch := coalesce((v_q ->> 'switch_kes')::integer, 0);
  select s.value into v_m from public.site_settings s where s.key = 'mpesa';
  v_ok := v_m is not null and coalesce(btrim(v_m ->> 'number'), '') <> '';
  return v_q || jsonb_build_object(
    'configured', v_ok,
    'method', case when v_ok then coalesce(v_m ->> 'type', 'paybill') end,
    'number', case when v_ok then v_m ->> 'number' end,
    'name', case when v_ok then v_m ->> 'name' end,
    'stk', v_ok and coalesce((v_m ->> 'stk')::boolean, false),
    'phone', v_b.phone,
    'credit_kes', v_b.credit_kes,
    'amount_due_kes', greatest(v_amount + v_switch - v_b.credit_kes, 0)::integer,
    -- 0138: the plans this shop can renew on (its own category), so the seller can pick Standard or Premium.
    'current_plan', v_b.plan_key,
    'plan_choices', (select coalesce(jsonb_object_agg(p.plan_key, p.price_kes), '{}'::jsonb) from public.plans p
                      where p.category_id = v_b.category_id and p.price_kes > 0),
    'max_prepay_months', coalesce((select (s.value #>> '{}')::integer from public.site_settings s where s.key = 'max_prepay_months'), 12),
    'has_open_submission', exists (select 1 from public.payments x where x.business_id = v_id and x.status = 'submitted'));
end $$;
