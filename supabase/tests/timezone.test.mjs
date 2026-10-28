import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, sql } from "./db.mjs";
import { parseInstant } from "../../shared/src/time.js";

// The time contract (docs/timezones.md): instants are stored as UTC timestamptz and leave as ISO 8601 UTC; business
// days are read in an explicit Africa/Nairobi. None of that may change with the session time zone.

let c;
before(async () => { c = await connect(await createDatabase({ database: "epicmkt_timezone" })); });
after(async () => { await c.end(); });

// Zones that hurt: half hour and 45 minute offsets, DST in both hemispheres, DST starting at midnight, the date line.
const SESSION_ZONES = [
  "UTC", "Africa/Nairobi", "America/New_York", "America/Los_Angeles", "America/Havana", "America/St_Johns",
  "Europe/London", "Asia/Kolkata", "Asia/Kathmandu", "Australia/Sydney", "Australia/Lord_Howe",
  "Pacific/Chatham", "Pacific/Apia", "Pacific/Kiritimati", "Pacific/Pago_Pago"
];

test("no column in the public schema is a timestamp without a time zone", async () => {
  const rows = await sql(c, `
    select table_name, column_name from information_schema.columns
     where table_schema = 'public' and data_type = 'timestamp without time zone'`);
  assert.deepEqual(rows, []);
});

test("every created_at style column is timestamptz", async () => {
  const rows = await sql(c, `
    select table_name, column_name, data_type from information_schema.columns
     where table_schema = 'public' and (column_name like '%\\_at' or column_name in ('paid_until', 'starts_at', 'ends_at'))
       and data_type not in ('timestamp with time zone')`);
  assert.deepEqual(rows, [], "a column named like an instant is not timestamptz");
});

test("a new session starts in UTC", async () => {
  const [{ tz }] = await sql(c, `select current_setting('TimeZone') as tz`);
  assert.equal(tz, "UTC");
});

test("timestamptz serialises to JSON as ISO 8601 in UTC", async () => {
  const [{ j }] = await sql(c, `select to_json('2026-10-25 07:51:00+03'::timestamptz)::text as j`);
  assert.match(j, /^"2026-10-25T04:51:00(\.\d+)?\+00:00"$/);
});

test("the stored instant is identical whatever the session zone", async () => {
  for (const zone of SESSION_ZONES) {
    await sql(c, `select set_config('TimeZone', $1, false)`, [zone]);
    const [{ epoch }] = await sql(c, `select extract(epoch from '2026-10-25 07:51:00+03'::timestamptz)::bigint::text as epoch`);
    assert.equal(epoch, String(Date.UTC(2026, 9, 25, 4, 51) / 1000), zone);
  }
  await sql(c, `select set_config('TimeZone', 'UTC', false)`);
});

test("business days do not move with the session zone", async () => {
  for (const zone of SESSION_ZONES) {
    await sql(c, `select set_config('TimeZone', $1, false)`, [zone]);
    const [r] = await sql(c, `
      select public.nairobi_day('2026-10-24T21:00:00Z'::timestamptz)::text as day_at_midnight,
             public.nairobi_day('2026-10-24T20:59:59Z'::timestamptz)::text as day_before,
             public.nairobi_midnight('2026-10-25'::date) = '2026-10-24T21:00:00Z'::timestamptz as midnight_ok,
             public.listing_state('2026-10-25T00:00:00+03'::timestamptz, '2026-10-25T12:00:00Z'::timestamptz) as state`);
    assert.equal(r.day_at_midnight, "2026-10-25", zone);
    assert.equal(r.day_before, "2026-10-24", zone);
    assert.equal(r.midnight_ok, true, zone);
    assert.equal(r.state, "active", zone);
  }
  await sql(c, `select set_config('TimeZone', 'UTC', false)`);
});

test("the two functions that read the session zone are pinned to UTC", async () => {
  const rows = await sql(c, `
    select p.proname, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('admin_analytics', 'log_search') order by 1`);
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.ok((row.proconfig ?? []).some((s) => /^timezone=UTC$/i.test(s)), `${row.proname} is not pinned: ${JSON.stringify(row.proconfig)}`);
  }
});

test("the date series behind analytics survives a session zone that starts daylight saving at midnight", async () => {
  // This is the shape admin_analytics uses. Havana skips 00:00 to 01:00 on 8 March 2026, so a midnight timestamptz on that
  // day does not exist. Pinned to UTC (as the function now is) the series is exact; unpinned it round trips through the zone.
  await sql(c, `select set_config('TimeZone', 'America/Havana', false)`);
  await sql(c, `
    create or replace function pg_temp.series() returns text language sql set timezone to 'UTC' as $f$
      select string_agg(d::date::text, ',' order by d) from generate_series('2026-03-06'::date, '2026-03-10'::date, interval '1 day') d $f$`);
  const pinned = await sql(c, `select pg_temp.series() as s`);
  assert.equal(pinned[0].s, "2026-03-06,2026-03-07,2026-03-08,2026-03-09,2026-03-10");
  await sql(c, `select set_config('TimeZone', 'UTC', false)`);
});

test("whatever Postgres prints for a timestamptz, in any session zone, the browser parser recovers the exact instant", async () => {
  // Microseconds on purpose: Postgres keeps six digits, JavaScript keeps three.
  const instant = "2026-10-25 04:51:07.123456+00";
  const expectedMs = Date.UTC(2026, 9, 25, 4, 51, 7, 123);
  for (const zone of SESSION_ZONES) {
    await sql(c, `select set_config('TimeZone', $1, false)`, [zone]);
    const [r] = await sql(c, `
      select to_json($1::timestamptz)::text as json_text,
             jsonb_build_object('at', $1::timestamptz)->>'at' as jsonb_text,
             $1::timestamptz::text as plain_text,
             (select (to_jsonb(t)->>'at') from (select $1::timestamptz as at) t) as row_json`, [instant]);
    for (const [form, text] of Object.entries({ json_text: r.json_text.replaceAll('"', ""), jsonb_text: r.jsonb_text, plain_text: r.plain_text, row_json: r.row_json })) {
      const parsed = parseInstant(text);
      assert.ok(parsed, `${zone} ${form}: could not parse ${JSON.stringify(text)}`);
      assert.equal(parsed.getTime(), expectedMs, `${zone} ${form}: ${text}`);
    }
  }
  await sql(c, `select set_config('TimeZone', 'UTC', false)`);
});

test("hours_open_in reads a shop's hours in the shop's own zone", async () => {
  const hours = { mon: ["10:00", "22:00"] };
  const at = (iso) => sql(c, `select hours_open_in($1::jsonb, '[]'::jsonb, $2::timestamptz, $3) as open`, [JSON.stringify(hours), iso, "Asia/Kolkata"]).then((r) => r[0].open);
  assert.equal(await at("2026-10-26T16:29:00Z"), true, "21:59 Monday in Mumbai");
  assert.equal(await at("2026-10-26T16:30:00Z"), false, "22:00 Monday in Mumbai");
  const nairobi = await sql(c, `select hours_open_in($1::jsonb, '[]'::jsonb, '2026-10-26T16:30:00Z'::timestamptz, 'Africa/Nairobi') as open`, [JSON.stringify(hours)]);
  assert.equal(nairobi[0].open, true, "the same instant is 19:30 in Nairobi, still open there");
});

test("businesses.timezone exists and defaults to Nairobi", async () => {
  const rows = await sql(c, `select column_default from information_schema.columns where table_name = 'businesses' and column_name = 'timezone'`);
  assert.equal(rows.length, 1);
  assert.match(rows[0].column_default, /Africa\/Nairobi/);
});
