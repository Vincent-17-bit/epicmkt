grant usage on schema public to anon, authenticated, service_role;

grant select on public.categories, public.plans, public.global_limits, public.legal_docs to anon, authenticated;

grant select, insert, update, delete on
  public.categories, public.plans, public.global_limits, public.legal_docs, public.site_settings,
  public.applications, public.application_documents, public.application_flags, public.application_events
to authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on function public.hit_rate_limit(text, int, int) to service_role;
grant execute on function public.is_admin() to authenticated;
