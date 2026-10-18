-- Automatic M-Pesa Paybill payments.
-- EpicMKT is a Paybill. Sellers pay the business number and type their exact business name as the account
-- number. Safaricom (Daraja C2B) then tells the backend about every payment, and nobody pastes a code.
-- The business number is set once with supabase/set-mpesa.sql; the account is never stored in site_settings.
insert into public.site_settings(key, value) values ('mpesa', '{"type":"paybill","number":"","name":"EpicMKT"}')
on conflict (key) do update
  set value = (public.site_settings.value - 'account') || '{"type":"paybill"}'::jsonb,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- Every payment Safaricom reports, exactly once (trans_id is M-Pesa's own transaction code).
-- ---------------------------------------------------------------------------
create table if not exists public.mpesa_transactions (
  id uuid primary key default gen_random_uuid(),
  trans_id text not null unique check (trans_id ~ '^[A-Z0-9]{10}$'),
  trans_time timestamptz,
  amount_kes numeric(12,2) not null check (amount_kes > 0),
  account text,                       -- what the payer typed as the account number
  msisdn text,                        -- Safaricom may send this masked or hashed; shown as received
  payer_name text,
  short_code text,
  match_status text not null default 'unmatched'
    check (match_status in ('matched','amount_short','extra','unmatched')),
  application_id uuid references public.applications(id) on delete set null,
  raw jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists mpesa_transactions_app_idx on public.mpesa_transactions (application_id) where application_id is not null;
create index if not exists mpesa_transactions_created_idx on public.mpesa_transactions (created_at desc);

alter table public.mpesa_transactions enable row level security;
drop policy if exists "admin read mpesa_transactions" on public.mpesa_transactions;
create policy "admin read mpesa_transactions" on public.mpesa_transactions for select to authenticated using (public.is_admin());
revoke all on public.mpesa_transactions from anon;
grant select on public.mpesa_transactions to authenticated;
grant all on public.mpesa_transactions to service_role;

-- ---------------------------------------------------------------------------
-- Called only by the pay-callback edge function (service role). Records the transaction, then matches the
-- account number to an application that was approved and is waiting to pay:
--   matched      account = one business name and the amount covers the price -> application moves to payment_confirming
--   amount_short account matches but less than the price was paid            -> stays approved, admin sees it
--   extra        the application already has a payment waiting               -> admin sees it
--   unmatched    no single business has that name                            -> admin sees it
-- Safaricom retries callbacks, so a repeated trans_id is ignored.
-- ---------------------------------------------------------------------------
create or replace function public.mpesa_record_c2b(
  p_trans_id text, p_amount numeric, p_account text, p_msisdn text, p_name text,
  p_short_code text, p_trans_time timestamptz, p_raw jsonb default '{}'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id text := upper(btrim(coalesce(p_trans_id, '')));
  v_acct text := lower(regexp_replace(btrim(coalesce(p_account, '')), '\s+', ' ', 'g'));
  t public.mpesa_transactions;
  a public.applications;
  n integer := 0;
  v_expected integer;
  v_status text := 'unmatched';
begin
  if v_id !~ '^[A-Z0-9]{10}$' then raise exception 'invalid_trans_id'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;

  insert into public.mpesa_transactions(trans_id, trans_time, amount_kes, account, msisdn, payer_name, short_code, raw)
  values (v_id, p_trans_time, p_amount, nullif(btrim(p_account), ''), nullif(btrim(p_msisdn), ''), nullif(btrim(p_name), ''),
          nullif(btrim(p_short_code), ''), coalesce(p_raw, '{}'))
  on conflict (trans_id) do nothing
  returning * into t;
  if t.id is null then return jsonb_build_object('duplicate', true); end if;

  if v_acct <> '' then
    select count(*) into n from public.applications x
    where x.status in ('approved', 'payment_confirming')
      and lower(regexp_replace(btrim(x.business_name), '\s+', ' ', 'g')) = v_acct;
    if n = 1 then
      select * into a from public.applications x
      where x.status in ('approved', 'payment_confirming')
        and lower(regexp_replace(btrim(x.business_name), '\s+', ' ', 'g')) = v_acct;
      v_expected := coalesce((a.plan_snapshot -> 'priceOverride' ->> 'amount')::integer, a.price_at_submission);
      if a.status = 'payment_confirming' then v_status := 'extra';
      elsif p_amount < v_expected then v_status := 'amount_short';
      else v_status := 'matched';
      end if;
    end if;
  end if;

  if v_status = 'matched' then
    update public.applications set payment_code = v_id, status = 'payment_confirming' where id = a.id;
    insert into public.application_events(application_id, actor, type, data)
    values (a.id, 'system', 'payment_submitted', jsonb_build_object('code', v_id, 'amount', p_amount, 'auto', true));
  end if;

  update public.mpesa_transactions set match_status = v_status, application_id = case when n = 1 then a.id end where id = t.id;

  insert into public.admin_notifications(kind, business_id, data)
  values ('payment_received', null, jsonb_build_object(
    'code', v_id, 'amount', p_amount, 'status', v_status, 'account', nullif(btrim(p_account), ''),
    'application_id', case when n = 1 then a.id end, 'business_name', case when n = 1 then a.business_name end));

  return jsonb_build_object('duplicate', false, 'status', v_status, 'code', v_id, 'amount', p_amount,
    'application_id', case when n = 1 then a.id end, 'reference_no', case when n = 1 then a.reference_no end,
    'business_name', case when n = 1 then a.business_name end);
end $$;
revoke all on function public.mpesa_record_c2b(text, numeric, text, text, text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.mpesa_record_c2b(text, numeric, text, text, text, text, timestamptz, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- One clean list for the admin Payments page: every M-Pesa transaction received (with its outcome),
-- plus payments an admin recorded by hand. Reads respect row level security, so only admins see rows.
-- ---------------------------------------------------------------------------
create or replace view public.admin_payment_queue with (security_invoker = true) as
select
  'tx:' || t.id::text                                   as row_key,
  case
    when exists (select 1 from public.payments p where p.mpesa_code = t.trans_id and p.status = 'confirmed') then 'confirmed'
    when exists (select 1 from public.payments p where p.mpesa_code = t.trans_id and p.status = 'rejected') then 'rejected'
    when t.match_status = 'matched' then 'awaiting_confirmation'
    else t.match_status
  end                                                   as status,
  a.reference_no                                        as reference,
  coalesce(a.business_name, 'No matching business')     as business_name,
  t.account                                             as account,
  t.amount_kes                                          as amount_kes,
  case when a.id is not null
    then coalesce((a.plan_snapshot -> 'priceOverride' ->> 'amount')::integer, a.price_at_submission) end as expected_kes,
  t.trans_id                                            as mpesa_code,
  t.msisdn                                              as phone,
  t.payer_name                                          as payer_name,
  t.short_code                                          as paybill_number,
  (select p.receipt_no from public.payments p where p.mpesa_code = t.trans_id and p.status = 'confirmed' limit 1) as receipt_no,
  coalesce(t.trans_time, t.created_at)                  as at,
  t.application_id                                      as application_id,
  null::uuid                                            as business_id
from public.mpesa_transactions t
left join public.applications a on a.id = t.application_id
union all
select
  'payment:' || p.id::text, p.status, a.reference_no, coalesce(b.name, a.business_name, 'Unknown business'),
  coalesce(p.account_ref, b.name, a.business_name), p.amount_kes, null::integer, p.mpesa_code,
  coalesce(p.phone, a.phone, b.phone), null::text, null::text, p.receipt_no,
  coalesce(p.confirmed_at, p.submitted_at, p.created_at), p.application_id, p.business_id
from public.payments p
left join public.applications a on a.id = p.application_id
left join public.businesses b on b.id = p.business_id
where p.mpesa_code is null
   or not exists (select 1 from public.mpesa_transactions t where t.trans_id = p.mpesa_code);

grant select on public.admin_payment_queue to authenticated;
