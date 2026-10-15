alter table public.audit_log alter column actor_role set default 'admin';

alter table public.businesses
  add column if not exists must_change_password boolean not null default false;

update public.businesses b set monthly_price = coalesce(
  (select p.price_kes from public.plans p where p.category_id = b.category_id and p.plan_key = b.plan_key), 0)
where b.monthly_price is null;
update public.businesses b set owner_name = a.owner_full_name
  from public.applications a where a.id = b.application_id and b.owner_name is null;
update public.businesses b set first_paid_at = (
  select min(p.confirmed_at) from public.payments p where p.business_id = b.id and p.status = 'confirmed')
where b.first_paid_at is null;
alter table public.businesses alter column monthly_price set default 0, alter column monthly_price set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'businesses_slug_format') then
    alter table public.businesses add constraint businesses_slug_format check (slug ~ '^[a-z0-9-]{3,60}$') not valid;
  end if;
end $$;

alter table public.payments
  add column if not exists application_id uuid references public.applications(id) on delete set null,
  add column if not exists months integer not null default 1 check (months between 1 and 24),
  add column if not exists phone text,
  add column if not exists confirmed_by uuid references auth.users(id),
  add column if not exists notes text;
alter table public.payments alter column business_id drop not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_target_check') then
    alter table public.payments add constraint payments_target_check
      check (business_id is not null or application_id is not null);
  end if;
end $$;
create index if not exists payments_application_idx on public.payments (application_id) where application_id is not null;

create or replace function public.messages_stamp() returns trigger
language plpgsql as $$
begin
  if new.channel <> 'in_app' and new.read_at is null then new.read_at := now(); end if;
  return new;
end $$;
drop trigger if exists t_messages_stamp on public.messages;
create trigger t_messages_stamp before insert on public.messages for each row execute function public.messages_stamp();
