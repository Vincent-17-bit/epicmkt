alter table public.businesses add column if not exists must_change_password boolean not null default false;

create or replace function public.seller_first_login_done(p_business uuid) returns void
language sql security definer set search_path = public as $$
  update public.businesses set must_change_password = false where id = p_business;
$$;

revoke all on function public.seller_first_login_done(uuid) from public, anon, authenticated;
grant execute on function public.seller_first_login_done(uuid) to service_role;
