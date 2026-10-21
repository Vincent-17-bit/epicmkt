-- 0036_exception_overnight.sql
-- Special-hours intervals may run past midnight: an interval whose end is not after its start (20:00 to 02:00,
-- or 09:00 to 09:00 for a full 24 hours) means "until that time the next day". The after-midnight part counts for
-- the next date. Only exception_normalize changes: the interval_order check is gone, and an overnight interval
-- occupies the rest of its own date, so an interval that starts later the same date overlaps it.
-- shared/src/seller/exceptions.js applies the same rules (a test keeps them equal).

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
    end loop;
    for r in select e as iv from jsonb_array_elements(p_intervals) e order by e ->> 0 loop
      if v_prev_end is not null and (r.iv ->> 0) <= v_prev_end then raise exception 'intervals_overlap'; end if;
      v_prev_end := case when (r.iv ->> 1) > (r.iv ->> 0) then r.iv ->> 1 else '24:00' end;
      v_ints := v_ints || jsonb_build_array(r.iv);
    end loop;
  end if;

  return jsonb_build_object('date', p_date::text, 'kind', p_kind, 'intervals', v_ints, 'note', v_note);
end $$;

revoke all on function public.exception_normalize(date, text, jsonb, text, date) from public, anon;
grant execute on function public.exception_normalize(date, text, jsonb, text, date) to authenticated, service_role;
