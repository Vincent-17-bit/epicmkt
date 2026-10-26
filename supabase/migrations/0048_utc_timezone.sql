-- 0048_utc_timezone.sql
-- The time contract (see docs/timezones.md and shared/src/time.js):
--   * Every instant is stored as timestamptz. Postgres keeps it as UTC internally whatever the session zone is.
--   * Every instant leaves the API as ISO 8601 in UTC. The database never formats a time for a viewer; the
--     browser converts to the viewer's zone when it draws the value.
--   * Business calendar days (paid until, opening hours, exception dates, quiet hours) are read in
--     'Africa/Nairobi' with an EXPLICIT zone (public.nairobi_day and friends), so they do not depend on the session zone.
--
-- This migration closes the two remaining ways a session zone could leak into a result.

-- 1. New sessions start in UTC, so timestamptz serialises as "2026-10-25T04:51:00+00:00" for every client.
--    Wrapped so a host that does not let us change database settings does not fail the whole migration run.
do $$
begin
  execute format('alter database %I set timezone to %L', current_database(), 'UTC');
exception when insufficient_privilege then
  raise notice 'Could not set the database time zone. Set it to UTC by hand: alter database % set timezone to ''UTC'';', current_database();
end $$;

-- 2. PostgREST lets a client choose the session zone for a request ("Prefer: timezone=..."). Two functions read the
--    session zone without naming one, so pin it for the length of those calls:
--      admin_analytics  builds a day series with generate_series(date, date, interval) and then casts back with d::date.
--                       That round trip goes through the session zone and can land on the wrong day in a zone whose
--                       daylight saving starts at midnight.
--      log_search       keys its per-client rate limit on current_date.
--    Everything else that turns an instant into a day already names 'Africa/Nairobi'.
alter function public.admin_analytics(integer) set timezone to 'UTC';
alter function public.log_search(text) set timezone to 'UTC';
