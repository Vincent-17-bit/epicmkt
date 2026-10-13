alter table public.businesses add column if not exists hours_version integer not null default 1;

create or replace function public.closure_text_problem(p_text text, p_max integer default 80) returns text
language sql immutable set search_path = public as $$
  select case
    when t is null then null
    when char_length(t) > p_max then 'too_long'
    when t ~* '(https?://|www\.|(^|[^a-z0-9-])[a-z0-9][a-z0-9-]*\.(com|co\.ke|ke|org|net|io|me|ly|ee|gl|app|shop|store|info|site|online|xyz|link|dev|biz|ug|tz)($|[^a-z0-9]))' then 'link'
    when t ~ '[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+' then 'email'
    when regexp_replace(t, '(\d)[\s().-]+(?=\d)', '\1', 'g') ~ '\d{9,}' then 'phone'
    else null
  end
  from (select nullif(btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g')), '') as t) s
$$;

create or replace function public.hours_day_problem(d jsonb) returns text
language plpgsql immutable set search_path = public as $$
declare
  n integer;
  x jsonb;
  st text;
  en text;
  s integer;
  e integer;
  starts integer[] := '{}';
  ends integer[] := '{}';
  a integer;
  b integer;
  closed boolean;
  open24 boolean;
begin
  if jsonb_typeof(d) <> 'object' then return 'invalid_day'; end if;
  if (d ? 'closed' and jsonb_typeof(d -> 'closed') <> 'boolean') or (d ? 'open24' and jsonb_typeof(d -> 'open24') <> 'boolean') then return 'invalid_day'; end if;
  if d ? 'intervals' and jsonb_typeof(d -> 'intervals') <> 'array' then return 'invalid_day'; end if;
  closed := coalesce((d ->> 'closed')::boolean, false);
  open24 := coalesce((d ->> 'open24')::boolean, false);
  n := jsonb_array_length(coalesce(d -> 'intervals', '[]'::jsonb));
  if n > 4 then return 'too_many_intervals'; end if;
  if not closed and not open24 and n = 0 then return 'empty_day'; end if;
  for x in select value from jsonb_array_elements(coalesce(d -> 'intervals', '[]'::jsonb)) loop
    if jsonb_typeof(x) <> 'object' then return 'invalid_interval'; end if;
    st := x ->> 'start';
    en := x ->> 'end';
    if st is null or en is null or st !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or en !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return 'invalid_time'; end if;
    s := substr(st, 1, 2)::integer * 60 + substr(st, 4, 2)::integer;
    e := substr(en, 1, 2)::integer * 60 + substr(en, 4, 2)::integer;
    if s % 5 <> 0 or e % 5 <> 0 then return 'invalid_step'; end if;
    if s = e then return 'same_time'; end if;
    if x ? 'label' and (jsonb_typeof(x -> 'label') <> 'string' or char_length(x ->> 'label') > 40) then return 'invalid_interval'; end if;
    starts := starts || s;
    ends := ends || (case when e < s then e + 1440 else e end);
  end loop;
  for a in 1 .. coalesce(array_length(starts, 1), 0) loop
    for b in a + 1 .. array_length(starts, 1) loop
      if starts[a] < ends[b] and starts[b] < ends[a] then return 'overlap'; end if;
    end loop;
  end loop;
  return null;
end $$;

create or replace function public.hours_problem(p jsonb) returns text
language plpgsql immutable set search_path = public as $$
declare
  k text;
  r text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return 'invalid_hours'; end if;
  foreach k in array coalesce((select array_agg(x) from jsonb_object_keys(p) x), '{}') loop
    if k <> all (array['mon','tue','wed','thu','fri','sat','sun']) then return 'invalid_hours'; end if;
    r := public.hours_day_problem(p -> k);
    if r is not null then return r; end if;
  end loop;
  return null;
end $$;

create or replace function public.hours_authorize(p_business_id uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or (p_business_id is distinct from public.my_business_id() and not public.is_admin()) then
    raise exception 'not_a_seller' using errcode = '42501';
  end if;
end $$;

create or replace function public.iso_utc(t timestamptz) returns text
language sql immutable as
$$ select to_char(t at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $$;

create or replace function public.save_seller_hours(p_business_id uuid, p_hours jsonb, p_version integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_b public.businesses;
  v_problem text;
  v_full jsonb;
begin
  perform public.hours_authorize(p_business_id);
  v_problem := public.hours_problem(p_hours);
  if v_problem is not null then raise exception 'invalid_hours:%', v_problem; end if;
  select * into v_b from public.businesses where id = p_business_id for update;
  if not found then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if p_version is distinct from v_b.hours_version then raise exception 'CONCURRENCY_CONFLICT'; end if;
  select jsonb_object_agg(d, coalesce(p_hours -> d, '{"closed":true,"open24":false,"intervals":[]}'::jsonb)) into v_full
    from unnest(array['mon','tue','wed','thu','fri','sat','sun']) d;
  update public.businesses set hours = v_full, hours_version = hours_version + 1 where id = p_business_id returning * into v_b;
  perform public.write_audit(p_business_id, 'hours_saved', 'business', p_business_id::text, jsonb_build_object('version', v_b.hours_version));
  return jsonb_build_object('hours', v_b.hours, 'hours_version', v_b.hours_version);
end $$;

create or replace function public.save_seller_exceptions(p_business_id uuid, p_exceptions jsonb, p_version integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_b public.businesses;
  x jsonb;
  v_date date;
  v_problem text;
  v_seen text[] := '{}';
begin
  perform public.hours_authorize(p_business_id);
  if p_exceptions is null or jsonb_typeof(p_exceptions) <> 'array' or jsonb_array_length(p_exceptions) > 60 then raise exception 'invalid_exceptions'; end if;
  for x in select value from jsonb_array_elements(p_exceptions) loop
    if jsonb_typeof(x) <> 'object' or jsonb_typeof(x -> 'date') is distinct from 'string' or (x ->> 'date') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid_exceptions'; end if;
    begin
      v_date := (x ->> 'date')::date;
    exception when others then
      raise exception 'invalid_exceptions';
    end;
    if to_char(v_date, 'YYYY-MM-DD') <> x ->> 'date' or (x ->> 'date') = any (v_seen) then raise exception 'invalid_exceptions'; end if;
    v_seen := v_seen || (x ->> 'date');
    if x ? 'note' and (jsonb_typeof(x -> 'note') <> 'string' or char_length(x ->> 'note') > 40) then raise exception 'invalid_exceptions'; end if;
    v_problem := public.hours_day_problem(x - 'date' - 'note');
    if v_problem is not null then raise exception 'invalid_hours:%', v_problem; end if;
  end loop;
  select * into v_b from public.businesses where id = p_business_id for update;
  if not found then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if p_version is distinct from v_b.hours_version then raise exception 'CONCURRENCY_CONFLICT'; end if;
  update public.businesses set exceptions = p_exceptions, hours_version = hours_version + 1 where id = p_business_id returning * into v_b;
  perform public.write_audit(p_business_id, 'exceptions_saved', 'business', p_business_id::text, jsonb_build_object('count', jsonb_array_length(p_exceptions)));
  return jsonb_build_object('exceptions', v_b.exceptions, 'hours_version', v_b.hours_version);
end $$;

create or replace function public.set_seller_closure_override(p_business_id uuid, p_override jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_b public.businesses;
  v_type text;
  v_until timestamptz;
  v_since timestamptz;
  v_reason text;
  v_problem text;
  v_message text;
  v_value jsonb;
begin
  perform public.hours_authorize(p_business_id);
  select * into v_b from public.businesses where id = p_business_id for update;
  if not found then raise exception 'not_a_seller' using errcode = '42501'; end if;
  if p_override is null or jsonb_typeof(p_override) = 'null' then
    update public.businesses set override = null where id = p_business_id;
    perform public.write_audit(p_business_id, 'closure_cleared', 'business', p_business_id::text, '{}');
    return jsonb_build_object('override', null);
  end if;
  if jsonb_typeof(p_override) <> 'object' then raise exception 'invalid_override'; end if;
  v_type := p_override ->> 'type';
  if v_type is null or v_type not in ('close', 'open') then raise exception 'invalid_override:type'; end if;
  begin
    v_until := (p_override ->> 'until')::timestamptz;
    v_since := coalesce((p_override ->> 'since')::timestamptz, now());
  exception when others then
    raise exception 'invalid_override:time';
  end;
  if v_until is null then raise exception 'invalid_override:time'; end if;
  v_since := least(v_since, now());
  if v_since < now() - interval '24 hours' then raise exception 'invalid_override:since'; end if;
  if v_until <= now() then raise exception 'closure_in_past'; end if;
  if v_until > v_since + interval '24 hours' then raise exception 'closure_too_long'; end if;
  v_reason := nullif(p_override ->> 'reason', '');
  if v_reason is not null and v_reason not in ('lunch', 'restock', 'power', 'emergency', 'other') then raise exception 'invalid_override:reason'; end if;
  if p_override ? 'message' and jsonb_typeof(p_override -> 'message') not in ('string', 'null') then raise exception 'invalid_message:type'; end if;
  v_problem := public.closure_text_problem(p_override ->> 'message', 80);
  if v_problem is not null then raise exception 'invalid_message:%', v_problem; end if;
  v_message := coalesce(nullif(btrim(regexp_replace(coalesce(p_override ->> 'message', ''), '\s+', ' ', 'g')), ''), '');
  v_value := jsonb_build_object('type', v_type, 'since', public.iso_utc(v_since), 'until', public.iso_utc(v_until), 'reason', v_reason, 'message', v_message);
  update public.businesses set override = v_value where id = p_business_id;
  perform public.write_audit(p_business_id, 'closure_set', 'business', p_business_id::text, jsonb_build_object('type', v_type, 'until', v_value -> 'until', 'reason', v_reason));
  return jsonb_build_object('override', v_value);
end $$;

create or replace function public.set_partial_closure(p_business_id uuid, p_scope text, p_closure jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_b public.businesses;
  v_section text;
  v_until timestamptz;
  v_problem text;
  v_message text;
  v_list jsonb;
  v_entry jsonb;
begin
  perform public.hours_authorize(p_business_id);
  if p_scope is null or p_scope not in ('delivery', 'walkin', 'appointments', 'section') then raise exception 'invalid_scope'; end if;
  if p_closure is not null and jsonb_typeof(p_closure) not in ('object', 'null') then raise exception 'invalid_closure'; end if;
  v_section := case when p_scope = 'section' then nullif(btrim(coalesce(p_closure ->> 'section', '')), '') else null end;
  if p_scope = 'section' and (v_section is null or char_length(v_section) > 60) then raise exception 'invalid_closure:section'; end if;
  select * into v_b from public.businesses where id = p_business_id for update;
  if not found then raise exception 'not_a_seller' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(e), '[]'::jsonb) into v_list
    from jsonb_array_elements(case when jsonb_typeof(v_b.partial_closures) = 'array' then v_b.partial_closures else '[]'::jsonb end) e
   where not (e ->> 'scope' = p_scope and coalesce(e ->> 'section', '') = coalesce(v_section, ''))
     and coalesce((e ->> 'until')::timestamptz, '-infinity') > now();
  if p_closure is not null and jsonb_typeof(p_closure) = 'object' and p_closure ? 'until' and jsonb_typeof(p_closure -> 'until') <> 'null' then
    begin
      v_until := (p_closure ->> 'until')::timestamptz;
    exception when others then
      raise exception 'invalid_closure:time';
    end;
    if v_until <= now() then raise exception 'closure_in_past'; end if;
    if v_until > now() + interval '7 days' then raise exception 'closure_too_long'; end if;
    if p_closure ? 'message' and jsonb_typeof(p_closure -> 'message') not in ('string', 'null') then raise exception 'invalid_message:type'; end if;
    v_problem := public.closure_text_problem(p_closure ->> 'message', 80);
    if v_problem is not null then raise exception 'invalid_message:%', v_problem; end if;
    v_message := coalesce(nullif(btrim(regexp_replace(coalesce(p_closure ->> 'message', ''), '\s+', ' ', 'g')), ''), '');
    if jsonb_array_length(v_list) >= 30 then raise exception 'too_many_closures'; end if;
    v_entry := jsonb_build_object('scope', p_scope, 'section', v_section, 'since', public.iso_utc(now()), 'until', public.iso_utc(v_until), 'message', v_message);
    v_list := v_list || jsonb_build_array(v_entry);
    perform public.write_audit(p_business_id, 'partial_closure_set', 'business', p_business_id::text, jsonb_build_object('scope', p_scope, 'section', v_section, 'until', v_entry -> 'until'));
  else
    perform public.write_audit(p_business_id, 'partial_closure_cleared', 'business', p_business_id::text, jsonb_build_object('scope', p_scope, 'section', v_section));
  end if;
  update public.businesses set partial_closures = v_list where id = p_business_id;
  return jsonb_build_object('partial_closures', v_list);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'save_seller_hours(uuid, jsonb, integer)', 'save_seller_exceptions(uuid, jsonb, integer)',
    'set_seller_closure_override(uuid, jsonb)', 'set_partial_closure(uuid, text, jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
  foreach fn in array array['hours_authorize(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;
