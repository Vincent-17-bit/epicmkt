-- 0029_grace_and_settings.sql
-- Grace period you can change (a default for everyone, and an override per business), and the Settings page.
--   * site_settings.grace_days is the default (1). businesses.grace_days, when set, replaces it for that business.
--   * After grace a shop is hidden from customers (business_is_visible) and comes back by itself when a payment is confirmed.
--   * Settings are read and written through security definer functions that check the admin role.

alter table public.businesses
  add column if not exists grace_days integer check (grace_days is null or grace_days between 0 and 90);

insert into public.site_settings (key, value) values
  ('grace_days', '1'),
  ('sms_sender', '"EpicMKT"')
on conflict (key) do nothing;

create or replace function public.default_grace_days() returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((select (s.value #>> '{}')::integer from public.site_settings s where s.key = 'grace_days'), 1)
$$;

create or replace function public.grace_days_of(p_business_grace integer) returns integer
language sql stable as $$ select coalesce(p_business_grace, public.default_grace_days()) $$;

create or replace function public.listing_state(p_paid timestamptz, p_now timestamptz, p_grace integer) returns text
language sql stable as $$
  select case
    when p_paid is null then 'none'
    when public.nairobi_day(p_now) <= public.nairobi_day(p_paid) then 'active'
    when public.nairobi_day(p_now) <= public.nairobi_day(p_paid) + public.grace_days_of(p_grace) then 'grace'
    else 'expired'
  end $$;

create or replace function public.listing_state(p_paid timestamptz, p_now timestamptz default now()) returns text
language sql stable as $$ select public.listing_state(p_paid, p_now, null::integer) $$;

grant execute on function public.listing_state(timestamptz, timestamptz, integer) to authenticated, service_role;

create or replace function public.my_grace_days() returns integer
language sql stable security definer set search_path = public as $$
  select public.grace_days_of(b.grace_days) from public.businesses b where b.id = public.my_business_id()
$$;
revoke all on function public.my_grace_days() from public, anon;
grant execute on function public.my_grace_days() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Settings page
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_settings() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_q jsonb;
begin
  if not public.has_role(array[]::text[]) then raise exception 'forbidden' using errcode = '42501'; end if;
  select value into v_q from public.site_settings where key = 'quiet_hours';
  return jsonb_build_object(
    'graceDays', public.default_grace_days(),
    'strikeThreshold', coalesce((select (value #>> '{}')::integer from public.site_settings where key = 'strike_threshold'), 3),
    'smsSender', coalesce((select value #>> '{}' from public.site_settings where key = 'sms_sender'), 'EpicMKT'),
    'quietStart', coalesce(v_q ->> 'start', '21:00'),
    'quietEnd', coalesce(v_q ->> 'end', '07:00'));
end $$;

create or replace function public.admin_save_settings(p_settings jsonb, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
  v_grace integer;
  v_strike integer;
  v_sender text;
  v_start text;
  v_end text;
begin
  if not public.has_role(array[]::text[]) then raise exception 'forbidden' using errcode = '42501'; end if;
  v_before := public.admin_get_settings();

  begin
    v_grace := (p_settings ->> 'graceDays')::integer;
    v_strike := (p_settings ->> 'strikeThreshold')::integer;
  exception when others then raise exception 'invalid_settings' using errcode = '22023';
  end;
  v_sender := btrim(coalesce(p_settings ->> 'smsSender', ''));
  v_start := btrim(coalesce(p_settings ->> 'quietStart', ''));
  v_end := btrim(coalesce(p_settings ->> 'quietEnd', ''));

  if v_grace is null or v_grace < 0 or v_grace > 30 then raise exception 'invalid_grace_days' using errcode = '22023'; end if;
  if v_strike is null or v_strike < 1 or v_strike > 20 then raise exception 'invalid_strike_threshold' using errcode = '22023'; end if;
  if v_sender !~ '^[A-Za-z0-9]{3,11}$' then raise exception 'invalid_sms_sender' using errcode = '22023'; end if;
  if v_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or v_end !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or v_start = v_end then
    raise exception 'invalid_quiet_hours' using errcode = '22023';
  end if;

  insert into public.site_settings (key, value) values
    ('grace_days', to_jsonb(v_grace)),
    ('strike_threshold', to_jsonb(v_strike)),
    ('sms_sender', to_jsonb(v_sender)),
    ('quiet_hours', jsonb_build_object('start', v_start, 'end', v_end))
  on conflict (key) do update set value = excluded.value, updated_at = now();

  perform public.admin_audit_action('settings.update', 'settings', null, v_before, public.admin_get_settings(),
    nullif(btrim(coalesce(p_reason, '')), ''));
  return public.admin_get_settings();
end $$;

revoke all on function public.admin_get_settings() from public, anon;
revoke all on function public.admin_save_settings(jsonb, text) from public, anon;
grant execute on function public.admin_get_settings() to authenticated, service_role;
grant execute on function public.admin_save_settings(jsonb, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Grace for one business: a number of days replaces the default; null goes back to the default.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_business_grace(p_business uuid, p_days integer, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b public.businesses;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.has_role(array['finance']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_days is not null and (p_days < 0 or p_days > 90) then raise exception 'invalid_grace_days' using errcode = '22023'; end if;
  if p_days is not null and v_reason is null then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into b from public.businesses x where x.id = p_business and x.deleted_at is null for update;
  if not found then raise exception 'target_not_found' using errcode = 'P0002'; end if;

  update public.businesses set grace_days = p_days where id = b.id;
  perform public.admin_audit_action('business.grace', 'business', b.id::text,
    jsonb_build_object('graceDays', b.grace_days), jsonb_build_object('graceDays', p_days), v_reason, b.id);
  return jsonb_build_object('graceDays', p_days, 'effective', public.grace_days_of(p_days),
    'state', public.listing_state(b.paid_until, now(), p_days));
end $$;

revoke all on function public.admin_set_business_grace(uuid, integer, text) from public, anon;
grant execute on function public.admin_set_business_grace(uuid, integer, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Everything below follows the grace period of the business instead of a fixed day.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.business_is_visible(b businesses)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select b.status = 'live'
    and b.deleted_at is null
    and public.listing_state(b.paid_until, now(), b.grace_days) in ('active', 'grace');
$function$;

CREATE OR REPLACE FUNCTION public.admin_counts()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when public.is_admin() then jsonb_build_object(
    'submitted',            (select count(*) from applications where status = 'submitted'),
    'under_review',         (select count(*) from applications where status = 'under_review'),
    'changes_requested',    (select count(*) from applications where status = 'changes_requested'),
    'awaiting_payment',     (select count(*) from applications where status = 'approved'),
    'payment_confirming',   (select count(*) from applications where status = 'payment_confirming'),
    'live',                 (select count(*) from businesses b where public.business_is_visible(b)),
    'expiring_7d',          (select count(*) from businesses b where b.status = 'live' and b.deleted_at is null
                               and public.listing_state(b.paid_until, now(), b.grace_days) = 'active' and public.days_left(b.paid_until) <= 7),
    'in_grace',             (select count(*) from businesses b where b.status = 'live' and b.deleted_at is null
                               and public.listing_state(b.paid_until, now(), b.grace_days) = 'grace'),
    'expired',              (select count(*) from businesses b where b.deleted_at is null and b.status in ('live', 'expired')
                               and public.listing_state(b.paid_until, now(), b.grace_days) = 'expired'),
    'suspended',            (select count(*) from businesses where status = 'suspended' and deleted_at is null),
    'open_flags',           (select count(*) from flags where status in ('open', 'replied')),
    'open_reports',         (select count(*) from reports where status = 'open'),
    'unconfirmed_payments', (select count(*) from payments where status = 'submitted'),
    'failed_messages',      (select count(*) from messages where status = 'failed'),
    'pending_changes',      (select count(*) from change_requests where status = 'pending')
  ) else '{}'::jsonb end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_expiry_radar(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_days integer := least(greatest(coalesce(p_days, 30), 1), 90);
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.paid_until asc)
    from (
      select b.id, b.name, b.category_id, b.plan_key, b.phone, b.whatsapp, b.monthly_price, b.paid_until, b.status,
             public.days_left(b.paid_until) as days_left,
             public.listing_state(b.paid_until, now(), b.grace_days) as state,
             (select max(p.confirmed_at) from public.payments p where p.business_id = b.id and p.status = 'confirmed') as last_payment_at,
             (select max(m.created_at) from public.messages m
               where m.business_id = b.id and m.kind in ('reminder', 'grace', 'expiry')) as last_reminder_at,
             exists (select 1 from public.payments p where p.business_id = b.id and p.status in ('submitted', 'awaiting_confirmation', 'needs_assignment')) as payment_waiting
        from public.businesses b
       where b.status in ('live', 'expired') and b.deleted_at is null and b.paid_until is not null
         and public.days_left(b.paid_until) <= v_days
         and public.days_left(b.paid_until) >= -30
    ) x
  ), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.message_segment(p_segment text, p_now timestamp with time zone DEFAULT now())
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- `return query` does not end a set-returning function, so each branch returns explicitly.
  if p_segment = 'all_live' then
    return query select id from public.businesses where status = 'live';
    return;
  elsif p_segment = 'expiring_7d' then
    return query select id from public.businesses
      where status = 'live' and paid_until is not null
        and public.nairobi_day(paid_until) between public.nairobi_day(p_now) and public.nairobi_day(p_now) + 7;
    return;
  elsif p_segment = 'in_grace' then
    return query select id from public.businesses
      where status <> 'deleted' and paid_until is not null and public.listing_state(paid_until, p_now, grace_days) = 'grace';
    return;
  elsif p_segment = 'expired' then
    return query select id from public.businesses
      where status <> 'deleted' and paid_until is not null and public.listing_state(paid_until, p_now, grace_days) = 'expired';
    return;
  elsif p_segment like 'category:%' then
    return query select id from public.businesses where status = 'live' and category_id = substr(p_segment, 10);
    return;
  elsif p_segment like 'town:%' then
    return query select id from public.businesses where status = 'live' and lower(town) = lower(substr(p_segment, 6));
    return;
  end if;
  raise exception 'unknown_segment' using errcode = '22023';
end $function$;

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
begin
  select p.price_kes into v_old from public.plans p where p.category_id = p_b.category_id and p.plan_key = p_b.plan_key;
  if v_purpose is null then
    v_purpose := case when p_b.paid_until is null and not exists (select 1 from public.payments x where x.business_id = p_b.id and x.status = 'confirmed') then 'first' else 'renewal' end;
  end if;
  if v_purpose = 'first' then
    select * into v_app from public.applications a where a.id = p_b.application_id;
    v_amount := coalesce(v_app.price_at_submission, v_old);
    v_account := coalesce(v_app.reference_no, p_b.seller_id);
  elsif v_purpose = 'renewal' then
    v_amount := v_old;
  elsif v_purpose = 'upgrade' then
    if p_b.plan_key <> 'standard' or p_target is distinct from 'premium' then raise exception 'invalid_upgrade'; end if;
    if v_state <> 'active' then raise exception 'renew_first'; end if;
    select p.price_kes into v_new from public.plans p where p.category_id = p_b.category_id and p.plan_key = 'premium';
    if v_new is null then raise exception 'invalid_upgrade'; end if;
    v_quote := public.category_change_quote(v_old, v_new, p_b.paid_until, p_now);
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
    'listing_state', v_state, 'grace_days', public.grace_days_of(p_b.grace_days), 'quote', v_quote);
end $function$;

CREATE OR REPLACE FUNCTION public.seller_request_change(p_field text, p_value text)
 RETURNS change_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid := public.my_business_id();
  v_b public.businesses;
  v_new text := btrim(coalesce(p_value, ''));
  v_old text;
  v_oldp integer;
  v_newp integer;
  v_quote jsonb;
  r public.change_requests;
begin
  perform public.assert_seller_active();
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if p_field is null or p_field not in ('name','category_id','phone','town','pin','licence') then
    raise exception 'field_not_allowed:%', coalesce(p_field, '') using errcode = '42501';
  end if;
  select * into v_b from public.businesses where id = v_id;
  if p_field = 'name' and char_length(v_new) not between 2 and 100 then raise exception 'invalid_name'; end if;
  if p_field = 'category_id' and not exists (select 1 from public.categories c where c.id = v_new and c.active) then raise exception 'invalid_category'; end if;
  if p_field = 'phone' then
    v_new := public.normalize_phone_ke(v_new);
    if v_new is null then raise exception 'invalid_phone'; end if;
  end if;
  if p_field = 'town' and char_length(v_new) not between 2 and 60 then raise exception 'invalid_town'; end if;
  if p_field = 'pin' then
    v_new := upper(v_new);
    if v_new !~ '^[AP][0-9]{9}[A-Z]$' then raise exception 'invalid_pin'; end if;
  end if;
  if p_field = 'licence' and char_length(v_new) not between 3 and 60 then raise exception 'invalid_licence'; end if;
  v_old := to_jsonb(v_b) ->> p_field;
  if v_old is not distinct from v_new then raise exception 'no_change'; end if;

  if p_field = 'category_id' then
    select p.price_kes into v_oldp from public.plans p where p.category_id = v_b.category_id and p.plan_key = v_b.plan_key;
    select p.price_kes into v_newp from public.plans p where p.category_id = v_new and p.plan_key = v_b.plan_key;
    if v_newp is null then raise exception 'invalid_category'; end if;
    if v_newp > coalesce(v_oldp, 0) and public.listing_state(v_b.paid_until, now(), v_b.grace_days) <> 'active' then raise exception 'renew_first'; end if;
    v_quote := public.category_change_quote(coalesce(v_oldp, 0), v_newp, v_b.paid_until);
  end if;

  begin
    insert into public.change_requests (business_id, field, old_value, new_value, extra_due_kes, new_monthly_price, applies_from_next_renewal)
    values (v_id, p_field, v_old, v_new, coalesce((v_quote ->> 'extraDueNow')::integer, 0), (v_quote ->> 'newMonthlyPrice')::integer, true)
    returning * into r;
  exception when unique_violation then
    raise exception 'change_already_pending';
  end;
  perform public.write_audit(v_id, 'change_requested', 'change_request', r.id::text, jsonb_build_object('field', p_field));
  perform public.notify_admin('change_request', v_id, jsonb_build_object('change_id', r.id, 'field', p_field));
  return r;
end $function$;

CREATE OR REPLACE FUNCTION public.seller_quote_category_change(p_category text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid := public.my_business_id();
  v_b public.businesses;
  v_old integer;
  v_new integer;
begin
  if v_id is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select * into v_b from public.businesses where id = v_id;
  if not exists (select 1 from public.categories c where c.id = p_category and c.active) then raise exception 'invalid_category'; end if;
  select p.price_kes into v_old from public.plans p where p.category_id = v_b.category_id and p.plan_key = v_b.plan_key;
  select p.price_kes into v_new from public.plans p where p.category_id = p_category and p.plan_key = v_b.plan_key;
  if v_new is null then raise exception 'invalid_category'; end if;
  return public.category_change_quote(coalesce(v_old, 0), v_new, v_b.paid_until)
    || jsonb_build_object('oldMonthlyPrice', v_old, 'dearer', v_new > coalesce(v_old, 0), 'listingState', public.listing_state(v_b.paid_until, now(), v_b.grace_days));
end $function$;

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
    v_body := format('We received KES %s. Your listing is paid until %s.', p.amount_kes, to_char(v_end, 'DD Mon YYYY'));
  elsif p.kind = 'upgrade' then
    v_start := v_today;
    v_end := public.nairobi_day(b.paid_until);
    update public.businesses x set plan_key = coalesce(p.plan_key, x.plan_key) where x.id = b.id;
    v_body := format('We received KES %s. You are now on %s until %s.', p.amount_kes, initcap(coalesce(p.plan_key, b.plan_key)), to_char(v_end, 'DD Mon YYYY'));
  else
    v_start := v_today;
    v_end := case when b.paid_until is null then null else public.nairobi_day(b.paid_until) end;
    v_body := format('We received KES %s for your category change. It now waits for admin approval.', p.amount_kes);
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
end $function$;

CREATE OR REPLACE FUNCTION public.admin_business_detail(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b public.businesses;
  v jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into b from public.businesses where id = p_id;
  if not found then raise exception 'not_found'; end if;

  v := jsonb_build_object(
    'business', jsonb_build_object(
      'id', b.id, 'seller_id', b.seller_id, 'slug', b.slug, 'name', b.name, 'category_id', b.category_id,
      'category_name', (select c.name from public.categories c where c.id = b.category_id),
      'plan_key', b.plan_key, 'status', b.status, 'status_reason', b.status_reason,
      'verification_level', b.verification_level, 'featured', b.featured, 'featured_until', b.featured_until,
      'paid_until', b.paid_until, 'first_paid_at', b.first_paid_at, 'monthly_price', b.monthly_price,
      'credit_kes', b.credit_kes, 'grace_days', b.grace_days, 'grace_default', public.default_grace_days(), 'strikes', b.strikes, 'tags', to_jsonb(b.tags),
      'tagline', b.tagline, 'description', b.description, 'owner_name', b.owner_name,
      'phone', b.phone, 'whatsapp', b.whatsapp, 'email', b.email,
      'county', b.county, 'town', b.town, 'address', b.address,
      'last_login_at', b.last_login_at, 'last_edit_at', b.last_edit_at,
      'application_id', b.application_id, 'deleted_at', b.deleted_at, 'created_at', b.created_at
    )
  );

  v := v || jsonb_build_object('stats', jsonb_build_object(
    'items', (select count(*) from public.items i where i.business_id = p_id and not i.draft),
    'items_hidden', (select count(*) from public.items i where i.business_id = p_id and i.hidden_by_admin),
    'open_flags', (select count(*) from public.flags f where f.business_id = p_id and f.status = 'open'),
    'open_reports', (select count(*) from public.reports r where r.business_id = p_id and r.status = 'open'),
    'paid_total_kes', coalesce((select sum(amount_kes) from public.payments p where p.business_id = p_id and p.status = 'confirmed'), 0),
    'payments_waiting', (select count(*) from public.payments p where p.business_id = p_id and p.status in ('submitted', 'awaiting_confirmation', 'needs_assignment')),
    'last_payment_at', (select max(confirmed_at) from public.payments p where p.business_id = p_id and p.status = 'confirmed')
  ));
  return v;
end $function$;

CREATE OR REPLACE FUNCTION public.generate_billing_notices(p_now timestamp with time zone DEFAULT now())
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b record;
  v_left integer;
  v_day text;
  v_n integer := 0;
  v_ok boolean;
  v_g integer;
begin
  for b in select x.id, x.paid_until, x.grace_days from public.businesses x where x.paid_until is not null and x.status in ('live','paused','suspended','expired') loop
    v_left := public.nairobi_day(b.paid_until) - public.nairobi_day(p_now);
    v_g := public.grace_days_of(b.grace_days);
    v_day := to_char(public.nairobi_day(b.paid_until), 'YYYY-MM-DD');
    v_ok := false;
    if v_left in (7, 3, 2) then
      v_ok := public.post_seller_message(b.id, 'reminder', format('Your listing expires in %s days', v_left),
        format('Your subscription runs to %s. Renew before then to stay visible.', to_char(public.nairobi_day(b.paid_until), 'DD Mon YYYY')),
        jsonb_build_object('days_left', v_left), format('reminder:%s:%s', v_left, v_day));
    elsif v_left = 1 then
      v_ok := public.post_seller_message(b.id, 'reminder', 'Your listing expires tomorrow',
        format('Your subscription runs to %s. Renew before then to stay visible.', to_char(public.nairobi_day(b.paid_until), 'DD Mon YYYY')),
        jsonb_build_object('days_left', 1), format('reminder:1:%s', v_day));
    elsif v_left = -1 and v_g > 0 then
      v_ok := public.post_seller_message(b.id, 'grace', format('Your subscription has ended: %s day%s of grace', v_g, case when v_g = 1 then '' else 's' end),
        format('Your listing stays visible for %s. Renew today to avoid being hidden.', case when v_g = 1 then 'one more day' else v_g || ' more days' end), '{}', 'grace:' || v_day);
    elsif v_left < -v_g then
      v_ok := public.post_seller_message(b.id, 'expiry', 'Your subscription has expired',
        'Your listing is hidden from customers. Renew to bring it back.', '{}', 'expiry:' || v_day);
    end if;
    if v_ok then v_n := v_n + 1; end if;
  end loop;
  return v_n;
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
      v_body := format('EpicMKT: "%s" expires in %s day%s (%s). Renew to stay visible.',
        v_name, v_left, case when v_left = 1 then '' else 's' end, to_char(public.nairobi_day(b.paid_until), 'DD Mon YYYY'));
    elsif v_left = -1 and v_g > 0 then
      v_kind := 'grace';
      v_key := 'grace:' || v_day;
      v_subject := format('Your subscription has ended: %s day%s of grace', v_g, case when v_g = 1 then '' else 's' end);
      v_body := format('EpicMKT: your subscription for "%s" has ended. You have %s day%s of grace. Renew today to stay visible.', v_name, v_g, case when v_g = 1 then '' else 's' end);
    elsif v_left between -(v_g + 3) and -(v_g + 1) then
      -- Only the first days after grace; sellers who lapsed long ago are not texted when this first runs.
      v_kind := 'expiry';
      v_key := 'expiry:' || v_day;
      v_subject := 'Your subscription has expired';
      v_body := format('EpicMKT: "%s" is now hidden from customers. Renew to bring it back.', v_name);
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

CREATE OR REPLACE FUNCTION public.admin_businesses_query(p_tab text DEFAULT 'all'::text, p_search text DEFAULT NULL::text, p_sort text DEFAULT 'paidUntil'::text, p_dir text DEFAULT 'asc'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_order text;
  v_dir text := case when lower(coalesce(p_dir, 'asc')) = 'desc' then 'desc' else 'asc' end;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 5000);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total bigint;
  v_rows jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Only these columns can be sorted on: the key is looked up here, never pasted into the query.
  v_order := case p_sort
    when 'name' then 'lower(name)'
    when 'items' then 'items'
    when 'healthScore' then 'health_score'
    when 'lastLogin' then 'last_login_at'
    when 'createdAt' then 'created_at'
    when 'lastEdit' then 'last_edit_at'
    when 'strikes' then 'strikes'
    else 'paid_until'
  end;
  if v_order = 'health_score' then
    v_order := 'round(completeness * 0.35 + greatest(0, least(100, 100 - price_age_days * 2.5)) * 0.25'
            || ' + greatest(0, least(100, 100 - login_age_days * 4)) * 0.25'
            || ' + greatest(0, least(100, 100 - open_reports * 35)) * 0.15)';
  end if;

  select count(*) into v_total
    from public.admin_businesses_filtered(p_filters, p_search) v
   where public.admin_business_in_tab(p_tab, v.state, v.open_flags);

  execute format($q$
    select coalesce(jsonb_agg(r.j order by r.rn), '[]'::jsonb) from (
      select row_number() over (order by %1$s %2$s nulls last, id) as rn,
        jsonb_build_object(
          'id', id, 'sellerId', seller_id, 'slug', slug, 'name', name, 'category', coalesce(category, ''),
          'county', coalesce(county, ''), 'town', coalesce(town, ''), 'ownerName', coalesce(owner_name, ''),
          'phone', coalesce(phone, ''), 'plan', plan, 'verified', verified, 'featured', featured,
          'status', ui_status, 'paidUntil', to_char(paid_day, 'YYYY-MM-DD'), 'items', items,
          'openFlags', open_flags, 'strikes', strikes, 'completeness', completeness,
          'priceAgeDays', price_age_days, 'loginAgeDays', login_age_days, 'openReports', open_reports,
          'healthScore', round(completeness * 0.35 + greatest(0, least(100, 100 - price_age_days * 2.5)) * 0.25
                             + greatest(0, least(100, 100 - login_age_days * 4)) * 0.25
                             + greatest(0, least(100, 100 - open_reports * 35)) * 0.15),
          'lastLogin', last_login_at, 'lastEdit', last_edit_at, 'createdAt', created_at,
          'state', state, 'agent', null, 'tags', to_jsonb(tags), 'deleted', deleted, 'unconfirmedPayment', unconfirmed_payment
        ) as j
      from public.admin_businesses_filtered($1, $2) v
      where public.admin_business_in_tab($3, v.state, v.open_flags)
      order by %1$s %2$s nulls last, id
      limit $4 offset $5
    ) r
  $q$, v_order, v_dir)
  into v_rows
  using p_filters, p_search, p_tab, v_limit, v_offset;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end $function$;

create or replace view public.admin_businesses_v with (security_invoker = true) as
 SELECT b.id,
    b.seller_id,
    b.slug,
    b.name,
    c.name AS category,
    b.county,
    b.town,
    b.owner_name,
    b.phone,
    initcap(b.plan_key) AS plan,
    (b.verification_level = 'verified'::text) AS verified,
    b.featured,
    ((b.deleted_at IS NOT NULL) OR (b.status = 'deleted'::text)) AS deleted,
        CASE
            WHEN ((b.status = 'live'::text) AND (b.paid_until IS NULL)) THEN 'pending'::text
            ELSE b.status
        END AS ui_status,
    b.paid_until,
    nairobi_day(b.paid_until) AS paid_day,
    days_left(b.paid_until) AS days_left,
        CASE
            WHEN ((b.deleted_at IS NOT NULL) OR (b.status = 'deleted'::text)) THEN 'deleted'::text
            WHEN (b.status <> 'live'::text) THEN b.status
            WHEN (b.paid_until IS NULL) THEN 'pending'::text
            WHEN (listing_state(b.paid_until, now(), b.grace_days) = 'expired'::text) THEN 'expired'::text
            WHEN (listing_state(b.paid_until, now(), b.grace_days) = 'grace'::text) THEN 'grace'::text
            WHEN (days_left(b.paid_until) <= 7) THEN 'expiring'::text
            ELSE 'live'::text
        END AS state,
    (COALESCE(s.items, (0)::bigint))::integer AS items,
    COALESCE(s.price_age_days, 0) AS price_age_days,
    (COALESCE(f.open_flags, (0)::bigint))::integer AS open_flags,
    (COALESCE(r.open_reports, (0)::bigint))::integer AS open_reports,
    (EXISTS ( SELECT 1
           FROM payments p
          WHERE ((p.business_id = b.id) AND (p.status = 'submitted'::text)))) AS unconfirmed_payment,
    b.strikes,
    b.tags,
    b.last_login_at,
    COALESCE(b.last_edit_at, b.updated_at) AS last_edit_at,
    b.created_at,
    nairobi_day(b.created_at) AS created_day,
    (round(((100.0 * ((((((((((COALESCE(btrim(b.tagline), ''::text) <> ''::text))::integer + ((COALESCE(btrim(b.description), ''::text) <> ''::text))::integer) + ((b.logo_path IS NOT NULL))::integer) + ((b.cover_path IS NOT NULL))::integer) + ((COALESCE(btrim(b.address), ''::text) <> ''::text))::integer) + ((COALESCE(btrim(b.whatsapp), ''::text) <> ''::text))::integer) + ((b.hours <> '{}'::jsonb))::integer) + ((COALESCE(s.items, (0)::bigint) > 0))::integer))::numeric) / (8)::numeric)))::integer AS completeness,
    COALESCE((nairobi_today() - nairobi_day(b.last_login_at)), 30) AS login_age_days
   FROM ((((businesses b
     LEFT JOIN categories c ON ((c.id = b.category_id)))
     LEFT JOIN LATERAL ( SELECT count(*) AS items,
            max((nairobi_today() - nairobi_day(i.price_confirmed_at))) AS price_age_days
           FROM items i
          WHERE (i.business_id = b.id)) s ON (true))
     LEFT JOIN LATERAL ( SELECT count(*) AS open_flags
           FROM flags fl
          WHERE ((fl.business_id = b.id) AND (fl.status = ANY (ARRAY['open'::text, 'replied'::text])))) f ON (true))
     LEFT JOIN LATERAL ( SELECT count(*) AS open_reports
           FROM reports rp
          WHERE ((rp.business_id = b.id) AND (rp.status = 'open'::text))) r ON (true));
