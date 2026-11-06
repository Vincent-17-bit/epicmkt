-- 0088: break exceptions. The shop is closed for a few hours (a lunch break) and the normal hours apply around it.
-- A break covers one date, every date up to "until", or (with weekdays) those weekdays from its date until "until".

create or replace function public.break_applies_on(e jsonb, d date) returns boolean
language sql immutable as $$
  select e ->> 'kind' = 'break'
    and e ->> 'date' ~ '^\d{4}-\d{2}-\d{2}$'
    and (e ->> 'date')::date <= d
    and case
      when jsonb_typeof(e -> 'weekdays') = 'array' then
        (coalesce(e ->> 'until', '') !~ '^\d{4}-\d{2}-\d{2}$' or d <= (e ->> 'until')::date)
        and (e -> 'weekdays') ? (array['sun','mon','tue','wed','thu','fri','sat'])[extract(dow from d)::int + 1]
      when coalesce(e ->> 'until', '') ~ '^\d{4}-\d{2}-\d{2}$' then d <= (e ->> 'until')::date
      else (e ->> 'date')::date = d
    end
$$;

create or replace function public.hours_in_break(p_exceptions jsonb, p_date date, p_min integer) returns boolean
language sql immutable as $$
  select public.hours_exception_on(p_exceptions, p_date) is null
    and exists (
      select 1
      from jsonb_array_elements(case when jsonb_typeof(p_exceptions) = 'array' then p_exceptions else '[]'::jsonb end) e,
           jsonb_array_elements(case when jsonb_typeof(e -> 'intervals') = 'array' then e -> 'intervals' else '[]'::jsonb end) iv
      where jsonb_typeof(e) = 'object'
        and public.break_applies_on(e, p_date)
        and public.hours_interval_ok(iv)
        and p_min >= split_part(iv ->> 0, ':', 1)::int * 60 + split_part(iv ->> 0, ':', 2)::int
        and p_min < split_part(iv ->> 1, ':', 1)::int * 60 + split_part(iv ->> 1, ':', 2)::int
    )
$$;

create or replace function public.exception_last_day(e jsonb) returns date
language sql immutable as $$
  select case
    when coalesce(e ->> 'until', '') ~ '^\d{4}-\d{2}-\d{2}$' then (e ->> 'until')::date
    when e ->> 'kind' = 'break' and jsonb_typeof(e -> 'weekdays') = 'array' then date '9999-12-31'
    else (e ->> 'date')::date
  end
$$;

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
  if public.hours_in_break(p_exceptions, v_date, v_min) then return false; end if;
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
  if public.hours_in_break(p_exceptions, v_date, v_min) then return false; end if;
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

create or replace function public.public_exceptions(p_list jsonb, p_tz text) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(
    (select jsonb_agg(
              jsonb_build_object('id', e -> 'id', 'date', e -> 'date', 'kind', e -> 'kind', 'intervals', coalesce(e -> 'intervals', '[]'::jsonb), 'note', e -> 'note')
              || case when e ->> 'kind' = 'break' then jsonb_build_object('until', e -> 'until', 'weekdays', e -> 'weekdays') else '{}'::jsonb end
              order by e ->> 'date')
       from jsonb_array_elements(case when jsonb_typeof(p_list) = 'array' then p_list else '[]'::jsonb end) e
      where e ->> 'date' ~ '^\d{4}-\d{2}-\d{2}$'
        and public.exception_last_day(e) >= public.shop_day(now(), p_tz) - 1),
    '[]'::jsonb);
$$;

drop function public.exception_normalize(date, text, jsonb, text, date);
create function public.exception_normalize(p_date date, p_kind text, p_intervals jsonb, p_note text, p_today date, p_until date default null, p_weekdays jsonb default null) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_ints jsonb := '[]';
  v_days jsonb := null;
  v_prev_end text;
  r record;
  n integer;
begin
  if p_date is null then raise exception 'invalid_date'; end if;
  if p_date < p_today then raise exception 'date_in_past'; end if;
  if p_date > p_today + 730 then raise exception 'date_too_far'; end if;
  if p_kind is null or p_kind not in ('closed','special','break') then raise exception 'invalid_kind'; end if;
  if v_note is not null and (char_length(v_note) > 120 or v_note ~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]') then raise exception 'invalid_note'; end if;

  if p_kind = 'break' then
    if p_until is not null then
      if p_until < p_date then raise exception 'until_before_date'; end if;
      if p_until > p_today + 730 then raise exception 'date_too_far'; end if;
    end if;
    if p_weekdays is not null then
      if jsonb_typeof(p_weekdays) <> 'array' or jsonb_array_length(p_weekdays) = 0
         or exists (select 1 from jsonb_array_elements(p_weekdays) w where jsonb_typeof(w) <> 'string' or (w #>> '{}') not in ('mon','tue','wed','thu','fri','sat','sun')) then
        raise exception 'invalid_weekdays';
      end if;
      select jsonb_agg(d order by i) into v_days from unnest(array['mon','tue','wed','thu','fri','sat','sun']) with ordinality t(d, i) where p_weekdays ? d;
    end if;
  end if;

  if p_kind in ('special', 'break') then
    if p_intervals is null or jsonb_typeof(p_intervals) <> 'array' or jsonb_array_length(p_intervals) = 0 then raise exception 'intervals_required'; end if;
    n := jsonb_array_length(p_intervals);
    if n > 3 then raise exception 'too_many_intervals'; end if;
    for r in select e as iv from jsonb_array_elements(p_intervals) e loop
      if jsonb_typeof(r.iv) <> 'array' or jsonb_array_length(r.iv) <> 2
         or jsonb_typeof(r.iv -> 0) <> 'string' or jsonb_typeof(r.iv -> 1) <> 'string'
         or (r.iv ->> 0) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (r.iv ->> 1) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        raise exception 'invalid_time';
      end if;
      if p_kind = 'break' and (r.iv ->> 1) <= (r.iv ->> 0) then raise exception 'break_order'; end if;
    end loop;
    for r in select e as iv from jsonb_array_elements(p_intervals) e order by e ->> 0 loop
      if v_prev_end is not null and (r.iv ->> 0) <= v_prev_end then raise exception 'intervals_overlap'; end if;
      v_prev_end := case when (r.iv ->> 1) > (r.iv ->> 0) then r.iv ->> 1 else '24:00' end;
      v_ints := v_ints || jsonb_build_array(r.iv);
    end loop;
  end if;

  return jsonb_build_object('date', p_date::text, 'kind', p_kind, 'intervals', v_ints, 'note', v_note)
    || case when p_kind = 'break' then jsonb_build_object('until', p_until::text, 'weekdays', v_days) else '{}'::jsonb end;
end $$;
revoke all on function public.exception_normalize(date, text, jsonb, text, date, date, jsonb) from public, anon;
grant execute on function public.exception_normalize(date, text, jsonb, text, date, date, jsonb) to authenticated, service_role;

drop function public.seller_save_exception(uuid, date, text, jsonb, text);
create function public.seller_save_exception(p_id uuid, p_date date, p_kind text, p_intervals jsonb default '[]', p_note text default null, p_until date default null, p_weekdays jsonb default null) returns jsonb
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
  v_item := public.exception_normalize(p_date, p_kind, p_intervals, p_note, v_today, p_until, p_weekdays) || jsonb_build_object('id', v_id);
  v_list := coalesce((select jsonb_agg(e order by e ->> 'date') from jsonb_array_elements(coalesce(v_list, '[]')) e where public.exception_last_day(e) >= v_today - 1), '[]');
  v_known := exists (select 1 from jsonb_array_elements(v_list) e where e ->> 'id' = v_id::text);
  if p_kind <> 'break' and exists (select 1 from jsonb_array_elements(v_list) e where e ->> 'date' = p_date::text and e ->> 'kind' <> 'break' and e ->> 'id' <> v_id::text) then raise exception 'date_taken'; end if;
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
                      where e ->> 'id' <> p_id::text and public.exception_last_day(e) >= v_today - 1), '[]');
  update public.businesses b set exceptions = v_list where b.id = v_biz;
  if v_found then perform public.write_audit(v_biz, 'exception_deleted', 'business', v_biz::text, '{}'); end if;
  return v_found;
end $$;

revoke all on function public.seller_save_exception(uuid, date, text, jsonb, text, date, jsonb) from public, anon;
grant execute on function public.seller_save_exception(uuid, date, text, jsonb, text, date, jsonb) to authenticated, service_role;
