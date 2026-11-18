-- Set EpicMKT's M-Pesa Paybill. Sellers pay to this business number. The account number is their own short code
-- (application reference, then Seller ID), so only the business number goes here.
--
-- 1. Replace 000000 below with your Paybill business number (keep the quotes).
-- 2. "stk": turns on "Pay now" (an M-Pesa PIN prompt sent to the payer's phone, STK Push). Leave it false until the Daraja
--    secrets are set (MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_STK_SHORTCODE, MPESA_STK_PASSKEY, see .env.example)
--    and pay-stk-start, pay-stk-status, pay-reconcile and pay-callback are deployed. Then set it to true and run this again.
--    While it is false (or if the secrets are missing) the pages show the Paybill details only, exactly as before.
-- 3. Supabase dashboard > SQL Editor > paste this file > Run.
-- Safe to run again. Do not commit your real number to this file.

insert into public.site_settings(key, value)
values ('mpesa', jsonb_build_object('type', 'paybill', 'number', '000000', 'name', 'EpicMKT', 'stk', false))
on conflict (key) do update
  set value = jsonb_build_object('type', 'paybill', 'number', '000000', 'name', 'EpicMKT', 'stk', false),
      updated_at = now();
