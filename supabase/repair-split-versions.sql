-- One-off, safe to run twice. Run in the Supabase SQL editor BEFORE `supabase db push` / `git pull` on an existing project.
-- It renames the history rows for the four files whose version numbers used to clash (0042 x2, 0046 x2):
--   0042_browse_snapshot -> 004200   0042_search_postgis -> 004201   0046_item_availability -> 004600   0046_store_offers -> 004601
-- It only RECORDS that these were applied; it does not run them. Every migration up to 0064 must already be applied.
begin;
delete from supabase_migrations.schema_migrations where version in ('0042', '0046');
insert into supabase_migrations.schema_migrations (version, name) values
  ('004200', 'browse_snapshot'), ('004201', 'search_postgis'),
  ('004600', 'item_availability'), ('004601', 'store_offers')
on conflict (version) do nothing;
commit;
select version, name from supabase_migrations.schema_migrations where version in ('004200','004201','004600','004601') order by version;
