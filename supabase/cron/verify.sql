-- Run after schedule.sql, then again a few minutes later. Read-only.

-- 1. All four jobs exist and are active.
select jobname, schedule, active from cron.job order by jobname;

-- 2. What the scheduler itself did. "succeeded" only means the HTTP request was queued, not that the function worked: see 3.
select j.jobname, d.status, left(d.return_message, 120) as message, d.start_time
from cron.job_run_details d join cron.job j using (jobid)
order by d.start_time desc limit 12;

-- 3. What the functions answered (pg_net keeps about six hours).
--    200 = worked.  401 = CRON_SECRET function secret and Vault cron_secret differ.  404 = function not deployed
--    (or project_url wrong).  500 = open the function logs.  A 200 whose body says "dev":true means mock mode:
--    set APP_ENV=production or MESSAGING_MODE=live.
select id, status_code, left(content, 200) as body, error_msg, created
from net._http_response order by created desc limit 12;

-- 4. The queue should be draining: due_now falls to 0, sent rises, failed stays 0.
select count(*) filter (where status = 'queued') as queued,
       count(*) filter (where status = 'queued' and scheduled_at <= now()) as due_now,
       count(*) filter (where status = 'failed' and created_at >= now() - interval '7 days') as failed_7d,
       max(sent_at) filter (where status in ('sent', 'delivered')) as last_sent
from public.messages where channel in ('sms', 'email');
