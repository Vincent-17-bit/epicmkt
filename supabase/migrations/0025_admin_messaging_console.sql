-- 0025_admin_messaging_console.sql
-- B5a message log and templates; B5b Automation (the cron jobs: see them, pause them, run them now).
--
-- Roles: the log and retrying are owner, reviewer or support (the people who message sellers); templates may be
-- read by any admin and changed by the owner only; the automation controls are owner only, the status is readable
-- by any admin. Every change writes the audit log. Safe to run more than once.
--
-- The cron functions touch pg_cron, pg_net and Vault only through dynamic SQL after checking they exist, so this
-- migration applies on a project where they are not enabled yet; the Automation screen then says "not installed"
-- instead of failing. The real schedule is supabase/cron/schedule.sql.

-- ---------------------------------------------------------------------------
-- Message log (delivery records for SMS and email, and admin in-app sends)
-- ---------------------------------------------------------------------------
create or replace function public.admin_message_log_query(
  p_channel text default 'all', p_status text default 'all', p_search text default null,
  p_limit integer default 50, p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_total bigint;
  v_rows jsonb;
begin
  if not public.has_role(array['owner', 'reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(p_channel, 'all') not in ('all', 'sms', 'email', 'in_app') then raise exception 'invalid_channel'; end if;
  if coalesce(p_status, 'all') not in ('all', 'queued', 'sent', 'delivered', 'failed') then raise exception 'invalid_status'; end if;

  select count(*) into v_total
    from public.messages m left join public.businesses b on b.id = m.business_id
   where m.sender <> 'seller'
     and (coalesce(p_channel, 'all') = 'all' or m.channel = p_channel)
     and (coalesce(p_status, 'all') = 'all' or m.status = p_status)
     and (v_search is null or m.subject ilike '%' || v_search || '%' or m.to_address ilike '%' || v_search || '%'
          or m.template_key ilike '%' || v_search || '%' or b.name ilike '%' || v_search || '%');

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) into v_rows from (
    select m.id, m.created_at, m.channel, m.status, m.kind, m.subject, m.template_key, m.to_address, m.transactional,
           m.business_id, b.name as business_name, m.application_id, m.attempts, m.error, m.cost_kes, m.scheduled_at, m.sent_at
      from public.messages m left join public.businesses b on b.id = m.business_id
     where m.sender <> 'seller'
       and (coalesce(p_channel, 'all') = 'all' or m.channel = p_channel)
       and (coalesce(p_status, 'all') = 'all' or m.status = p_status)
       and (v_search is null or m.subject ilike '%' || v_search || '%' or m.to_address ilike '%' || v_search || '%'
            or m.template_key ilike '%' || v_search || '%' or b.name ilike '%' || v_search || '%')
     order by m.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
  ) x;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end $$;

create or replace function public.admin_message_summary(p_days integer default 7) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_days integer := least(greatest(coalesce(p_days, 7), 1), 90);
begin
  if not public.has_role(array['owner', 'reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'days', v_days,
    'by_status', coalesce((
      select jsonb_object_agg(s.status, s.n) from (
        select m.status, count(*) as n from public.messages m
         where m.sender <> 'seller' and m.channel in ('sms', 'email') and m.created_at >= now() - make_interval(days => v_days)
         group by m.status) s), '{}'::jsonb),
    'cost_kes', coalesce((select sum(m.cost_kes) from public.messages m
       where m.channel = 'sms' and m.created_at >= now() - make_interval(days => v_days)), 0),
    'queued_now', (select count(*) from public.messages m where m.status = 'queued' and m.channel in ('sms', 'email')),
    'due_now', (select count(*) from public.messages m where m.status = 'queued' and m.channel in ('sms', 'email') and m.scheduled_at <= now()),
    'oldest_due_at', (select min(m.scheduled_at) from public.messages m where m.status = 'queued' and m.channel in ('sms', 'email') and m.scheduled_at <= now()),
    'failed_now', (select count(*) from public.messages m where m.status = 'failed' and m.created_at >= now() - make_interval(days => v_days))
  );
end $$;

create or replace function public.admin_retry_message(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare m public.messages;
begin
  if not public.has_role(array['owner', 'reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into m from public.messages where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if m.status <> 'failed' then raise exception 'not_failed'; end if;
  update public.messages set status = 'queued', attempts = 0, error = null, scheduled_at = now() where id = p_id;
  perform public.admin_audit_action('message.retry', 'message', p_id::text,
    jsonb_build_object('status', 'failed', 'error', m.error), jsonb_build_object('status', 'queued'), null, m.business_id);
  return true;
end $$;

-- Put every message that failed in the last p_days days back in the queue (at most 200 at a time).
create or replace function public.admin_retry_failed_messages(p_days integer default 7) returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if not public.has_role(array['owner', 'reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  with picked as (
    select id from public.messages
     where status = 'failed' and created_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90))
     order by created_at desc limit 200 for update skip locked
  ), upd as (
    update public.messages m set status = 'queued', attempts = 0, error = null, scheduled_at = now()
      from picked where m.id = picked.id returning m.id
  )
  select count(*) into v_n from upd;
  if v_n > 0 then
    perform public.admin_audit_action('message.retry_failed', 'message_batch', null, null, jsonb_build_object('count', v_n), null, null);
  end if;
  return v_n;
end $$;

-- ---------------------------------------------------------------------------
-- Templates
-- ---------------------------------------------------------------------------
create or replace function public.admin_templates_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.key)
    from (
      select t.key, t.channel, t.subject, t.body_en, t.body_sw, t.transactional, t.version, t.updated_at,
             (select count(*) from public.messages m where m.template_key = t.key and m.created_at >= now() - interval '30 days') as used_30d
        from public.message_templates t
    ) x
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_save_template(
  p_key text, p_channel text, p_subject text, p_body_en text, p_body_sw text default null, p_transactional boolean default false
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_key text := btrim(coalesce(p_key, ''));
  v_subject text := nullif(btrim(coalesce(p_subject, '')), '');
  v_en text := btrim(coalesce(p_body_en, ''));
  v_sw text := nullif(btrim(coalesce(p_body_sw, '')), '');
  old public.message_templates;
  v_version integer;
begin
  if not public.has_role(array['owner']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_key !~ '^[a-z0-9_.-]{2,60}$' then raise exception 'invalid_key'; end if;
  if p_channel not in ('sms', 'email', 'in_app') then raise exception 'invalid_channel'; end if;
  if char_length(v_en) not between 1 and 4000 or (v_sw is not null and char_length(v_sw) > 4000) then raise exception 'invalid_input'; end if;
  if p_channel = 'sms' and (char_length(v_en) > 612 or char_length(coalesce(v_sw, '')) > 612) then raise exception 'sms_too_long'; end if;
  if p_channel = 'email' and v_subject is null then raise exception 'subject_required'; end if;

  select * into old from public.message_templates where key = v_key for update;
  if found then
    if old.channel <> p_channel then raise exception 'channel_locked'; end if; -- jobs and sends rely on the channel
    update public.message_templates
       set subject = v_subject, body_en = v_en, body_sw = v_sw, transactional = coalesce(p_transactional, false),
           version = old.version + 1, updated_by = auth.uid(), updated_at = now()
     where key = v_key returning version into v_version;
  else
    insert into public.message_templates (key, channel, subject, body_en, body_sw, transactional, updated_by)
    values (v_key, p_channel, v_subject, v_en, v_sw, coalesce(p_transactional, false), auth.uid())
    returning version into v_version;
  end if;

  perform public.admin_audit_action(case when old.key is null then 'template.create' else 'template.update' end, 'template', v_key,
    case when old.key is null then null else jsonb_build_object('version', old.version, 'body_en', old.body_en, 'subject', old.subject) end,
    jsonb_build_object('version', v_version, 'body_en', v_en, 'subject', v_subject), null, null);
  return v_version;
end $$;

-- ---------------------------------------------------------------------------
-- Automation: the two scheduled jobs
-- ---------------------------------------------------------------------------
create or replace function public.admin_job_names() returns text[]
language sql immutable as $$ select array['dispatch-messages', 'daily-lifecycle'] $$;

create or replace function public.admin_automation_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_installed boolean := to_regclass('cron.job') is not null;
  v_runs boolean := to_regclass('cron.job_run_details') is not null;
  v_jobs jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  if v_installed then
    execute format($q$
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', j.jobname, 'schedule', j.schedule, 'active', j.active,
        'last_run', %s) order by j.jobname), '[]'::jsonb)
      from cron.job j
      where j.jobname = any (public.admin_job_names())
    $q$, case when v_runs then $r$(
        select jsonb_build_object('status', d.status, 'started_at', d.start_time, 'ended_at', d.end_time, 'message', left(d.return_message, 300))
          from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1)$r$
      else 'null' end) into v_jobs;
  end if;

  return jsonb_build_object(
    'cron_installed', v_installed,
    'net_installed', to_regnamespace('net') is not null,
    'expected', to_jsonb(public.admin_job_names()),
    'jobs', v_jobs,
    'queue', jsonb_build_object(
      'queued', (select count(*) from public.messages where status = 'queued' and channel in ('sms', 'email')),
      'due_now', (select count(*) from public.messages where status = 'queued' and channel in ('sms', 'email') and scheduled_at <= now()),
      'oldest_due_at', (select min(scheduled_at) from public.messages where status = 'queued' and channel in ('sms', 'email') and scheduled_at <= now()),
      'failed_7d', (select count(*) from public.messages where status = 'failed' and created_at >= now() - interval '7 days')),
    'last_sent_at', (select max(sent_at) from public.messages where channel in ('sms', 'email') and status in ('sent', 'delivered')),
    'last_reminder_at', (select max(created_at) from public.messages where kind in ('reminder', 'grace', 'expiry'))
  );
end $$;

create or replace function public.admin_set_job_active(p_name text, p_active boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_was boolean;
begin
  if not public.has_role(array['owner']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not (p_name = any (public.admin_job_names())) then raise exception 'unknown_job'; end if;
  if to_regclass('cron.job') is null then raise exception 'cron_not_installed'; end if;
  execute 'select jobid, active from cron.job where jobname = $1' into v_id, v_was using p_name;
  if v_id is null then raise exception 'job_not_scheduled'; end if;
  if v_was is distinct from coalesce(p_active, false) then
    execute 'select cron.alter_job($1, active := $2)' using v_id, coalesce(p_active, false);
    perform public.admin_audit_action(case when p_active then 'job.resume' else 'job.pause' end, 'job', p_name,
      jsonb_build_object('active', v_was), jsonb_build_object('active', coalesce(p_active, false)), null, null);
  end if;
  return true;
end $$;

-- Run a job right now, exactly as the schedule does (same URL, same secret from Vault). Returns the pg_net request id.
create or replace function public.admin_run_job(p_name text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text; v_req bigint;
begin
  if not public.has_role(array['owner']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not (p_name = any (public.admin_job_names())) then raise exception 'unknown_job'; end if;
  if to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') is null or to_regclass('vault.decrypted_secrets') is null then
    raise exception 'automation_not_configured';
  end if;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'project_url'$q$ into v_url;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'$q$ into v_secret;
  if v_url is null or v_secret is null then raise exception 'automation_not_configured'; end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 55000)'
    into v_req using v_url || '/functions/v1/' || p_name,
    jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret), '{}'::jsonb;
  perform public.admin_audit_action('job.run', 'job', p_name, null, jsonb_build_object('request_id', v_req), null, null);
  return v_req;
end $$;

-- ---------------------------------------------------------------------------
-- Who may call what: signed-in users only; each function checks the admin role itself.
-- ---------------------------------------------------------------------------
revoke all on function public.admin_message_log_query(text, text, text, integer, integer), public.admin_message_summary(integer),
  public.admin_retry_message(uuid), public.admin_retry_failed_messages(integer), public.admin_templates_list(),
  public.admin_save_template(text, text, text, text, text, boolean), public.admin_job_names(), public.admin_automation_status(),
  public.admin_set_job_active(text, boolean), public.admin_run_job(text)
  from public, anon;
grant execute on function public.admin_message_log_query(text, text, text, integer, integer), public.admin_message_summary(integer),
  public.admin_retry_message(uuid), public.admin_retry_failed_messages(integer), public.admin_templates_list(),
  public.admin_save_template(text, text, text, text, text, boolean), public.admin_job_names(), public.admin_automation_status(),
  public.admin_set_job_active(text, boolean), public.admin_run_job(text)
  to authenticated, service_role;
