-- 0067_retire_seller_quiet_hours.sql
-- Sellers no longer have quiet hours. The setting was switched on for everyone by default (21:00 to 07:00) and has been
-- taken out of the seller portal, so nothing is left that could turn it off: it would have held every non-critical text
-- and email overnight for good.
--
-- notify_quiet_release(...) now always answers "not in quiet hours", so messages_apply_seller_prefs() queues each message
-- for the time it was given. The function and its trigger stay in place (same signature, same grants) so nothing else has
-- to change, and any quiet_hours value already saved in seller_settings is simply ignored. The site-wide quiet hours an
-- admin sets in site_settings are a separate thing and are not touched.

create or replace function public.notify_quiet_release(p_settings jsonb, p_now timestamptz) returns timestamptz
language sql immutable as $$
  select null::timestamptz
$$;

revoke all on function public.notify_quiet_release(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.notify_quiet_release(jsonb, timestamptz) to service_role;
