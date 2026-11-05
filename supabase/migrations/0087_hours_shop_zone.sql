-- 0087: hours and exceptions follow the shop's zone; 00:00-23:59 reads open until midnight.

create or replace function public.hours_open(p_hours jsonb, p_exceptions jsonb, p_at timestamptz default now()) returns boolean
language plpgsql immutable as $$
declare
  v_local timestamp := p_at at time zone 'Africa/Nairobi';
  v_date date := v_local::date;
  v_min integer := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
  v_iv jsonb;
  v_start integer;
  v_end integer;
begin
  for v_iv in select jsonb_array_elements(public.hours_intervals_on(p_hours, p_exceptions, v_date)) loop
    v_start := split_part(v_iv ->> 0, ':', 1)::int * 60 + split_part(v_iv ->> 0, ':', 2)::int;
    v_end := split_part(v_iv ->> 1, ':', 1)::int * 60 + split_part(v_iv ->> 1, ':', 2)::int;
    if v_start = 0 and v_end = 1439 then v_end := 1440; end if;
    if v_end > v_start then
      if v_min >= v_start and v_min < v_end then return true; end if;
    elsif v_min >= v_start then
      return true;
    end if;
  end loop;
  if coalesce(public.hours_exception_on(p_exceptions, v_date) ->> 'kind', '') <> 'closed' then
    for v_iv in select jsonb_array_elements(public.hours_intervals_on(p_hours, p_exceptions, v_date - 1)) loop
      v_start := split_part(v_iv ->> 0, ':', 1)::int * 60 + split_part(v_iv ->> 0, ':', 2)::int;
      v_end := split_part(v_iv ->> 1, ':', 1)::int * 60 + split_part(v_iv ->> 1, ':', 2)::int;
      if v_end <= v_start and v_end > 0 and v_min < v_end then return true; end if;
    end loop;
  end if;
  return false;
end $$;

create or replace function public.hours_open_in(p_hours jsonb, p_exceptions jsonb, p_at timestamptz, p_tz text) returns boolean
language plpgsql stable as $$
declare
  v_local timestamp := p_at at time zone coalesce(nullif(p_tz, ''), 'Africa/Nairobi');
  v_date date := v_local::date;
  v_min integer := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
  v_iv jsonb;
  v_start integer;
  v_end integer;
begin
  for v_iv in select jsonb_array_elements(public.hours_intervals_on(p_hours, p_exceptions, v_date)) loop
    v_start := split_part(v_iv ->> 0, ':', 1)::int * 60 + split_part(v_iv ->> 0, ':', 2)::int;
    v_end := split_part(v_iv ->> 1, ':', 1)::int * 60 + split_part(v_iv ->> 1, ':', 2)::int;
    if v_start = 0 and v_end = 1439 then v_end := 1440; end if;
    if v_end > v_start then
      if v_min >= v_start and v_min < v_end then return true; end if;
    elsif v_min >= v_start then
      return true;
    end if;
  end loop;
  if coalesce(public.hours_exception_on(p_exceptions, v_date) ->> 'kind', '') <> 'closed' then
    for v_iv in select jsonb_array_elements(public.hours_intervals_on(p_hours, p_exceptions, v_date - 1)) loop
      v_start := split_part(v_iv ->> 0, ':', 1)::int * 60 + split_part(v_iv ->> 0, ':', 2)::int;
      v_end := split_part(v_iv ->> 1, ':', 1)::int * 60 + split_part(v_iv ->> 1, ':', 2)::int;
      if v_end <= v_start and v_end > 0 and v_min < v_end then return true; end if;
    end loop;
  end if;
  return false;
end $$;

create or replace function public.shop_day(p_at timestamptz, p_tz text) returns date
language sql stable as $$
  select (p_at at time zone coalesce(nullif(p_tz, ''), 'Africa/Nairobi'))::date
$$;
revoke all on function public.shop_day(timestamptz, text) from public;
grant execute on function public.shop_day(timestamptz, text) to anon, authenticated, service_role;

create or replace function public.public_exceptions(p_list jsonb, p_tz text) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(
    (select jsonb_agg(jsonb_build_object('id', e -> 'id', 'date', e -> 'date', 'kind', e -> 'kind', 'intervals', coalesce(e -> 'intervals', '[]'::jsonb), 'note', e -> 'note') order by e ->> 'date')
       from jsonb_array_elements(case when jsonb_typeof(p_list) = 'array' then p_list else '[]'::jsonb end) e
      where e ->> 'date' ~ '^\d{4}-\d{2}-\d{2}$'
        and (e ->> 'date')::date >= public.shop_day(now(), p_tz) - 1),
    '[]'::jsonb);
$$;
revoke all on function public.public_exceptions(jsonb, text) from public;
grant execute on function public.public_exceptions(jsonb, text) to anon, authenticated, service_role;

do $$
declare
  v_name text;
  v_def text;
  v_new text;
begin
  foreach v_name in array array['public_businesses', 'public_flash_sales'] loop
    v_def := pg_get_viewdef(('public.' || v_name)::regclass, true);
    v_new := regexp_replace(v_def, 'public_exceptions\((b\.)?exceptions\)', 'public_exceptions(\1exceptions, \1timezone)', 'g');
    if v_new = v_def then raise exception '%: public_exceptions call not found', v_name; end if;
    execute format('create or replace view public.%I with (security_barrier = true) as %s', v_name, v_new);
  end loop;
end $$;

create or replace function public.seller_save_exception(p_id uuid, p_date date, p_kind text, p_intervals jsonb default '[]', p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_biz uuid := public.my_business_id();
  v_tz text;
  v_today date;
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_list jsonb;
  v_item jsonb;
  v_known boolean;
begin
  perform public.assert_seller_active();
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select b.exceptions, b.timezone into v_list, v_tz from public.businesses b where b.id = v_biz for update;
  v_today := public.shop_day(now(), v_tz);
  v_item := public.exception_normalize(p_date, p_kind, p_intervals, p_note, v_today) || jsonb_build_object('id', v_id);
  v_list := coalesce((select jsonb_agg(e order by e ->> 'date') from jsonb_array_elements(coalesce(v_list, '[]')) e where (e ->> 'date')::date >= v_today - 1), '[]');
  v_known := exists (select 1 from jsonb_array_elements(v_list) e where e ->> 'id' = v_id::text);
  if exists (select 1 from jsonb_array_elements(v_list) e where e ->> 'date' = p_date::text and e ->> 'id' <> v_id::text) then raise exception 'date_taken'; end if;
  if not v_known and jsonb_array_length(v_list) >= 60 then raise exception 'limit_reached:exceptions' using errcode = 'P0001'; end if;
  v_list := (select jsonb_agg(s.x order by s.x ->> 'date') from (
    select e as x from jsonb_array_elements(v_list) e where e ->> 'id' <> v_id::text
    union all select v_item) s);
  update public.businesses b set exceptions = v_list where b.id = v_biz;
  perform public.write_audit(v_biz, case when v_known then 'exception_updated' else 'exception_added' end, 'business', v_biz::text, jsonb_build_object('date', p_date::text, 'kind', p_kind));
  return v_item;
end $$;

create or replace function public.seller_delete_exception(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_biz uuid := public.my_business_id();
  v_tz text;
  v_today date;
  v_list jsonb;
  v_found boolean;
begin
  perform public.assert_seller_active();
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select b.exceptions, b.timezone into v_list, v_tz from public.businesses b where b.id = v_biz for update;
  v_today := public.shop_day(now(), v_tz);
  v_found := exists (select 1 from jsonb_array_elements(coalesce(v_list, '[]')) e where e ->> 'id' = p_id::text);
  v_list := coalesce((select jsonb_agg(e order by e ->> 'date') from jsonb_array_elements(coalesce(v_list, '[]')) e
                      where e ->> 'id' <> p_id::text and (e ->> 'date')::date >= v_today - 1), '[]');
  update public.businesses b set exceptions = v_list where b.id = v_biz;
  if v_found then perform public.write_audit(v_biz, 'exception_deleted', 'business', v_biz::text, '{}'); end if;
  return v_found;
end $$;

revoke all on function public.seller_save_exception(uuid, date, text, jsonb, text), public.seller_delete_exception(uuid) from public, anon;
grant execute on function public.seller_save_exception(uuid, date, text, jsonb, text), public.seller_delete_exception(uuid) to authenticated, service_role;
