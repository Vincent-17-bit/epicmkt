-- 0081_admin_all_scheduled_jobs.sql
-- Admin > Automation watched two of the four scheduled jobs. proofs-purge and media-gc (both in supabase/cron/schedule.sql)
-- could not be seen, paused or run from the admin.
--
-- admin_automation_status() (what is shown), admin_set_job_active() (pause / resume) and admin_run_job() (Run now) all work
-- from this one list, so listing the two missing jobs gives them the same view / pause / run-now controls as the others.
-- Run now calls /functions/v1/<name> with the cron secret, exactly as the schedule does, and both functions accept it.
--
-- A job that is listed but not scheduled in the project shows as "Not scheduled" with the fix: re-run supabase/cron/schedule.sql.
-- Keep this list equal to the jobs in schedule.sql; scripts/cron-schedule.test.mjs fails if they differ.
create or replace function public.admin_job_names() returns text[]
language sql immutable as $$ select array['dispatch-messages', 'daily-lifecycle', 'proofs-purge', 'media-gc'] $$;
