-- 0065_seller_set_hours.sql
-- Sellers can now set their weekly opening hours themselves. Until now nothing let them: seller_update_profile refuses an
-- `hours` field and sellers cannot write the column directly, so only staff could change it.
--
-- seller_set_hours(p_hours) takes { mon: ["08:00","18:00"], ... } with keys mon..sun. A day that is null or left out is
-- closed. An end earlier than the start runs past midnight (see intervalsOn in shared/src/utils.js); start = end is refused,
-- because the app reads it as neither zero hours nor a full day (a full day is stored as 00:00 to 23:59).
-- The same rules live in shared/src/seller/hours.js (validateWeeklyHours); supabase/tests/hours.test.mjs checks they agree.
-- The stored value keeps only the open days, so null days never reach the database.

create or replace function public.seller_set_hours(p_hours jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_biz uuid := public.my_business_id();
  v_days constant text[] := array['mon','tue','wed','thu','fri','sat','sun'];
  v_day text;
  v_slot jsonb;
  v_clean jsonb := '{}';
begin
  perform public.assert_seller_active();
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if p_hours is null or jsonb_typeof(p_hours) <> 'object' then raise exception 'invalid_hours' using errcode = 'P0001'; end if;
  if exists (select 1 from jsonb_object_keys(p_hours) as k where k <> all (v_days)) then raise exception 'unknown_day' using errcode = 'P0001'; end if;

  foreach v_day in array v_days loop
    v_slot := p_hours -> v_day;
    if v_slot is null or jsonb_typeof(v_slot) = 'null' then continue; end if;
    if jsonb_typeof(v_slot) <> 'array' or jsonb_array_length(v_slot) <> 2 then raise exception 'invalid_interval' using errcode = 'P0001'; end if;
    if jsonb_typeof(v_slot -> 0) <> 'string' or jsonb_typeof(v_slot -> 1) <> 'string'
       or (v_slot ->> 0) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (v_slot ->> 1) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'invalid_time' using errcode = 'P0001';
    end if;
    if (v_slot ->> 0) = (v_slot ->> 1) then raise exception 'zero_length' using errcode = 'P0001'; end if;
    v_clean := v_clean || jsonb_build_object(v_day, v_slot);
  end loop;

  perform 1 from public.businesses b where b.id = v_biz for update;
  update public.businesses b set hours = v_clean where b.id = v_biz;
  perform public.write_audit(v_biz, 'hours_updated', 'business', v_biz::text,
    jsonb_build_object('open_days', coalesce((select jsonb_agg(t.d order by t.ord) from unnest(v_days) with ordinality as t(d, ord) where v_clean ? t.d), '[]')));
  return v_clean;
end $$;

revoke all on function public.seller_set_hours(jsonb) from public, anon;
grant execute on function public.seller_set_hours(jsonb) to authenticated, service_role;
