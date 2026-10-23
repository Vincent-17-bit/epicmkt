-- 0038_apply_form_simplify.sql
-- Seller application form, simpler and wider:
--   * Maisha Card is accepted as an ID type next to National ID and Passport.
--   * "Year established" is optional, so a seller is not blocked on a detail that is never used to decide.
-- Existing rows are untouched; both changes only widen what the table accepts.
-- Safe to run more than once, and safe whatever the old check constraint was called.

do $$
declare
  c record;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.applications'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%owner_id_type%'
  loop
    execute format('alter table public.applications drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.applications
  add constraint applications_owner_id_type_check
  check (owner_id_type in ('national_id', 'maisha_card', 'passport'));

alter table public.applications
  alter column year_established drop not null;
