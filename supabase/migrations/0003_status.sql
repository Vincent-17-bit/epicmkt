alter table public.application_flags add column if not exists addressed_at timestamptz;

alter table public.application_documents
  add column if not exists replacement_path text unique,
  add column if not exists replacement_name text,
  add column if not exists replacement_mime text,
  add column if not exists replacement_size integer;

create index if not exists otp_requests_lookup_idx on public.otp_requests (reference_no, phone, created_at desc);
create index if not exists application_flags_app_idx on public.application_flags (application_id, status);
create index if not exists status_sessions_expiry_idx on public.status_sessions (expires_at);
