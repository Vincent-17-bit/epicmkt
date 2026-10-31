-- 0070_message_log_detail.sql
-- Message log: applicants show the business they applied with instead of "Applicant", the status filter accepts
-- 'cancelled' (0068), and admin_message_detail() returns one message in full for the detail dialog.
--
-- Same roles as the log: owner, reviewer, support. Read only, so nothing is audited. Seller-sent messages are not part of
-- the log and are refused here too. Safe to re-run.
--
-- ROLLBACK (run by hand):
--   drop function if exists public.admin_message_detail(uuid);
--   re-run "create or replace function public.admin_message_log_query" from 0025_admin_messaging_console.sql

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
  if coalesce(p_status, 'all') not in ('all', 'queued', 'sent', 'delivered', 'failed', 'cancelled') then raise exception 'invalid_status'; end if;

  select count(*) into v_total
    from public.messages m left join public.businesses b on b.id = m.business_id
   where m.sender <> 'seller'
     and (coalesce(p_channel, 'all') = 'all' or m.channel = p_channel)
     and (coalesce(p_status, 'all') = 'all' or m.status = p_status)
     and (v_search is null or m.subject ilike '%' || v_search || '%' or m.to_address ilike '%' || v_search || '%'
          or m.template_key ilike '%' || v_search || '%' or b.name ilike '%' || v_search || '%');

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) into v_rows from (
    select m.id, m.created_at, m.channel, m.status, m.kind, m.subject, m.template_key, m.to_address, m.transactional,
           m.business_id, b.name as business_name, m.application_id, a.business_name as application_name,
           m.attempts, m.error, m.cost_kes, m.scheduled_at, m.sent_at
      from public.messages m
      left join public.businesses b on b.id = m.business_id
      left join public.applications a on a.id = m.application_id
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

create or replace function public.admin_message_detail(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
begin
  if not public.has_role(array['owner', 'reviewer', 'support']) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_id is null then raise exception 'invalid_input'; end if;
  select to_jsonb(x) into v from (
    select m.id, m.created_at, m.channel, m.status, m.kind, m.subject, m.body, m.template_key, m.to_address, m.transactional,
           m.business_id, b.name as business_name, b.seller_id,
           m.application_id, a.business_name as application_name, a.owner_full_name as applicant_name,
           m.attempts, m.error, m.cost_kes, m.provider_id, m.scheduled_at, m.sent_at, m.batch_id,
           (select u.email from auth.users u where u.id = m.created_by) as created_by_email
      from public.messages m
      left join public.businesses b on b.id = m.business_id
      left join public.applications a on a.id = m.application_id
     where m.id = p_id and m.sender <> 'seller'
  ) x;
  if v is null then raise exception 'message_not_found'; end if;
  return v;
end $$;
revoke all on function public.admin_message_detail(uuid) from public, anon;
grant execute on function public.admin_message_detail(uuid) to authenticated, service_role;
