# Cron runbook: turning the scheduled jobs on

Four jobs keep EpicMKT moving. Without them, queued SMS and email never leave, renewal reminders are never sent and
old proof uploads are never deleted, and nothing in the app fails loudly. The **Automation** page in the admin shows
whether the two messaging jobs are running; `proofs-purge` is checked in the SQL editor (see below).

| Job | Runs | What it does |
| --- | --- | --- |
| `dispatch-messages` | every minute | Sends queued SMS and email, retries failures, holds promotions during quiet hours |
| `daily-lifecycle` | 04:00 UTC (07:00 Nairobi) | Queues renewal reminders, moves listings into grace and expiry |
| `proofs-purge` | 01:00 UTC (04:00 Nairobi) | Deletes proof uploads 90 days after their flag was resolved, and uploads that were never finalized |
| `media-gc` | every 10 minutes | Deletes from Cloudinary the pictures nothing points at any more (removed photos, replaced logos, deleted shops) and settles unfinished uploads. See `docs/cloudinary-images.md` |

The schedule is **not a migration** because it needs secrets that differ per project. Do this once per environment.

1. **Database > Extensions**: enable `pg_cron` and `pg_net`.
2. Set the function secret: `supabase secrets set CRON_SECRET=<long random string>`
3. In the SQL editor, store the same values in Vault:
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
   select vault.create_secret('<the same CRON_SECRET>', 'cron_secret');
   ```
4. Run `supabase/cron/schedule.sql` in the SQL editor. It is safe to run again.
5. Open **Admin > Automation**. The two messaging jobs should read Active. Press **Run now** on each and confirm the last run succeeds.
6. `proofs-purge` is not on that page. Check it in the SQL editor: `select jobname, schedule, active from cron.job;` should list
   all three, and `select status, return_message, start_time from cron.job_run_details d join cron.job j using (jobid) where j.jobname = 'proofs-purge' order by start_time desc limit 5;`
   should show a succeeded run the morning after.

## If the page says something is wrong

- **Scheduler not installed**: step 1 was skipped.
- **Job not scheduled**: step 4 was skipped, or run on another project.
- **Last run failed**: usually the `CRON_SECRET` function secret and the `cron_secret` Vault value differ. Make them identical.
- **Messages waiting for a long time**: the job is paused or failing. Resume or run it, then check the SMS/email provider settings.
- **Run now says it is not configured**: the `project_url` or `cron_secret` Vault secrets are missing (step 3).

Pausing a job is deliberate and audited; the page shows it as Paused until someone resumes it.
