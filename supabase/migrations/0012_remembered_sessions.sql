alter table public.status_sessions add column if not exists remembered boolean not null default false;
