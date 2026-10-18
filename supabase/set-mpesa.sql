-- Set EpicMKT's M-Pesa Paybill. Sellers pay to this business number. The account number is their own short code
-- (application reference, then Seller ID), so only the business number goes here.
--
-- 1. Replace 000000 below with your Paybill business number (keep the quotes).
-- 2. Supabase dashboard > SQL Editor > paste this file > Run.
-- Safe to run again. Do not commit your real number to this file.

insert into public.site_settings(key, value)
values ('mpesa', jsonb_build_object('type', 'paybill', 'number', '000000', 'name', 'EpicMKT'))
on conflict (key) do update
  set value = jsonb_build_object('type', 'paybill', 'number', '000000', 'name', 'EpicMKT'),
      updated_at = now();
