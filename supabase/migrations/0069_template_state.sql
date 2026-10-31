-- 0069_template_state.sql
-- Message templates can be disabled, enabled and deleted, and a broadcast to one category accepts the category's name.
--
--   * disabled_at: a disabled template cannot be used for a broadcast (admin-message answers template_disabled).
--   * Delete is refused with template_in_use for the keys the system itself writes into messages: welcome, login_details,
--     application.* (admin-decide-application) and billing_* (the daily lifecycle). Disable those instead.
--   * Owner only, like editing a template. Every change is audited.
--   * message_segment('category:<x>') matched the category id only, but the admin pickers list category names.
--     It now matches either. This is the 0029 definition with that one branch widened.
--
-- Additive and safe to re-run.
--
-- ROLLBACK (run by hand):
--   drop function if exists public.admin_delete_template(text);
--   drop function if exists public.admin_set_template_enabled(text, boolean);
--   drop function if exists public.message_template_is_system(text);
--   alter table public.message_templates drop column if exists disabled_at;
--   re-run "create or replace function public.admin_templates_list" from 0025 and "message_segment" from 0029.

alter table public.message_templates add column if not exists disabled_at timestamptz;

create or replace function public.message_template_is_system(p_key text) returns boolean
language sql immutable as $$
  select p_key in ('welcome', 'login_details') or p_key like 'application.%' or p_key like 'billing\_%'
$$;
revoke all on function public.message_template_is_system(text) from public, anon;
grant execute on function public.message_template_is_system(text) to authenticated, service_role;

create or replace function public.admin_templates_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.key)
    from (
      select t.key, t.channel, t.subject, t.body_en, t.body_sw, t.transactional, t.version, t.updated_at,
             t.disabled_at, public.message_template_is_system(t.key) as system,
             (select count(*) from public.messages m where m.template_key = t.key and m.created_at >= now() - interval '30 days') as used_30d
        from public.message_templates t
    ) x
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_set_template_enabled(p_key text, p_enabled boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  t public.message_templates;
begin
  if not public.has_role(array['owner']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_key is null or p_enabled is null then raise exception 'invalid_input'; end if;
  select * into t from public.message_templates where key = p_key for update;
  if not found then raise exception 'template_not_found'; end if;
  if (t.disabled_at is null) = p_enabled then return false; end if;

  update public.message_templates set disabled_at = case when p_enabled then null else now() end where key = p_key;
  perform public.admin_audit_action(case when p_enabled then 'template.enable' else 'template.disable' end, 'template', p_key,
    jsonb_build_object('enabled', t.disabled_at is null), jsonb_build_object('enabled', p_enabled), null, null);
  return true;
end $$;
revoke all on function public.admin_set_template_enabled(text, boolean) from public, anon;
grant execute on function public.admin_set_template_enabled(text, boolean) to authenticated, service_role;

create or replace function public.admin_delete_template(p_key text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  t public.message_templates;
begin
  if not public.has_role(array['owner']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_key is null then raise exception 'invalid_input'; end if;
  select * into t from public.message_templates where key = p_key for update;
  if not found then raise exception 'template_not_found'; end if;
  if public.message_template_is_system(p_key) then raise exception 'template_in_use'; end if;

  delete from public.message_templates where key = p_key;
  perform public.admin_audit_action('template.delete', 'template', p_key,
    jsonb_build_object('channel', t.channel, 'subject', t.subject, 'body_en', t.body_en, 'version', t.version), null, null, null);
  return true;
end $$;
revoke all on function public.admin_delete_template(text) from public, anon;
grant execute on function public.admin_delete_template(text) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.message_segment(p_segment text, p_now timestamp with time zone DEFAULT now())
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- `return query` does not end a set-returning function, so each branch returns explicitly.
  if p_segment = 'all_live' then
    return query select id from public.businesses where status = 'live';
    return;
  elsif p_segment = 'expiring_7d' then
    return query select id from public.businesses
      where status = 'live' and paid_until is not null
        and public.nairobi_day(paid_until) between public.nairobi_day(p_now) and public.nairobi_day(p_now) + 7;
    return;
  elsif p_segment = 'in_grace' then
    return query select id from public.businesses
      where status <> 'deleted' and paid_until is not null and public.listing_state(paid_until, p_now, grace_days) = 'grace';
    return;
  elsif p_segment = 'expired' then
    return query select id from public.businesses
      where status <> 'deleted' and paid_until is not null and public.listing_state(paid_until, p_now, grace_days) = 'expired';
    return;
  elsif p_segment like 'category:%' then
    return query select b.id from public.businesses b
      where b.status = 'live'
        and (b.category_id = substr(p_segment, 10)
             or b.category_id in (select c.id from public.categories c where lower(c.name) = lower(btrim(substr(p_segment, 10)))));
    return;
  elsif p_segment like 'town:%' then
    return query select id from public.businesses where status = 'live' and lower(town) = lower(substr(p_segment, 6));
    return;
  end if;
  raise exception 'unknown_segment' using errcode = '22023';
end $function$;
revoke all on function public.message_segment(text, timestamptz) from public, anon, authenticated;
grant execute on function public.message_segment(text, timestamptz) to service_role;
