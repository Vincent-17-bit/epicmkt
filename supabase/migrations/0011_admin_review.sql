create table if not exists public.application_notes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  pinned boolean not null default false,
  tags text[] not null default '{}' check (cardinality(tags) <= 10),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists application_notes_app_idx on public.application_notes (application_id, pinned desc, created_at desc);

drop trigger if exists t_application_notes_touch on public.application_notes;
create trigger t_application_notes_touch before update on public.application_notes
  for each row execute function public.touch_updated_at();

alter table public.application_notes enable row level security;
drop policy if exists "admin role application_notes" on public.application_notes;
create policy "admin role application_notes" on public.application_notes for all to authenticated
  using (public.has_role(array['owner','reviewer'])) with check (public.has_role(array['owner','reviewer']));
grant select, insert, update, delete on public.application_notes to authenticated;

create or replace function public.admin_duplicate_check(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a public.applications%rowtype;
begin
  if not public.has_role(array['owner','reviewer']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into a from public.applications where id = p_id;
  if not found then raise exception 'not_found'; end if;
  return coalesce((
    select jsonb_agg(m order by m ->> 'field', m ->> 'kind')
    from (
      select jsonb_build_object('field', f.field, 'kind', 'application', 'id', o.id, 'reference', o.reference_no,
               'name', o.business_name, 'status', o.status) as m
        from public.applications o
        cross join lateral (values
          ('owner_id_number', o.owner_id_number = a.owner_id_number),
          ('phone', o.phone in (a.phone, coalesce(a.alt_phone, '')) or coalesce(o.alt_phone, '') = a.phone),
          ('email', lower(o.email) = lower(a.email)),
          ('sbp_number', o.sbp_number = a.sbp_number),
          ('kra_pin', a.kra_pin is not null and o.kra_pin = a.kra_pin),
          ('reg_number', a.reg_number is not null and o.reg_number = a.reg_number),
          ('business_name', lower(o.business_name) = lower(a.business_name))
        ) as f(field, hit)
       where o.id <> a.id and f.hit and o.status <> 'uploading'
      union all
      select jsonb_build_object('field', f.field, 'kind', 'business', 'id', b.id, 'reference', b.slug,
               'name', b.name, 'status', b.status)
        from public.businesses b
        cross join lateral (values
          ('phone', b.phone in (a.phone, coalesce(a.alt_phone, ''))),
          ('email', b.email is not null and lower(b.email) = lower(a.email)),
          ('business_name', lower(b.name) = lower(a.business_name))
        ) as f(field, hit)
       where f.hit and b.application_id is distinct from a.id
    ) x
  ), '[]'::jsonb);
end $$;

revoke all on function public.admin_duplicate_check(uuid) from public, anon;
grant execute on function public.admin_duplicate_check(uuid) to authenticated, service_role;
