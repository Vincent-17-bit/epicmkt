create table public.site_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.site_config enable row level security;

create policy "public read site config" on public.site_config
  for select to anon, authenticated using (true);
create policy "admin write site config" on public.site_config
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.site_config to anon, authenticated;
grant insert, update, delete on public.site_config to authenticated;
grant all on public.site_config to service_role;
