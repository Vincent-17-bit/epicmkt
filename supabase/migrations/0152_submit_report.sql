-- A shopper's "Report this business": saved to public.reports (it was only kept by the demo backend before).
-- The caller is recognised by a daily-salted hash of the request address, never stored raw; the same shopper reporting the same shop
-- again the same day is accepted but not stored twice, and one address can send at most 5 reports an hour.

create or replace function public.submit_report(p_business uuid, p_reason text, p_message text default '', p_contact text default '') returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_message text := btrim(coalesce(p_message, ''));
  v_contact text := btrim(coalesce(p_contact, ''));
  v_fields jsonb := '{}'::jsonb;
  v_headers jsonb;
  v_ip text;
  v_hash text;
  v_details text;
begin
  if p_business is null or not exists (select 1 from public.businesses b where b.id = p_business and public.business_is_visible(b)) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_reason is null or p_reason not in ('wrong-info', 'closed', 'wrong-contact', 'scam', 'inappropriate', 'other') then v_fields := v_fields || '{"reason":"Choose a reason"}'; end if;
  if char_length(v_message) > 500 then v_fields := v_fields || '{"message":"Keep it under 500 characters"}';
  elsif p_reason = 'other' and char_length(v_message) < 5 then v_fields := v_fields || '{"message":"Tell us what is wrong"}'; end if;
  if char_length(v_contact) > 80 then v_fields := v_fields || '{"contact":"Keep it under 80 characters"}'; end if;
  if v_fields <> '{}'::jsonb then return jsonb_build_object('ok', false, 'error', 'invalid', 'fields', v_fields); end if;

  v_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_ip := coalesce(nullif(btrim(v_headers ->> 'cf-connecting-ip'), ''), nullif(btrim(v_headers ->> 'x-real-ip'), ''));
  if v_ip is null then return jsonb_build_object('ok', false, 'error', 'unavailable'); end if;
  v_hash := encode(digest((select salt from public.search_salt limit 1) || ':report:' || current_date::text || ':' || v_ip, 'sha256'), 'hex');

  if not public.hit_rate_limit('report:' || v_hash, 5, 3600) then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if exists (select 1 from public.reports r where r.business_id = p_business and r.reporter_hash = v_hash and r.created_at > now() - interval '1 day') then
    return jsonb_build_object('ok', true);
  end if;

  v_details := nullif(btrim(v_message || case when v_contact <> '' then E'\nContact: ' || v_contact else '' end), '');
  insert into public.reports (business_id, reason, details, reporter_hash) values (p_business, p_reason, v_details, v_hash);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.submit_report(uuid, text, text, text) from public;
grant execute on function public.submit_report(uuid, text, text, text) to anon, authenticated, service_role;
