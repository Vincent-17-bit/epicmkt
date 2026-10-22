-- Cron schedule for the background jobs (messages, daily lifecycle, proof clean-up). Not a migration: pg_cron and pg_net are enabled per project,
-- and the secrets below differ between projects. Run it once in the SQL editor of each environment.
--
-- Before running:
--   1. Database > Extensions: enable pg_cron and pg_net.
--   2. Set the function secret (the functions read it as CRON_SECRET):
--        supabase secrets set CRON_SECRET=<long random string>
--   3. Store the same values in Vault so the jobs can read them:
--        select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--        select vault.create_secret('<the same CRON_SECRET>', 'cron_secret');
--
-- pg_cron runs in UTC. Nairobi is UTC+3 all year (no daylight saving).
-- Scheduling an existing job name replaces it, so this file is safe to re-run.

-- dispatch-messages: every minute. Sends queued SMS/email, applies retries and quiet hours.
select cron.schedule(
  'dispatch-messages',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/dispatch-messages',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- daily-lifecycle: 04:00 UTC = 07:00 Nairobi, the moment quiet hours end, so reminders arrive at a civil hour.
select cron.schedule(
  'daily-lifecycle',
  '0 4 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/daily-lifecycle',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- proofs-purge: 01:00 UTC = 04:00 Nairobi, off peak. Deletes proof uploads 90 days after their flag was resolved and
-- uploads that were never finalized (pending for over an hour), from storage and from flag_attachments.
select cron.schedule(
  'proofs-purge',
  '0 1 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/proofs-purge',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- To inspect or remove:
--   select jobid, jobname, schedule, active from cron.job;
--   select cron.unschedule('dispatch-messages');
--   select cron.unschedule('daily-lifecycle');
--   select cron.unschedule('proofs-purge');
