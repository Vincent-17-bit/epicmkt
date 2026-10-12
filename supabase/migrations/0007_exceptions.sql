-- Upcoming exceptions to the opening hours (closed all day, or special hours with intervals).
-- Stored in businesses.exceptions as [{id, date, kind, intervals, note}], oldest first.
-- Sellers still cannot write the column directly or through seller_update_profile; only these two functions can.

create or replace function public.exception_normalize(p_date date, p_kind text, p_intervals jsonb, p_note text, p_today date) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_ints jsonb := '[]';
  v_prev_end text;
  r record;
  n integer;
begin
  if p_date is null then raise exception 'invalid_date'; end if;
  if p_date < p_today then raise exception 'date_in_past'; end if;
  if p_date > p_today + 730 then raise exception 'date_too_far'; end if;
  if p_kind is null or p_kind not in ('closed','special') then raise exception 'invalid_kind'; end if;
  if v_note is not null and (char_length(v_note) > 120 or v_note ~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]') then raise exception 'invalid_note'; end if;

  if p_kind = 'special' then
    if p_intervals is null or jsonb_typeof(p_intervals) <> 'array' or jsonb_array_length(p_intervals) = 0 then raise exception 'intervals_required'; end if;
    n := jsonb_array_length(p_intervals);
    if n > 3 then raise exception 'too_many_intervals'; end if;
    for r in select e as iv from jsonb_array_elements(p_intervals) e loop
      if jsonb_typeof(r.iv) <> 'array' or jsonb_array_length(r.iv) <> 2
         or jsonb_typeof(r.iv -> 0) <> 'string' or jsonb_typeof(r.iv -> 1) <> 'string'
         or (r.iv ->> 0) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (r.iv ->> 1) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        raise exception 'invalid_time';
      end if;
      if (r.iv ->> 0) >= (r.iv ->> 1) then raise exception 'interval_order'; end if;
    end loop;
    for r in select e as iv from jsonb_array_elements(p_intervals) e order by e ->> 0 loop
      if v_prev_end is not null and (r.iv ->> 0) <= v_prev_end then raise exception 'intervals_overlap'; end if;
      v_prev_end := r.iv ->> 1;
      v_ints := v_ints || jsonb_build_array(r.iv);
    end loop;
  end if;

  return jsonb_build_object('date', p_date::text, 'kind', p_kind, 'intervals', v_ints, 'note', v_note);
end $$;

-- Adds a new exception (p_id null) or edits one. Passing the id of a deleted one puts it back (Undo).
create or replace function public.seller_save_exception(p_id uuid, p_date date, p_kind text, p_intervals jsonb default '[]', p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_biz uuid := public.my_business_id();
  v_today date := public.nairobi_day(now());
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_list jsonb;
  v_item jsonb;
  v_known boolean;
begin
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  v_item := public.exception_normalize(p_date, p_kind, p_intervals, p_note, v_today) || jsonb_build_object('id', v_id);
  select b.exceptions into v_list from public.businesses b where b.id = v_biz for update;
  -- Past dates are dropped on every write, so the list only ever holds upcoming ones.
  v_list := coalesce((select jsonb_agg(e order by e ->> 'date') from jsonb_array_elements(coalesce(v_list, '[]')) e where (e ->> 'date')::date >= v_today), '[]');
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
  v_today date := public.nairobi_day(now());
  v_list jsonb;
  v_found boolean;
begin
  if v_biz is null then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select b.exceptions into v_list from public.businesses b where b.id = v_biz for update;
  v_found := exists (select 1 from jsonb_array_elements(coalesce(v_list, '[]')) e where e ->> 'id' = p_id::text);
  v_list := coalesce((select jsonb_agg(e order by e ->> 'date') from jsonb_array_elements(coalesce(v_list, '[]')) e
                      where e ->> 'id' <> p_id::text and (e ->> 'date')::date >= v_today), '[]');
  update public.businesses b set exceptions = v_list where b.id = v_biz;
  if v_found then perform public.write_audit(v_biz, 'exception_deleted', 'business', v_biz::text, '{}'); end if;
  return v_found;
end $$;

revoke all on function public.exception_normalize(date, text, jsonb, text, date) from public, anon;
grant execute on function public.exception_normalize(date, text, jsonb, text, date) to authenticated, service_role;
do $$
declare fn text;
begin
  foreach fn in array array['seller_save_exception(uuid, date, text, jsonb, text)', 'seller_delete_exception(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end $$;
