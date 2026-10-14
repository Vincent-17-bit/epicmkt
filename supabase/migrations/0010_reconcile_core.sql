alter table public.audit_log
  add column if not exists actor_email text,
  add column if not exists target_type text,
  add column if not exists target_id uuid,
  add column if not exists before jsonb,
  add column if not exists after jsonb,
  add column if not exists reason text,
  add column if not exists ip text;
alter table public.audit_log alter column actor_role set default 'admin';
create index if not exists audit_target_idx on public.audit_log (target_type, target_id, created_at desc);

alter table public.businesses
  add column if not exists owner_name text,
  add column if not exists monthly_price integer,
  add column if not exists status_reason text,
  add column if not exists featured_until timestamptz,
  add column if not exists featured_rank integer,
  add column if not exists strikes integer not null default 0,
  add column if not exists must_change_password boolean not null default false,
  add column if not exists first_paid_at timestamptz,
  add column if not exists last_login_at timestamptz,
  add column if not exists last_edit_at timestamptz;

update public.businesses b set monthly_price = coalesce(
  (select p.price_kes from public.plans p where p.category_id = b.category_id and p.plan_key = b.plan_key), 0)
where b.monthly_price is null;
update public.businesses b set owner_name = a.owner_full_name
  from public.applications a where a.id = b.application_id and b.owner_name is null;
update public.businesses b set first_paid_at = (
  select min(p.confirmed_at) from public.payments p where p.business_id = b.id and p.status = 'confirmed')
where b.first_paid_at is null;
alter table public.businesses alter column monthly_price set default 0, alter column monthly_price set not null;

alter table public.businesses drop constraint if exists businesses_status_check;
alter table public.businesses add constraint businesses_status_check
  check (status in ('pending','live','paused','suspended','expired','unlisted','deleted'));
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

alter table public.messages alter column business_id drop not null, alter column subject drop not null;
alter table public.messages
  add column if not exists application_id uuid references public.applications(id) on delete set null,
  add column if not exists channel text not null default 'in_app' check (channel in ('sms','email','in_app','whatsapp_link')),
  add column if not exists template_key text,
  add column if not exists to_address text,
  add column if not exists status text not null default 'delivered' check (status in ('queued','sent','delivered','failed')),
  add column if not exists provider_id text,
  add column if not exists cost_kes numeric(8,2),
  add column if not exists error text,
  add column if not exists attempts integer not null default 0,
  add column if not exists transactional boolean not null default true,
  add column if not exists scheduled_at timestamptz not null default now(),
  add column if not exists sent_at timestamptz;
create index if not exists messages_queue_idx on public.messages (status, scheduled_at);
create index if not exists messages_application_idx on public.messages (application_id) where application_id is not null;

create or replace function public.messages_stamp() returns trigger
language plpgsql as $$
begin
  if new.channel <> 'in_app' and new.read_at is null then new.read_at := now(); end if;
  return new;
end $$;
drop trigger if exists t_messages_stamp on public.messages;
create trigger t_messages_stamp before insert on public.messages for each row execute function public.messages_stamp();

drop policy if exists "seller reads own messages" on public.messages;
create policy "seller reads own messages" on public.messages for select to authenticated
  using (channel = 'in_app' and business_id = public.my_business_id());

alter table public.admin_notifications
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists link text,
  add column if not exists read_by uuid[] not null default '{}';

create or replace function public.admin_counts() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then jsonb_build_object(
    'submitted',          (select count(*) from applications where status = 'submitted'),
    'under_review',       (select count(*) from applications where status = 'under_review'),
    'changes_requested',  (select count(*) from applications where status = 'changes_requested'),
    'awaiting_payment',   (select count(*) from applications where status = 'approved'),
    'payment_confirming', (select count(*) from applications where status = 'payment_confirming'),
    'live',               (select count(*) from businesses b where public.business_is_visible(b)),
    'expiring_7d',        (select count(*) from businesses where status = 'live' and deleted_at is null and paid_until is not null
                             and public.nairobi_day(paid_until) between public.nairobi_today() and public.nairobi_today() + 7),
    'in_grace',           (select count(*) from businesses where status = 'live' and deleted_at is null and paid_until is not null
                             and public.nairobi_day(paid_until) < public.nairobi_today()
                             and public.nairobi_today() <= public.nairobi_day(paid_until) + public.grace_days()),
    'expired',            (select count(*) from businesses where status in ('live','expired') and deleted_at is null and paid_until is not null
                             and public.nairobi_today() > public.nairobi_day(paid_until) + public.grace_days()),
    'suspended',          (select count(*) from businesses where status = 'suspended' and deleted_at is null),
    'open_flags',         (select count(*) from flags where status in ('open','investigating')),
    'open_reports',       (select count(*) from reports where status in ('open','investigating')),
    'unconfirmed_payments', (select count(*) from payments where status = 'submitted'),
    'failed_messages',    (select count(*) from messages where status = 'failed'),
    'pending_changes',    (select count(*) from change_requests where status = 'pending')
  ) else '{}'::jsonb end;
$$;
revoke all on function public.admin_counts() from public, anon;
grant execute on function public.admin_counts() to authenticated;
