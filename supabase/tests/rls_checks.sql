-- supabase/tests/rls_checks.sql
-- Proves the role-aware RLS from 0009_admin_extras.sql on all 24 admin-written tables.
--
-- RUN ON A LOCAL OR DEV DATABASE ONLY. It creates fake users and clears global_limits and legal_docs
-- inside a transaction that is always rolled back, but never point it at production.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_checks.sql
--
-- Passes silently with a NOTICE "RLS checks passed". Any failure raises one exception listing
-- every failing check, so psql exits non-zero.
--
-- For each table and each actor (owner, reviewer, finance, support, plain non-admin) it checks:
--   select  any admin sees the fixture row; a non-admin does not (except the public-read tables)
--   update  allowed roles change 1 row; everyone else changes 0 rows (RLS filters silently)
--   insert  allowed roles succeed; everyone else gets a row-level security error
--   delete  allowed roles remove 1 row; everyone else removes 0 rows
-- and, after a blocked attempt, it re-reads the table as superuser to prove the fixture row is
-- untouched and no new row appeared. A "permission denied" error does not count as blocked: it
-- would mean a missing GRANT, not RLS, so it fails the check.

begin;

create schema rls_test;
grant usage on schema rls_test to authenticated, anon;

-- applications.reference_no defaults to generate_reference_no(), which calls pgcrypto's gen_random_bytes().
-- Hosted Supabase already lets these roles use the extensions schema; a bare local database may not.
-- Rolled back with everything else.
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'extensions') then
    execute 'grant usage on schema extensions to authenticated, anon';
  end if;
end $$;

-- runs one statement as whoever is the current role and reports what happened
create function rls_test.run(stmt text) returns text
language plpgsql as $$
declare n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return 'ok ' || n;
exception when others then
  return 'err ' || sqlstate || ' ' || sqlerrm;
end $$;

-- fills the {n} {uid} {biz} {app} placeholders of a SQL template
create function rls_test.fill(tpl text, n text, uid text) returns text
language sql immutable as $$
  select replace(replace(replace(replace(tpl, '{n}', n), '{uid}', uid),
    '{biz}', '10000000-0000-0000-0000-00000000b001'),
    '{app}', '20000000-0000-0000-0000-00000000a001')
$$;

do $$
declare
  ids constant jsonb := jsonb_build_object(
    'owner',    'a0000000-0000-0000-0000-000000000001',
    'reviewer', 'a0000000-0000-0000-0000-000000000002',
    'finance',  'a0000000-0000-0000-0000-000000000003',
    'support',  'a0000000-0000-0000-0000-000000000004',
    'nonadmin', 'a0000000-0000-0000-0000-000000000005');
  actors constant text[] := array['owner','reviewer','finance','support','nonadmin'];
  older constant text[] := array['categories','plans','global_limits','legal_docs','site_settings',
    'applications','application_documents','application_flags','application_events'];

  -- t table, w roles expected to write, pub = readable by non-admins too, cols/vals = insert template,
  -- key = predicate that finds the row, set = update that breaks the key, ins = optional insert override
  cases constant jsonb := $cases$[
    {"t":"categories","w":["owner"],"pub":true,"cols":"id, name, grp, tier","vals":"'cat-{n}', 'Cat {n}', 'Grp', 'A'","key":"name = 'Cat {n}'","set":"name = 'hacked'"},
    {"t":"plans","w":["owner"],"pub":true,"cols":"category_id, plan_key, price_kes, items_limit, top_benefits","vals":"'plan-{n}', 'standard', 500, 3, to_jsonb(array['a','b','c'])","key":"category_id = 'plan-{n}' and price_kes = 500","set":"price_kes = 99999"},
    {"t":"global_limits","w":["owner"],"pub":true,"cols":"id, standard, premium","vals":"1, jsonb_build_object('v','{n}'), '{}'","key":"standard @> jsonb_build_object('v','{n}')","set":"standard = jsonb_build_object('v','hacked')","ins":"insert into public.global_limits (id, standard, premium) values (1, jsonb_build_object('v','try'), '{}') on conflict (id) do update set standard = excluded.standard"},
    {"t":"legal_docs","w":["owner"],"pub":true,"cols":"key, version, title, body","vals":"(case '{n}' when 'fx' then 'terms' else 'privacy' end), 'v-{n}', 'T', 'B'","key":"version = 'v-{n}'","set":"version = 'hacked'"},
    {"t":"site_settings","w":["owner"],"cols":"key, value","vals":"'rls-{n}', to_jsonb(1)","key":"key = 'rls-{n}' and value = to_jsonb(1)","set":"value = to_jsonb(2)"},
    {"t":"applications","w":["owner","reviewer"],"cols":"category_id, plan_key, price_at_submission, plan_snapshot, owner_full_name, owner_id_type, owner_id_number, phone, email, business_name, registered, year_established, sbp_number, sbp_expiry, county, town, address, lat, lng, whatsapp, terms_version, privacy_version, authorised","vals":"'rls-biz', 'standard', 500, '{}', 'Owner', 'national_id', 'ID1', '0700000000', 'o@rls.test', 'App {n}', false, 2020, 'SBP1', '2030-01-01', 'Nairobi', 'Nairobi', 'Addr', 0, 0, '0700000000', 'v1', 'v1', true","key":"business_name = 'App {n}'","set":"business_name = 'hacked'"},
    {"t":"application_documents","w":["owner","reviewer"],"cols":"application_id, slot_key, storage_path, original_name, mime, size_bytes","vals":"'{app}', 'slot-{n}', 'path/{n}', 'f.pdf', 'application/pdf', 1","key":"slot_key = 'slot-{n}'","set":"slot_key = 'hacked'"},
    {"t":"application_flags","w":["owner","reviewer"],"cols":"application_id, path, message","vals":"'{app}', 'p', 'msg {n} here'","key":"message = 'msg {n} here'","set":"message = 'hacked msg'"},
    {"t":"application_events","w":["owner","reviewer"],"cols":"application_id, actor, type","vals":"'{app}', 'admin', 'ev-{n}'","key":"type = 'ev-{n}'","set":"type = 'hacked'"},
    {"t":"banners","w":["owner"],"cols":"title","vals":"'Banner {n}'","key":"title = 'Banner {n}'","set":"title = 'hacked'"},
    {"t":"site_announcements","w":["owner"],"cols":"message","vals":"'Msg {n}'","key":"message = 'Msg {n}'","set":"message = 'hacked'"},
    {"t":"towns","w":["owner"],"cols":"name, slug, county","vals":"'Town {n}', 'town-{n}', 'County'","key":"name = 'Town {n}'","set":"name = 'hacked'"},
    {"t":"agents","w":["owner"],"cols":"code, full_name, phone","vals":"'AG-' || upper('{n}'), 'Agent {n}', '0700000000'","key":"full_name = 'Agent {n}'","set":"full_name = 'hacked'"},
    {"t":"data_requests","w":["owner"],"cols":"request_type, requester_name, requester_email","vals":"'export', 'Req {n}', 'r@rls.test'","key":"requester_name = 'Req {n}'","set":"requester_name = 'hacked'"},
    {"t":"admin_sessions_log","w":["owner"],"cols":"user_id, event, ip","vals":"'{uid}', 'login', 'ip-{n}'","key":"ip = 'ip-{n}'","set":"ip = 'hacked'"},
    {"t":"coupons","w":["owner","finance"],"cols":"code, discount_type, discount_value","vals":"'C-' || upper('{n}'), 'percent', 10","key":"code = 'C-' || upper('{n}') and discount_value = 10","set":"discount_value = 20"},
    {"t":"search_synonyms","w":["owner","reviewer"],"cols":"term, synonyms","vals":"'term-{n}', array['a']","key":"term = 'term-{n}'","set":"term = 'hacked'"},
    {"t":"blocked_terms","w":["owner","reviewer"],"cols":"term","vals":"'bad-{n}'","key":"term = 'bad-{n}'","set":"term = 'hacked'"},
    {"t":"leads","w":["owner","reviewer"],"cols":"name, phone","vals":"'Lead {n}', '0700000000'","key":"name = 'Lead {n}'","set":"name = 'hacked'"},
    {"t":"gallery_photos","w":["owner","reviewer"],"cols":"business_id, storage_path","vals":"'{biz}', 'g/{n}.jpg'","key":"storage_path = 'g/{n}.jpg'","set":"storage_path = 'hacked'"},
    {"t":"staff_members","w":["owner","reviewer"],"cols":"business_id, name","vals":"'{biz}', 'Staff {n}'","key":"name = 'Staff {n}'","set":"name = 'hacked'"},
    {"t":"timetable_slots","w":["owner","reviewer"],"cols":"business_id, weekday, title, starts_at, ends_at","vals":"'{biz}', 1, 'Slot {n}', '09:00', '10:00'","key":"title = 'Slot {n}'","set":"title = 'hacked'"},
    {"t":"flash_sales","w":["owner","reviewer"],"cols":"business_id, title, discount_type, discount_value, starts_at, ends_at","vals":"'{biz}', 'Sale {n}', 'percent', 10, now(), now() + interval '1 day'","key":"title = 'Sale {n}'","set":"title = 'hacked'"},
    {"t":"saved_views","w":["owner","reviewer","finance"],"cols":"user_id, scope, name","vals":"'{uid}', 'applications', 'View {n}'","key":"name = 'View {n}'","set":"name = 'hacked'"}
  ]$cases$;

  actor text;
  uid text;
  cs jsonb;
  tbl text;
  allowed boolean;
  cnt int;
  r_ins text;
  r_upd text;
  r_del text;
  fails text[] := '{}';
  checks int := 0;
  note text;
begin
  -- fixtures (superuser) --------------------------------------------------------------------
  insert into auth.users (id, email)
    select (v.value #>> '{}')::uuid, v.key || '@rls.test' from jsonb_each(ids) v;
  insert into public.admins (user_id, role)
    select (v.value #>> '{}')::uuid, v.key from jsonb_each(ids) v where v.key <> 'nonadmin';
  insert into public.categories (id, name, grp, tier)
    values ('rls-biz', 'RLS', 'RLS', 'A'), ('plan-fx', 'P', 'P', 'A'), ('plan-try', 'P', 'P', 'A');
  insert into public.businesses (id, seller_id, slug, name, category_id, phone)
    values ('10000000-0000-0000-0000-00000000b001', 'RLS000001', 'rls-shop', 'RLS Shop', 'rls-biz', '0700000000');
  delete from public.global_limits;
  delete from public.legal_docs;
  for cs in select value from jsonb_array_elements(cases) where value ->> 't' = 'applications' loop
    execute format('insert into public.applications (id, %s) values (%L, %s)',
      cs ->> 'cols', '20000000-0000-0000-0000-00000000a001',
      rls_test.fill(cs ->> 'vals', 'parent', ids ->> 'owner'));
  end loop;

  -- the matrix: every actor x every table -----------------------------------------------------
  foreach actor in array actors loop
    uid := ids ->> actor;
    for i in 0 .. jsonb_array_length(cases) - 1 loop
      cs := cases -> i;
      tbl := cs ->> 't';
      allowed := actor = any (array(select jsonb_array_elements_text(cs -> 'w')));

      begin  -- one isolated unit of work; rolled back at the end by the sentinel below
        execute 'reset role';
        execute format('insert into public.%I (%s) values (%s)', tbl, cs ->> 'cols', rls_test.fill(cs ->> 'vals', 'fx', uid));

        perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
        execute 'set local role authenticated';

        -- select: any admin sees the row, a non-admin only on public-read tables
        execute format('select count(*) from public.%I where %s', tbl, rls_test.fill(cs ->> 'key', 'fx', uid)) into cnt;
        checks := checks + 1;
        if cnt <> (case when actor <> 'nonadmin' or coalesce((cs ->> 'pub')::boolean, false) then 1 else 0 end) then
          fails := fails || format('%s select on %s saw %s fixture row(s)', actor, tbl, cnt);
        end if;

        -- update the fixture, insert a new row, then delete (the new row if we may write, else the fixture)
        r_upd := rls_test.run(format('update public.%I set %s where %s', tbl,
          rls_test.fill(cs ->> 'set', 'fx', uid), rls_test.fill(cs ->> 'key', 'fx', uid)));
        r_ins := rls_test.run(coalesce(cs ->> 'ins', format('insert into public.%I (%s) values (%s)', tbl,
          cs ->> 'cols', rls_test.fill(cs ->> 'vals', 'try', uid))));
        r_del := rls_test.run(format('delete from public.%I where %s', tbl,
          rls_test.fill(cs ->> 'key', case when allowed then 'try' else 'fx' end, uid)));
        checks := checks + 3;

        if allowed then
          if r_upd <> 'ok 1' then fails := fails || format('%s update on %s should change 1 row, got "%s"', actor, tbl, r_upd); end if;
          if r_ins <> 'ok 1' then fails := fails || format('%s insert on %s should succeed, got "%s"', actor, tbl, r_ins); end if;
          if r_del <> 'ok 1' then fails := fails || format('%s delete on %s should remove 1 row, got "%s"', actor, tbl, r_del); end if;
        else
          if r_upd <> 'ok 0' then fails := fails || format('%s update on %s was NOT blocked, got "%s"', actor, tbl, r_upd); end if;
          if not (r_ins like 'err 42501%' and r_ins like '%row-level security%') then
            fails := fails || format('%s insert on %s was NOT blocked by RLS, got "%s"', actor, tbl, r_ins);
          end if;
          if r_del <> 'ok 0' then fails := fails || format('%s delete on %s was NOT blocked, got "%s"', actor, tbl, r_del); end if;

          -- superuser re-reads: fixture untouched, nothing new inserted
          execute 'reset role';
          execute format('select count(*) from public.%I where %s', tbl, rls_test.fill(cs ->> 'key', 'fx', uid)) into cnt;
          checks := checks + 1;
          if cnt <> 1 then fails := fails || format('%s changed the fixture row in %s (found %s)', actor, tbl, cnt); end if;
          execute format('select count(*) from public.%I where %s', tbl, rls_test.fill(cs ->> 'key', 'try', uid)) into cnt;
          checks := checks + 1;
          if cnt <> 0 then fails := fails || format('%s managed to insert a row into %s', actor, tbl); end if;
        end if;

        raise exception 'rollback this unit' using errcode = 'RB001';
      exception when sqlstate 'RB001' then
        null;
      end;
    end loop;
  end loop;

  -- saved views are personal: even an allowed writer cannot touch someone else's -------------
  begin
    execute 'reset role';
    insert into public.saved_views (user_id, scope, name) values ((ids ->> 'support')::uuid, 'applications', 'support view');
    perform set_config('request.jwt.claims', json_build_object('sub', ids ->> 'owner', 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    r_ins := rls_test.run(format('insert into public.saved_views (user_id, scope, name) values (%L, ''applications'', ''forged'')', ids ->> 'support'));
    r_upd := rls_test.run('update public.saved_views set name = ''hacked'' where name = ''support view''');
    r_del := rls_test.run('delete from public.saved_views where name = ''support view''');
    checks := checks + 3;
    if not (r_ins like 'err 42501%' and r_ins like '%row-level security%') then fails := fails || format('owner inserted a saved view for another admin: "%s"', r_ins); end if;
    if r_upd <> 'ok 0' then fails := fails || format('owner updated another admin''s saved view: "%s"', r_upd); end if;
    if r_del <> 'ok 0' then fails := fails || format('owner deleted another admin''s saved view: "%s"', r_del); end if;
    raise exception 'rollback this unit' using errcode = 'RB001';
  exception when sqlstate 'RB001' then
    null;
  end;

  -- has_role() answers per role --------------------------------------------------------------
  begin
    execute 'reset role';
    for actor in select unnest(actors) loop
      perform set_config('request.jwt.claims', json_build_object('sub', ids ->> actor, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      checks := checks + 2;
      if public.has_role(array[actor]) is distinct from (actor <> 'nonadmin') then
        fails := fails || format('has_role(%L) wrong for %s', actor, actor);
      end if;
      if public.has_role(array['owner']) is distinct from (actor = 'owner') then
        fails := fails || format('has_role(owner) wrong for %s', actor);
      end if;
      execute 'reset role';
    end loop;
    raise exception 'rollback this unit' using errcode = 'RB001';
  exception when sqlstate 'RB001' then
    null;
  end;

  -- structure: no blanket policies left, RLS on everywhere, anon locked out of the new tables ----
  checks := checks + 3;
  select string_agg(policyname || ' on ' || tablename, ', ') into note from pg_policies
   where schemaname = 'public' and tablename = any(older)
     and (policyname like 'admin all %' or policyname like 'admin role %');
  if note is not null then fails := fails || ('blanket admin policies still present: ' || note); end if;

  select string_agg(c ->> 't', ', ') into note from jsonb_array_elements(cases) c
   where not (select relrowsecurity from pg_class where oid = ('public.' || (c ->> 't'))::regclass);
  if note is not null then fails := fails || ('RLS is off on: ' || note); end if;

  select string_agg(c ->> 't', ', ') into note from jsonb_array_elements(cases) c
   where (c ->> 't') <> all(older)
     and (has_table_privilege('anon', 'public.' || (c ->> 't'), 'select')
          or has_table_privilege('anon', 'public.' || (c ->> 't'), 'insert')
          or has_table_privilege('anon', 'public.' || (c ->> 't'), 'update')
          or has_table_privilege('anon', 'public.' || (c ->> 't'), 'delete'));
  if note is not null then fails := fails || ('anon still has table privileges on: ' || note); end if;

  -- public reads that 0001 granted must still work for anon ---------------------------------
  begin
    execute 'reset role';
    execute 'set local role anon';
    checks := checks + 1;
    execute 'select count(*) from public.categories' into cnt;
    if cnt < 1 then fails := fails || 'anon can no longer read active categories'; end if;
    r_ins := rls_test.run('select 1 from public.plans, public.global_limits, public.legal_docs');
    if r_ins like 'err%' then fails := fails || format('anon public read broke: %s', r_ins); end if;
    raise exception 'rollback this unit' using errcode = 'RB001';
  exception when sqlstate 'RB001' then
    null;
  end;

  if cardinality(fails) > 0 then
    raise exception E'RLS checks FAILED (% of % checks):\n  - %', cardinality(fails), checks, array_to_string(fails, E'\n  - ');
  end if;
  raise notice 'RLS checks passed: % checks across % tables and % actors', checks, jsonb_array_length(cases), cardinality(actors);
end $$;

rollback;
