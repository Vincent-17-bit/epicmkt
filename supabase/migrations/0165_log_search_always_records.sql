-- Search logging: a search is recorded even when the request carries no client address header.
-- Before, a missing cf-connecting-ip / x-real-ip made log_search return silently. Now it falls back to the first x-forwarded-for address,
-- then to the browser's user agent, so a search is never dropped for that reason. A real error is written to the Postgres log as a warning.

create or replace function public.log_search(p_term text, p_county text default null) returns void
language plpgsql volatile security definer set search_path = public, extensions set statement_timeout = '2s' set timezone = 'UTC' as
$$
declare
  v_raw text := lower(btrim(coalesce(p_term, '')));
  v_term text;
  v_headers jsonb;
  v_ip text;
  v_client text;
begin
  if v_raw ~ '@' or v_raw ~ '://' or v_raw ~ 'www\.' then
    return;
  end if;
  v_term := btrim(regexp_replace(regexp_replace(translate(v_raw, '’‘', ''''''), '[.,+/()!?":;]+', ' ', 'g'), '\s+', ' ', 'g'));
  if char_length(v_term) < 2 or char_length(v_term) > 60
    or cardinality(string_to_array(v_term, ' ')) > 6
    or v_term !~ '^[[:alnum:] ''&-]+$'
    or v_term !~ '[[:alpha:]]' then
    return;
  end if;

  v_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_ip := coalesce(
    nullif(btrim(v_headers ->> 'cf-connecting-ip'), ''),
    nullif(btrim(v_headers ->> 'x-real-ip'), ''),
    nullif(btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), ''),
    'ua:' || coalesce(v_headers ->> 'user-agent', '') || '|' || coalesce(v_headers ->> 'accept-language', '')
  );

  v_client := encode(digest((select salt from public.search_salt limit 1) || ':' || current_date::text || ':' || v_ip, 'sha256'), 'hex');

  if (select count(*) from public.search_events where client_hash = v_client and at > now() - interval '1 minute') >= 12 then
    return;
  end if;
  if (select count(*) from public.search_events where at > now() - interval '1 minute') >= 300 then
    return;
  end if;

  insert into public.search_events (term, client_hash, bucket, county)
  values (v_term, v_client, floor(extract(epoch from now()) / 3600)::bigint, null)
  on conflict do nothing;

  if random() < 0.01 then
    delete from public.search_events
    where id in (select id from public.search_events where at < now() - interval '2 days' order by at limit 5000);
  end if;
exception when others then
  raise warning 'log_search failed: % (%)', sqlerrm, sqlstate;
  return;
end $$;
revoke all on function public.log_search(text, text) from public;
grant execute on function public.log_search(text, text) to anon, authenticated, service_role;
