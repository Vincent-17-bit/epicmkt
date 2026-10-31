-- Cron schedule for the background jobs (messages, daily lifecycle, proof clean-up, media clean-up). Not a migration: pg_cron and
-- pg_net are enabled per project, and the secrets differ between projects. Run this whole file once in the SQL editor of each
-- environment. It is safe to run again: scheduling an existing job name replaces it.
--
-- It needs, and checks for, these (the guard below stops with a plain message if one is missing):
--   * extensions pg_cron and pg_net (created below if the project allows it)
--   * Vault secret 'project_url': the project URL, https://<ref>.supabase.co, no path
--   * Vault secret 'cron_secret': the same value as the CRON_SECRET function secret
-- Vault and the function secret are what "Run now" on Admin > Automation already uses, so if "Run now" did not say
-- "not configured", both Vault secrets exist.
--
-- Messaging only really sends when the functions run live. Set these function secrets BEFORE running this file, or the
-- every-minute job would mark queued messages as sent without sending them (mock mode):
--   APP_ENV=production        (or MESSAGING_MODE=live)
--   AT_API_KEY, AT_USERNAME   (and AT_SENDER if you use a sender id)  for SMS
--   RESEND_API_KEY, MAIL_FROM                                          for email
--
-- pg_cron runs in UTC. Nairobi is UTC+3 all year (no daylight saving).

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $guard$
declare
  v_id uuid;
  v_url text;
  v_secret text;
begin
  if to_regnamespace('cron') is null then
    raise exception 'pg_cron is not enabled: Database > Extensions > pg_cron, then run this file again';
  end if;
  if to_regnamespace('net') is null then
    raise exception 'pg_net is not enabled: Database > Extensions > pg_net, then run this file again';
  end if;
  if to_regclass('vault.decrypted_secrets') is null then
    raise exception 'Vault is not available on this project';
  end if;

  select id, decrypted_secret into v_id, v_url
    from vault.decrypted_secrets where name = 'project_url' order by created_at desc limit 1;
  if v_url is null or v_url !~ '^https://[^/\s]+/?$' then
    raise exception 'Vault secret project_url is missing or is not a bare https URL (https://<ref>.supabase.co)';
  end if;
  -- A trailing slash would make the job call https://ref.supabase.co//functions/v1/... and get a 404. Fix it once, here.
  if right(v_url, 1) = '/' then
    perform vault.update_secret(v_id, rtrim(v_url, '/'));
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'cron_secret' order by created_at desc limit 1;
  if v_secret is null or length(v_secret) < 16 then
    raise exception 'Vault secret cron_secret is missing or shorter than 16 characters; it must equal the CRON_SECRET function secret';
  end if;
end $guard$;

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
--   select cron.unschedule('media-gc');

-- media-gc: every 10 minutes. Deletes from Cloudinary the pictures nothing points at any more (removed photos, replaced logos,
-- deleted shops) and settles uploads that were signed but never attached. Failed deletes are retried with a growing pause.
select cron.schedule(
  'media-gc',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/media-gc',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
