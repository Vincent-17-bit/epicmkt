create or replace function public.next_receipt_no(p_ts timestamptz default now()) returns text
language sql volatile as $$
  select 'RCT-' || lpad(nextval('public.receipt_seq')::text, 6, '0') $$;
