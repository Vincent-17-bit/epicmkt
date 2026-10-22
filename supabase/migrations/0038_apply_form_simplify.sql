-- 0038_apply_form_simplify.sql
-- Seller application form, simpler and wider:
--   * Maisha Card is accepted as an ID type next to National ID and Passport.
--   * "Year established" is optional, so a seller is not blocked on a detail that is never used to decide.
-- Existing rows are untouched; both changes only widen what the table accepts.

alter table public.applications
  drop constraint if exists applications_owner_id_type_check;

alter table public.applications
  add constraint applications_owner_id_type_check
  check (owner_id_type in ('national_id', 'maisha_card', 'passport'));

alter table public.applications
  alter column year_established drop not null;
