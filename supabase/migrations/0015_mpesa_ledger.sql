-- M-Pesa Paybill ledger (migration 0015).
--
-- Principles (see docs/PAYMENTS.md for the full scenario list):
--   1. Nothing is lost. Every Safaricom callback is stored untouched before anything is parsed.
--   2. Money is credit. Each payment is added to a credit balance on the application (before activation) or the
--      business (after). Whole months are taken from that balance; the rest waits. So a short payment, a top-up,
--      a 3-month prepayment and an overpayment are all the same mechanism.
--   3. The account number is a short reference (application reference, then Seller ID), never a business name.
--      A name is only a fallback, and when two shops share a name the system never guesses between them.
--   4. Renewals for existing sellers apply automatically. First-time activation still needs an admin click.

-- ---------------------------------------------------------------------------
-- 1. Raw inbox: every callback, exactly as received.
-- ---------------------------------------------------------------------------
create table if not exists public.mpesa_callbacks (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  kind text not null,
  source_ip text,
  body jsonb not null,
  trans_id text,
  processed boolean not null default false,
  error text,
  dismissed_at timestamptz
);
create index if not exists mpesa_callbacks_unprocessed_idx on public.mpesa_callbacks (received_at desc)
  where not processed and dismissed_at is null;
alter table public.mpesa_callbacks enable row level security;
drop policy if exists "admin read mpesa_callbacks" on public.mpesa_callbacks;
create policy "admin read mpesa_callbacks" on public.mpesa_callbacks for select to authenticated using (public.is_admin());
revoke all on public.mpesa_callbacks from anon;
grant select on public.mpesa_callbacks to authenticated;
grant all on public.mpesa_callbacks to service_role;

-- ---------------------------------------------------------------------------
-- 2. Credit balances and the transaction ledger.
-- ---------------------------------------------------------------------------
alter table public.applications add column if not exists credit_kes numeric(12,2) not null default 0 check (credit_kes >= 0);
alter table public.businesses   add column if not exists credit_kes numeric(12,2) not null default 0 check (credit_kes >= 0);
-- What the seller said they are paying for (an upgrade or a category change). Without it, money for an upgrade would
-- look like a renewal. It is set by the portal when the seller opens that payment, and expires after 48 hours.
alter table public.businesses   add column if not exists pay_intent jsonb;

drop view if exists public.admin_payment_queue;
drop function if exists public.mpesa_record_c2b(text, numeric, text, text, text, text, timestamptz, jsonb);
alter table public.mpesa_transactions drop constraint if exists mpesa_transactions_trans_id_check;
alter table public.mpesa_transactions drop column if exists match_status;
alter table public.mpesa_transactions
  add column if not exists state text not null default 'needs_assignment'
    check (state in ('needs_assignment','credited','applied','ignored')),
  add column if not exists target_type text check (target_type in ('application','business')),
  add column if not exists business_id uuid references public.businesses(id) on delete set null,
  add column if not exists match_method text,
  add column if not exists candidates jsonb not null default '[]',
  add column if not exists note text,
  add column if not exists msisdn_hash text,
  add column if not exists payer_phone text,
  add column if not exists payment_id uuid references public.payments(id) on delete set null,
  add column if not exists applied_at timestamptz,
  add column if not exists callback_id uuid references public.mpesa_callbacks(id) on delete set null;
create index if not exists mpesa_transactions_business_idx on public.mpesa_transactions (business_id) where business_id is not null;
create index if not exists mpesa_transactions_state_idx on public.mpesa_transactions (state);

insert into public.site_settings(key, value) values ('max_prepay_months', '12')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Small helpers.
-- ---------------------------------------------------------------------------
-- "Upendo Shop", "upendo  shop" and "UPENDO-SHOP" are the same key; so are "epm 2026 abc234" and "EPM-2026-ABC234".
create or replace function public.norm_key(p text) returns text language sql immutable as
$$ select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')) $$;

-- Safaricom sends the payer phone as the SHA-256 of the 12 digit number (254712345678). Hashing our own known
-- numbers the same way lets us recognise a payer without ever seeing the number in the callback.
create or replace function public.msisdn_hash(p text) returns text
language plpgsql immutable set search_path = public, extensions as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if d = '' then return null; end if;
  if length(d) = 10 and left(d, 1) = '0' then d := '254' || substr(d, 2);
  elsif length(d) = 9 then d := '254' || d;
  end if;
  return encode(digest(d, 'sha256'), 'hex');
end $$;

create or replace function public.entity_has_phone(p_type text, p_id uuid, p_hash text) returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
declare r boolean := false;
begin
  if p_hash is null then return false; end if;
  if p_type = 'application' then
    select exists (
      select 1 from public.applications a,
        lateral (select a.phone as x union all select a.alt_phone union all select a.whatsapp
                 union all select jsonb_array_elements_text(case when jsonb_typeof(a.business_phones) = 'array' then a.business_phones else '[]'::jsonb end)) s
      where a.id = p_id and public.msisdn_hash(s.x) = p_hash) into r;
  else
    select exists (
      select 1 from public.businesses b,
        lateral (select b.phone as x union all select to_jsonb(b) ->> 'whatsapp') s
      where b.id = p_id and public.msisdn_hash(s.x) = p_hash) into r;
  end if;
  return r;
end $$;

create or replace function public.mpesa_candidate(p_type text, p_id uuid, p_reason text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('type', 'application', 'id', a.id, 'name', a.business_name, 'ref', a.reference_no, 'town', a.town,
                            'status', a.status, 'reason', p_reason)
    from public.applications a where p_type = 'application' and a.id = p_id
  union all
  select jsonb_build_object('type', 'business', 'id', b.id, 'name', b.name, 'ref', b.seller_id, 'town', b.town,
                            'status', b.status, 'reason', p_reason)
    from public.businesses b where p_type = 'business' and b.id = p_id
$$;

create or replace function public.mpesa_price(p_app public.applications) returns integer
language sql immutable as
$$ select coalesce((p_app.plan_snapshot -> 'priceOverride' ->> 'amount')::integer, p_app.price_at_submission) $$;

-- Queue an SMS for a seller or applicant. Delivered by the same dispatcher as every other queued message.
create or replace function public.mpesa_queue_sms(p_business uuid, p_application uuid, p_to text, p_body text, p_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_to is null or btrim(p_to) = '' then return; end if;
  insert into public.messages (business_id, application_id, channel, kind, template_key, to_address, body, status, transactional, scheduled_at, dedupe_key)
  values (p_business, p_application, 'sms', 'payment', 'mpesa_auto', p_to, left(p_body, 1000), 'queued', true, now(), p_key)
  on conflict do nothing;
end $$;

create or replace function public.mpesa_paybill() returns text
language sql stable security definer set search_path = public as
$$ select nullif(btrim(s.value ->> 'number'), '') from public.site_settings s where s.key = 'mpesa' $$;

-- ---------------------------------------------------------------------------
-- 4. Resolve an account number to a target. Never guesses between two shops.
-- Order: application reference, Seller ID, unique business name, then suggestions only.
-- ---------------------------------------------------------------------------
create or replace function public.mpesa_resolve(p_account text, p_hash text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  k text := public.norm_key(p_account);
  a public.applications;
  b public.businesses;
  cands jsonb := '[]';
  narrowed jsonb;
  n integer;
  first_c jsonb;
begin
  if k = '' then
    return jsonb_build_object('note', 'no_account', 'candidates', public.mpesa_suggest('', p_hash));
  end if;

  select * into a from public.applications x where public.norm_key(x.reference_no) = k;
  if found then
    select * into b from public.businesses y where y.application_id = a.id and y.status <> 'deleted';
    if found then return jsonb_build_object('type', 'business', 'id', b.id, 'method', 'reference'); end if;
    if a.status in ('rejected', 'draft') then
      return jsonb_build_object('note', 'application_' || a.status, 'candidates', jsonb_build_array(public.mpesa_candidate('application', a.id, 'reference')));
    end if;
    return jsonb_build_object('type', 'application', 'id', a.id, 'method', 'reference');
  end if;

  select * into b from public.businesses y where public.norm_key(y.seller_id) = k and y.status <> 'deleted';
  if found then return jsonb_build_object('type', 'business', 'id', b.id, 'method', 'seller_id'); end if;

  select coalesce(jsonb_agg(c), '[]') into cands from (
    select public.mpesa_candidate('business', y.id, 'name') as c
      from public.businesses y where public.norm_key(y.name) = k and y.status <> 'deleted'
    union all
    select public.mpesa_candidate('application', x.id, 'name')
      from public.applications x
      where public.norm_key(x.business_name) = k and x.status not in ('rejected', 'activated', 'draft')
        and not exists (select 1 from public.businesses y where y.application_id = x.id)
  ) s;
  n := jsonb_array_length(cands);
  if n = 1 then
    first_c := cands -> 0;
    return jsonb_build_object('type', first_c ->> 'type', 'id', (first_c ->> 'id')::uuid, 'method', 'name');
  elsif n > 1 then
    -- Two shops with the same name (Upendo Shop in Maseno and in Kiambu): the payer's phone decides, but only
    -- when exactly one of them matches. Otherwise the admin chooses, with the towns shown side by side.
    select coalesce(jsonb_agg(c), '[]') into narrowed
      from jsonb_array_elements(cands) c
      where public.entity_has_phone(c ->> 'type', (c ->> 'id')::uuid, p_hash);
    if jsonb_array_length(narrowed) = 1 then
      first_c := narrowed -> 0;
      return jsonb_build_object('type', first_c ->> 'type', 'id', (first_c ->> 'id')::uuid, 'method', 'name+phone');
    end if;
    return jsonb_build_object('note', 'ambiguous_name', 'candidates', cands);
  end if;

  return jsonb_build_object('note', 'no_match', 'candidates', public.mpesa_suggest(k, p_hash));
end $$;

-- Suggestions for the admin: a near miss on the reference (same first characters) or a payer phone we know.
create or replace function public.mpesa_suggest(p_key text, p_hash text) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(c), '[]') from (
    select public.mpesa_candidate('application', x.id, case when public.entity_has_phone('application', x.id, p_hash) then 'payer phone' else 'similar reference' end) as c
      from public.applications x
      where x.status not in ('rejected', 'draft') and not exists (select 1 from public.businesses y where y.application_id = x.id)
        and ((length(p_key) >= 8 and public.norm_key(x.reference_no) like left(p_key, 8) || '%') or public.entity_has_phone('application', x.id, p_hash))
    union all
    select public.mpesa_candidate('business', y.id, case when public.entity_has_phone('business', y.id, p_hash) then 'payer phone' else 'similar Seller ID' end)
      from public.businesses y
      where y.status <> 'deleted'
        and ((length(p_key) >= 6 and public.norm_key(y.seller_id) like left(p_key, 6) || '%') or public.entity_has_phone('business', y.id, p_hash))
    limit 6
  ) s
$$;

-- ---------------------------------------------------------------------------
-- 4b. Spend credit on an upgrade or a category change (the same steps as a confirmed payment, funded from credit).
-- ---------------------------------------------------------------------------
create or replace function public.mpesa_apply_purpose(p_business uuid, p_purpose text, p_target text, p_category text, p_change uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  b public.businesses;
  q jsonb;
  v_amount integer;
  pay public.payments;
begin
  select * into b from public.businesses where id = p_business for update;
  q := public.payment_quote(b, p_purpose, p_target, p_category);
  v_amount := (q ->> 'amount_kes')::integer;
  if v_amount <= 0 then raise exception 'nothing_to_pay'; end if;
  if b.credit_kes < v_amount then raise exception 'not_enough_credit'; end if;
  if (q ->> 'purpose') = 'category_change' then
    if p_change is null or not exists (select 1 from public.change_requests c where c.id = p_change and c.business_id = b.id and c.status = 'pending' and c.field = 'category_id' and c.new_value = p_category) then
      raise exception 'change_not_found';
    end if;
  end if;
  insert into public.payments (business_id, amount_kes, method, reference, mpesa_code, status, kind, plan_key, category_id, change_request_id, account_ref, source, submitted_at)
  values (b.id, v_amount, 'mpesa', 'CREDIT-' || left(gen_random_uuid()::text, 8), null, 'submitted', q ->> 'purpose', q ->> 'plan_key', q ->> 'category_id',
          case when (q ->> 'purpose') = 'category_change' then p_change end, q ->> 'account', 'auto', now())
  returning * into pay;
  update public.businesses set credit_kes = credit_kes - v_amount, pay_intent = null where id = b.id;
  pay := public.payment_apply_confirmation(pay.id, 'auto');
  return jsonb_build_object('outcome', 'applied', 'payment_id', pay.id, 'receipt_no', pay.receipt_no, 'kind', pay.kind);
end $$;
revoke all on function public.mpesa_apply_purpose(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.mpesa_apply_purpose(uuid, text, text, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Settle a business: turn credit into whole months, as many as the credit and the prepay cap allow.
--    Renewals and prepayments are the same thing: KES 500 -> 1 month, KES 1,500 -> 3 months, KES 1,600 -> 3 months
--    and KES 100 stays as credit. KES 300 -> nothing yet; the next KES 200 completes the month.
-- ---------------------------------------------------------------------------
create or replace function public.mpesa_settle_business(p_business uuid, p_tx uuid default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
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
        v_body := format('We received KES %s toward your %s. It costs KES %s, so KES %s more is needed. Pay it to Paybill %s, account %s.',
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
  v_start := case when v_paid is not null and v_today <= v_paid + 1 then v_paid else v_today end;
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

    v_body := format('We received your M-Pesa payment. %s month%s added: your listing is paid until %s.%s Receipt %s.',
      v_months, case when v_months = 1 then '' else 's' end, to_char(v_end, 'DD Mon YYYY'),
      case when v_credit > 0 then format(' KES %s is kept as credit toward your next payment.', trim(to_char(v_credit, 'FM999G999G990'))) else '' end,
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
    v_body := format('We received your payment, but your listing is already paid ahead for the maximum of %s months. KES %s is kept as credit and will be used when it is due.',
      v_max, trim(to_char(v_credit, 'FM999G999G990')));
  else
    v_body := format('We received KES %s. One month costs KES %s, so KES %s more is needed. Pay it to Paybill %s, account %s.',
      trim(to_char(coalesce(t.amount_kes, v_credit), 'FM999G999G990')), v_price, trim(to_char(v_price - v_credit, 'FM999G999G990')),
      coalesce(public.mpesa_paybill(), '-'), v_ref);
  end if;
  perform public.post_seller_message(b.id, 'payment', 'Payment received, balance due', v_body,
    jsonb_build_object('credit', v_credit, 'price', v_price), 'mpesa-part:' || coalesce(t.id::text, gen_random_uuid()::text));
  perform public.mpesa_queue_sms(b.id, b.application_id, b.phone, 'EpicMKT: ' || v_body, 'mpesa-part:' || coalesce(t.id::text, gen_random_uuid()::text) || ':sms');
  return jsonb_build_object('outcome', case when v_credit >= v_price then 'capped' else 'part_paid' end, 'credit', v_credit, 'price', v_price,
    'balance', greatest(v_price - v_credit, 0), 'business_id', b.id, 'business_name', b.name);
end $$;
revoke all on function public.mpesa_settle_business(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mpesa_settle_business(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Put a transaction's money on its target. Used by the automatic matcher and by the admin "assign" action.
-- ---------------------------------------------------------------------------
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
      v_body := format('We received KES %s for %s. We are confirming your payment and will send your login details shortly.', trim(to_char(t.amount_kes, 'FM999G999G990')), a.business_name);
      perform public.mpesa_queue_sms(null, a.id, a.phone, 'EpicMKT: ' || v_body, 'mpesa:' || t.id || ':sms');
      return jsonb_build_object('outcome', 'ready', 'application_id', a.id, 'reference_no', a.reference_no, 'business_name', a.business_name, 'credit', a.credit_kes);
    elsif a.status = 'payment_confirming' then
      return jsonb_build_object('outcome', 'extra_credit', 'application_id', a.id, 'reference_no', a.reference_no, 'business_name', a.business_name, 'credit', a.credit_kes);
    elsif a.status = 'approved' then
      v_body := format('We received KES %s for %s. One month costs KES %s, so KES %s more is needed. Pay it to Paybill %s, account %s.',
        trim(to_char(t.amount_kes, 'FM999G999G990')), a.business_name, v_price, trim(to_char(v_price - a.credit_kes, 'FM999G999G990')),
        coalesce(public.mpesa_paybill(), '-'), a.reference_no);
      perform public.mpesa_queue_sms(null, a.id, a.phone, 'EpicMKT: ' || v_body, 'mpesa:' || t.id || ':sms');
      return jsonb_build_object('outcome', 'part_paid', 'application_id', a.id, 'reference_no', a.reference_no, 'business_name', a.business_name,
        'credit', a.credit_kes, 'balance', v_price - a.credit_kes);
    end if;
    -- Paid before approval. The money is safe; the approval step moves it forward.
    v_body := format('We received KES %s for %s. We will use it as soon as your application is approved.', trim(to_char(t.amount_kes, 'FM999G999G990')), a.business_name);
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
revoke all on function public.mpesa_credit_target(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.mpesa_credit_target(uuid, text, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Ingest: raw first, then parse, then resolve. Any failure after the raw row is saved is recorded on that row
--    and can be reprocessed; the callback itself is always answered "accepted".
-- ---------------------------------------------------------------------------
create or replace function public.mpesa_process(p_callback uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  cb public.mpesa_callbacks;
  body jsonb;
  v_id text;
  v_amount numeric;
  v_msisdn text;
  v_hash text;
  v_plain text;
  v_name text;
  v_time timestamptz;
  t public.mpesa_transactions;
  r jsonb;
  res jsonb;
begin
  select * into cb from public.mpesa_callbacks where id = p_callback for update;
  if not found then raise exception 'callback_not_found'; end if;
  body := cb.body;
  begin
    v_id := upper(btrim(coalesce(body ->> 'TransID', '')));
    if v_id = '' then raise exception 'missing_trans_id'; end if;
    v_amount := nullif(btrim(coalesce(body ->> 'TransAmount', '')), '')::numeric;
    if v_amount is null or v_amount <= 0 then raise exception 'invalid_amount'; end if;
    begin
      v_time := make_timestamptz(substr(body ->> 'TransTime', 1, 4)::int, substr(body ->> 'TransTime', 5, 2)::int, substr(body ->> 'TransTime', 7, 2)::int,
                                 substr(body ->> 'TransTime', 9, 2)::int, substr(body ->> 'TransTime', 11, 2)::int, substr(body ->> 'TransTime', 13, 2)::int, 'Africa/Nairobi');
    exception when others then v_time := null; end;

    v_msisdn := btrim(coalesce(body ->> 'MSISDN', ''));
    if v_msisdn ~* '^[0-9a-f]{64}$' then
      v_hash := lower(v_msisdn);
    elsif regexp_replace(v_msisdn, '\D', '', 'g') ~ '^254[0-9]{9}$' and v_msisdn !~ '[*xX]' then
      v_plain := regexp_replace(v_msisdn, '\D', '', 'g');
      v_hash := public.msisdn_hash(v_plain);
    end if;
    v_name := btrim(concat_ws(' ', nullif(btrim(body ->> 'FirstName'), ''), nullif(btrim(body ->> 'MiddleName'), ''), nullif(btrim(body ->> 'LastName'), '')));

    insert into public.mpesa_transactions (trans_id, trans_time, amount_kes, account, msisdn_hash, payer_phone, payer_name, short_code, raw, callback_id)
    values (v_id, v_time, v_amount, nullif(btrim(body ->> 'BillRefNumber'), ''), v_hash, v_plain, nullif(v_name, ''),
            nullif(btrim(body ->> 'BusinessShortCode'), ''), body, cb.id)
    on conflict (trans_id) do nothing
    returning * into t;
    if t.id is null then
      update public.mpesa_callbacks set processed = true, trans_id = v_id, error = 'duplicate' where id = cb.id;
      return jsonb_build_object('duplicate', true, 'code', v_id);
    end if;

    r := public.mpesa_resolve(t.account, v_hash);
    if r ? 'type' then
      begin
        res := public.mpesa_credit_target(t.id, r ->> 'type', (r ->> 'id')::uuid, r ->> 'method');
      exception when others then
        -- The transaction row stays. The admin sees it, with the target as a suggestion, and assigns it by hand.
        update public.mpesa_transactions set state = 'needs_assignment', note = 'credit_failed: ' || left(sqlerrm, 200),
          candidates = jsonb_build_array(public.mpesa_candidate(r ->> 'type', (r ->> 'id')::uuid, 'matched but could not be credited')) where id = t.id;
        perform public.notify_admin('payment_unmatched', null, jsonb_build_object('code', v_id, 'amount', v_amount, 'account', t.account, 'note', 'credit_failed'));
        res := jsonb_build_object('outcome', 'needs_assignment', 'note', 'credit_failed');
      end;
    else
      update public.mpesa_transactions set state = 'needs_assignment', candidates = coalesce(r -> 'candidates', '[]'), note = r ->> 'note' where id = t.id;
      perform public.notify_admin('payment_unmatched', null, jsonb_build_object('code', v_id, 'amount', v_amount, 'account', t.account, 'note', r ->> 'note'));
      res := jsonb_build_object('outcome', 'needs_assignment', 'note', r ->> 'note');
    end if;
    update public.mpesa_callbacks set processed = true, trans_id = v_id, error = null where id = cb.id;
    return res || jsonb_build_object('duplicate', false, 'code', v_id, 'amount', v_amount, 'account', t.account);
  exception when others then
    update public.mpesa_callbacks set processed = false, error = sqlerrm, trans_id = nullif(v_id, '') where id = cb.id;
    return jsonb_build_object('outcome', 'error', 'error', sqlerrm, 'callback_id', cb.id);
  end;
end $$;
revoke all on function public.mpesa_process(uuid) from public, anon, authenticated;
grant execute on function public.mpesa_process(uuid) to service_role;

create or replace function public.mpesa_ingest(p_kind text, p_body jsonb, p_ip text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare cb uuid;
begin
  insert into public.mpesa_callbacks (kind, source_ip, body)
  values (coalesce(nullif(btrim(p_kind), ''), 'unknown'), left(p_ip, 80), coalesce(p_body, '{}'::jsonb)) returning id into cb;
  return public.mpesa_process(cb);
end $$;
revoke all on function public.mpesa_ingest(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.mpesa_ingest(text, jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Activation: called by the admin-confirm-payment function after it creates the seller. Moves any money left over
--    after the months paid for onto the new business, and marks the application's transactions as applied.
-- ---------------------------------------------------------------------------
create or replace function public.mpesa_settle_activation(p_application uuid, p_business uuid, p_payment uuid, p_consumed integer) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  a public.applications;
  v_left numeric;
begin
  select * into a from public.applications where id = p_application for update;
  if not found then return jsonb_build_object('outcome', 'no_application'); end if;
  v_left := greatest(0, a.credit_kes - coalesce(p_consumed, 0));
  update public.applications set credit_kes = 0 where id = a.id;
  update public.mpesa_transactions set state = 'applied', business_id = p_business, application_id = null, target_type = 'business',
    payment_id = p_payment, applied_at = now() where application_id = a.id and state = 'credited';
  if v_left > 0 then
    update public.businesses set credit_kes = credit_kes + v_left where id = p_business;
    -- Leftover may already cover further months (paid 3 months, admin confirmed 1).
    return public.mpesa_settle_business(p_business, null) || jsonb_build_object('leftover', v_left);
  end if;
  return jsonb_build_object('outcome', 'activated', 'leftover', 0);
end $$;
revoke all on function public.mpesa_settle_activation(uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.mpesa_settle_activation(uuid, uuid, uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 9. Ignore (wrong paybill, refunded, test) and its undo for money that is still only credit.
--    A transaction already turned into months is not undone here: that is a reversal, handled by an admin by hand.
-- ---------------------------------------------------------------------------
create or replace function public.mpesa_ignore(p_tx uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  t public.mpesa_transactions;
  a public.applications;
begin
  select * into t from public.mpesa_transactions where id = p_tx for update;
  if not found then raise exception 'tx_not_found'; end if;
  if t.state = 'ignored' then return jsonb_build_object('outcome', 'already_ignored'); end if;
  if t.state = 'applied' then raise exception 'already_applied'; end if;
  if t.state = 'credited' then
    if t.target_type = 'application' then
      update public.applications set credit_kes = greatest(0, credit_kes - t.amount_kes) where id = t.application_id returning * into a;
      if a.status = 'payment_confirming' and a.credit_kes < public.mpesa_price(a) then
        update public.applications set status = 'approved', payment_code = null where id = a.id;
        insert into public.application_events (application_id, actor, type, data)
        values (a.id, 'admin', 'payment_rejected', jsonb_build_object('code', t.trans_id, 'reason', p_reason));
      end if;
    else
      update public.businesses set credit_kes = greatest(0, credit_kes - t.amount_kes) where id = t.business_id;
    end if;
  end if;
  update public.mpesa_transactions set state = 'ignored', note = left(p_reason, 300) where id = t.id;
  return jsonb_build_object('outcome', 'ignored');
end $$;
revoke all on function public.mpesa_ignore(uuid, text) from public, anon, authenticated;
grant execute on function public.mpesa_ignore(uuid, text) to service_role;

-- The admin "reject payment" action in admin-confirm-payment finds the transaction by its code.
create or replace function public.mpesa_void_for_code(p_code text, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare t public.mpesa_transactions;
begin
  select * into t from public.mpesa_transactions where trans_id = upper(btrim(p_code));
  if not found or t.state in ('applied', 'ignored') then return jsonb_build_object('outcome', 'none'); end if;
  return public.mpesa_ignore(t.id, p_reason);
end $$;
revoke all on function public.mpesa_void_for_code(text, text) from public, anon, authenticated;
grant execute on function public.mpesa_void_for_code(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 10. Admin actions. Owner and finance only, same as every other payment write.
-- ---------------------------------------------------------------------------
create or replace function public.admin_mpesa_assign(p_tx uuid, p_type text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  t public.mpesa_transactions;
  r jsonb;
begin
  if not public.has_role(array['owner', 'finance']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_type not in ('application', 'business') then raise exception 'invalid_target'; end if;
  select * into t from public.mpesa_transactions where id = p_tx;
  if not found then raise exception 'tx_not_found'; end if;
  if t.state <> 'needs_assignment' then raise exception 'already_handled'; end if;
  r := public.mpesa_credit_target(p_tx, p_type, p_id, 'manual');
  perform public.write_audit(null, 'mpesa_assign', 'mpesa_transaction', p_tx::text,
    jsonb_build_object('code', t.trans_id, 'target_type', p_type, 'target_id', p_id, 'amount', t.amount_kes));
  return r;
end $$;
revoke all on function public.admin_mpesa_assign(uuid, text, uuid) from public, anon;
grant execute on function public.admin_mpesa_assign(uuid, text, uuid) to authenticated;

create or replace function public.admin_mpesa_ignore(p_tx uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r jsonb;
begin
  if not public.has_role(array['owner', 'finance']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;
  r := public.mpesa_ignore(p_tx, btrim(p_reason));
  perform public.write_audit(null, 'mpesa_ignore', 'mpesa_transaction', p_tx::text, jsonb_build_object('reason', btrim(p_reason)));
  return r;
end $$;
revoke all on function public.admin_mpesa_ignore(uuid, text) from public, anon;
grant execute on function public.admin_mpesa_ignore(uuid, text) to authenticated;

create or replace function public.admin_mpesa_reprocess(p_callback uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.has_role(array['owner', 'finance']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.mpesa_callbacks where id = p_callback and not processed) then raise exception 'already_handled'; end if;
  return public.mpesa_process(p_callback);
end $$;
revoke all on function public.admin_mpesa_reprocess(uuid) from public, anon;
grant execute on function public.admin_mpesa_reprocess(uuid) to authenticated;

create or replace function public.admin_mpesa_dismiss_callback(p_callback uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(array['owner', 'finance']) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.mpesa_callbacks set dismissed_at = now() where id = p_callback and not processed;
end $$;
revoke all on function public.admin_mpesa_dismiss_callback(uuid) from public, anon;
grant execute on function public.admin_mpesa_dismiss_callback(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Seller side: what to pay, the credit they hold, and "use my credit".
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
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select * into v_b from public.businesses where id = v_id;
  v_q := public.payment_quote(v_b, p_purpose, p_target_plan, p_category);
  v_amount := (v_q ->> 'amount_kes')::integer;
  select s.value into v_m from public.site_settings s where s.key = 'mpesa';
  v_ok := v_m is not null and coalesce(btrim(v_m ->> 'number'), '') <> '';
  return v_q || jsonb_build_object(
    'configured', v_ok,
    'method', case when v_ok then coalesce(v_m ->> 'type', 'paybill') end,
    'number', case when v_ok then v_m ->> 'number' end,
    'name', case when v_ok then v_m ->> 'name' end,
    'credit_kes', v_b.credit_kes,
    'amount_due_kes', greatest(v_amount - v_b.credit_kes, 0)::integer,
    'max_prepay_months', coalesce((select (s.value #>> '{}')::integer from public.site_settings s where s.key = 'max_prepay_months'), 12),
    'has_open_submission', exists (select 1 from public.payments x where x.business_id = v_id and x.status = 'submitted'));
end $$;

-- Spend credit on a renewal, an upgrade or a category change, without paying again.
create or replace function public.seller_apply_credit(p_purpose text default null, p_target_plan text default null, p_category text default null, p_change_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid := public.my_business_id();
  b public.businesses;
  q jsonb;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext(v_id::text || 'payments'));
  select * into b from public.businesses where id = v_id for update;
  q := public.payment_quote(b, p_purpose, p_target_plan, p_category);
  if (q ->> 'amount_kes')::integer <= 0 then raise exception 'nothing_to_pay'; end if;
  if b.credit_kes < (q ->> 'amount_kes')::integer then raise exception 'not_enough_credit'; end if;
  if (q ->> 'purpose') in ('first', 'renewal') then
    return public.mpesa_settle_business(b.id, null);
  end if;
  return public.mpesa_apply_purpose(b.id, q ->> 'purpose', p_target_plan, p_category, p_change_id);
end $$;
revoke all on function public.seller_apply_credit(text, text, text, uuid) from public, anon;
grant execute on function public.seller_apply_credit(text, text, text, uuid) to authenticated;

-- The portal tells the server what the seller is about to pay for. Renewals need no intent, so a null or renewal
-- purpose clears it.
create or replace function public.seller_set_payment_intent(p_purpose text default null, p_target_plan text default null, p_category text default null, p_change_id uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.my_business_id();
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if p_purpose in ('upgrade', 'category_change') then
    update public.businesses set pay_intent = jsonb_build_object('purpose', p_purpose, 'target_plan', p_target_plan, 'category', p_category,
      'change_id', p_change_id, 'set_at', now()) where id = v_id;
  else
    update public.businesses set pay_intent = null where id = v_id;
  end if;
end $$;
revoke all on function public.seller_set_payment_intent(text, text, text, uuid) from public, anon;
grant execute on function public.seller_set_payment_intent(text, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 12. The admin Payments list.
--     status: needs_assignment | awaiting_confirmation | part_paid | renewed | confirmed | ignored (+ manual payments' own status)
-- ---------------------------------------------------------------------------
-- Runs with the view owner's rights on purpose: row level security hides applications from finance and support,
-- yet finance is the role that confirms payments and must see which business a payment belongs to. Only admins
-- get rows (is_admin() below) and only low-sensitivity columns are exposed.
create or replace view public.admin_payment_queue as
select * from (
select
  'tx:' || t.id::text                                  as row_key,
  t.id                                                 as tx_id,
  case
    when t.state = 'needs_assignment' then 'needs_assignment'
    when t.state = 'ignored' then 'ignored'
    when t.state = 'applied' then case when p.source = 'auto' then 'renewed' else 'confirmed' end
    when a.status = 'payment_confirming' then 'awaiting_confirmation'
    else 'part_paid'
  end                                                  as status,
  coalesce(a.reference_no, b.seller_id)                as reference,
  coalesce(a.business_name, b.name, 'No matching business') as business_name,
  coalesce(a.town, b.town)                             as town,
  t.account                                            as account,
  t.amount_kes                                         as amount_kes,
  case when a.id is not null then public.mpesa_price(a) else b.monthly_price end as expected_kes,
  coalesce(a.credit_kes, b.credit_kes)                 as credit_kes,
  case when a.id is not null and a.status = 'payment_confirming' then
    least(floor(a.credit_kes / nullif(public.mpesa_price(a), 0))::integer,
          coalesce((select (s.value #>> '{}')::integer from public.site_settings s where s.key = 'max_prepay_months'), 12)) end as suggested_months,
  t.trans_id                                           as mpesa_code,
  t.payer_phone                                        as phone,
  t.payer_name                                         as payer_name,
  t.short_code                                         as paybill_number,
  p.receipt_no                                         as receipt_no,
  coalesce(t.trans_time, t.created_at)                 as at,
  a.id                                                 as application_id,
  coalesce(b.id, t.business_id)                        as business_id,
  a.status                                             as app_status,
  a.payment_code                                       as app_payment_code,
  t.candidates                                         as candidates,
  t.note                                               as note,
  t.match_method                                       as match_method
from public.mpesa_transactions t
left join public.applications a on a.id = t.application_id and t.target_type = 'application'
left join public.businesses b on b.id = t.business_id
left join public.payments p on p.id = t.payment_id
union all
select
  'payment:' || p.id::text, null::uuid, p.status, coalesce(a.reference_no, b.seller_id), coalesce(b.name, a.business_name, 'Unknown business'),
  coalesce(b.town, a.town), coalesce(p.account_ref, b.name, a.business_name), p.amount_kes, null::integer, null::numeric, null::integer, p.mpesa_code,
  coalesce(p.phone, a.phone, b.phone), null::text, null::text, p.receipt_no, coalesce(p.confirmed_at, p.submitted_at, p.created_at),
  p.application_id, p.business_id, null::text, null::text, '[]'::jsonb, null::text, null::text
from public.payments p
left join public.applications a on a.id = p.application_id
left join public.businesses b on b.id = p.business_id
where p.mpesa_code is null
   or not exists (select 1 from public.mpesa_transactions t where t.trans_id = p.mpesa_code)
) q
where public.is_admin();

revoke all on public.admin_payment_queue from anon;
grant select on public.admin_payment_queue to authenticated;

-- ---------------------------------------------------------------------------
-- 13. Paid before approval: when an application that already holds enough credit is approved straight into
--     payment_confirming, remember which M-Pesa code it was, so the admin's Confirm has it.
-- ---------------------------------------------------------------------------
create or replace function public.applications_fill_payment_code() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'payment_confirming' and new.payment_code is null then
    select t.trans_id into new.payment_code from public.mpesa_transactions t
    where t.application_id = new.id and t.state = 'credited' order by t.created_at desc limit 1;
  end if;
  return new;
end $$;
drop trigger if exists t_applications_payment_code on public.applications;
create trigger t_applications_payment_code before update of status on public.applications
  for each row execute function public.applications_fill_payment_code();

-- ---------------------------------------------------------------------------
-- 14. Finding a shop to assign a payment to. Finance cannot read applications directly, so this is the way in.
--     Matches name, town, phone, application reference and Seller ID; shows the town so same-named shops can be told apart.
-- ---------------------------------------------------------------------------
create or replace function public.admin_mpesa_search_targets(p_q text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  q text := '%' || replace(replace(btrim(coalesce(p_q, '')), '%', ''), '_', '') || '%';
  k text := '%' || public.norm_key(p_q) || '%';
begin
  if not public.has_role(array['owner', 'finance']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_q, ''))) < 2 then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(c) from (
    select public.mpesa_candidate('application', a.id, 'search') as c from public.applications a
      where a.status not in ('rejected', 'draft') and not exists (select 1 from public.businesses y where y.application_id = a.id)
        and (a.business_name ilike q or a.town ilike q or a.phone like q or public.norm_key(a.reference_no) like k)
    union all
    select public.mpesa_candidate('business', b.id, 'search') from public.businesses b
      where b.status <> 'deleted' and (b.name ilike q or b.town ilike q or b.phone like q or public.norm_key(b.seller_id) like k)
    limit 10) s), '[]'::jsonb);
end $$;
revoke all on function public.admin_mpesa_search_targets(text) from public, anon;
grant execute on function public.admin_mpesa_search_targets(text) to authenticated;
