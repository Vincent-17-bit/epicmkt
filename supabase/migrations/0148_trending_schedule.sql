-- The trending lists are rebuilt at :02 past each hour (was :12). search-rollups, which the trending job reads after, moves to :57 so
-- the dictionary is always finished before. supabase/cron/schedule.sql carries the same times for a fresh project.
do $$
declare v_id bigint;
begin
  if to_regnamespace('cron') is null then
    return;
  end if;
  select jobid into v_id from cron.job where jobname = 'search-rollups';
  if v_id is not null then
    perform cron.alter_job(v_id, schedule := '57 * * * *');
  end if;
  select jobid into v_id from cron.job where jobname = 'trending';
  if v_id is not null then
    perform cron.alter_job(v_id, schedule := '2 * * * *');
  end if;
exception when others then
  raise notice 'trending schedule not changed here (%); run supabase/cron/schedule.sql instead', sqlerrm;
end $$;
