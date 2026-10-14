create sequence if not exists public.rct_seq;

create or replace function public.next_rct_no() returns text
language sql security definer set search_path = public as
$$ select 'RCT-' || lpad(nextval('public.rct_seq')::text, 6, '0') $$;

revoke all on function public.next_rct_no() from public, anon, authenticated;
grant execute on function public.next_rct_no() to service_role;
grant usage, select on sequence public.rct_seq to service_role;
