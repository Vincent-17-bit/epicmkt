import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB } from "./db.mjs";
import { validateWeeklyHours, WEEK_DAYS } from "../../shared/src/seller/hours.js";
import { isOpenOn } from "../../shared/src/utils.js";
import { zonedTimeToUtc } from "../../shared/src/time.js";

let c;
before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_hours" }));
  await seedFixtures(c);
});
after(async () => { await c.end(); });

const setHours = (who, hours) => tx(c, who, async (k) => (await sql(k, `select seller_set_hours($1::jsonb) as r`, [JSON.stringify(hours)]))[0].r, { commit: true });
const stored = async (biz = ids.bizA) => (await sql(c, `select hours from businesses where id = $1`, [biz]))[0].hours;
const everyDay = (slot) => Object.fromEntries(WEEK_DAYS.map((d) => [d, slot]));

test("a seller saves weekly hours and reads the same values back", async () => {
  const hours = { mon: ["08:00", "18:00"], tue: ["20:00", "02:00"], wed: ["00:00", "23:59"], sat: null };
  const out = await setHours(asA, hours);
  assert.deepEqual(out, { mon: ["08:00", "18:00"], tue: ["20:00", "02:00"], wed: ["00:00", "23:59"] });
  assert.deepEqual(await stored(), out);
  const seen = await tx(c, asA, (k) => sql(k, `select hours from businesses`));
  assert.deepEqual(seen[0].hours, out);
});

test("a seller cannot write another shop's hours, and a day left out is closed", async () => {
  await setHours(asB, { fri: ["09:00", "10:00"] });
  await setHours(asA, { mon: ["07:00", "09:00"] });
  assert.deepEqual(await stored(ids.bizB), { fri: ["09:00", "10:00"] });
  assert.deepEqual(await stored(ids.bizA), { mon: ["07:00", "09:00"] });
  await rejects(c, { role: "anon" }, `select seller_set_hours('{}'::jsonb)`, [], /permission denied/);
  assert.equal((await tx(c, asA, (k) => k.query(`update businesses set hours = '{"mon":["01:00","02:00"]}'`))).rowCount, 0);
});

test("malformed input is rejected with a plain code, and matches the shared validator", async () => {
  const bad = [
    [null, /invalid_hours/],
    [[], /invalid_hours/],
    [{ xyz: ["08:00", "09:00"] }, /unknown_day/],
    [{ mon: "08:00" }, /invalid_interval/],
    [{ mon: ["08:00"] }, /invalid_interval/],
    [{ mon: ["8:00", "09:00"] }, /invalid_time/],
    [{ mon: ["24:00", "09:00"] }, /invalid_time/],
    [{ mon: ["08:60", "09:00"] }, /invalid_time/],
    [{ mon: [8, 9] }, /invalid_time/],
    [{ mon: ["09:00", "09:00"] }, /zero_length/]
  ];
  for (const [value, pattern] of bad) {
    await rejects(c, asA, `select seller_set_hours($1::jsonb)`, [JSON.stringify(value)], pattern);
    assert.equal(validateWeeklyHours(value).ok, false, JSON.stringify(value));
  }
  const good = [{}, { mon: ["00:00", "23:59"] }, { sun: ["22:00", "06:00"] }, everyDay(["06:30", "21:15"])];
  for (const value of good) {
    assert.equal(validateWeeklyHours(value).ok, true);
    assert.deepEqual(await setHours(asA, value), validateWeeklyHours(value).value);
  }
});

test("a suspended seller is refused, a non-seller is refused, and every save writes an audit row", async () => {
  await sql(c, `delete from audit_log where business_id = $1 and action = 'hours_updated'`, [ids.bizA]);
  await setHours(asA, { mon: ["08:00", "12:00"], thu: ["08:00", "12:00"] });
  const audit = await sql(c, `select data from audit_log where business_id = $1 and action = 'hours_updated'`, [ids.bizA]);
  assert.equal(audit.length, 1);
  assert.deepEqual(audit[0].data.open_days, ["mon", "thu"]);
  await rejects(c, { sub: "00000000-0000-0000-0000-0000000000ff" }, `select seller_set_hours('{}'::jsonb)`, [], /not_a_seller/);
  await sql(c, `update businesses set status = 'suspended' where id = $1`, [ids.bizA]);
  await rejects(c, asA, `select seller_set_hours($1::jsonb)`, [JSON.stringify({ mon: ["01:00", "02:00"] })], /account_suspended/);
  await sql(c, `update businesses set status = 'live' where id = $1`, [ids.bizA]);
  assert.deepEqual(await stored(), { mon: ["08:00", "12:00"], thu: ["08:00", "12:00"] });
});

const ZONES = ["Africa/Nairobi", "Asia/Kolkata", "America/Los_Angeles", "Pacific/Auckland"];
const EXCEPTIONS = [
  { id: "1", date: "2026-11-02", kind: "closed", intervals: [], note: null },
  { id: "2", date: "2026-11-03", kind: "special", intervals: [["13:00", "14:00"]], note: null },
  { id: "3", date: "2026-11-04", kind: "special", intervals: [["22:00", "04:00"]], note: null },
  { id: "4", date: "2026-11-06", kind: "special", intervals: [["00:00", "23:59"]], note: null }
];
const SCENARIOS = [
  everyDay(["00:00", "23:59"]),
  everyDay(["08:00", "18:00"]),
  everyDay(["20:00", "02:00"]),
  { mon: ["00:00", "23:59"], wed: ["09:00", "09:00"], fri: ["22:00", "23:59"] },
  {}
];

test("hours_open_in agrees with the JavaScript rule on a grid of instants in four shop zones", async () => {
  const instants = [];
  const start = Date.UTC(2026, 10, 1, 0, 0);
  for (let minute = 0; minute < 9 * 1440; minute += 7) instants.push(new Date(start + minute * 60000));
  for (const zone of ZONES) {
    for (const day of [1, 2, 3, 4, 5, 6, 7]) {
      for (const [h, m, s] of [[0, 0, 0], [23, 59, 0], [23, 59, 30], [0, 0, 30]]) {
        instants.push(new Date(zonedTimeToUtc({ year: 2026, month: 11, day, hour: h, minute: m }, zone).getTime() + s * 1000));
      }
    }
    for (const [y, mo, d] of [[2026, 3, 8], [2026, 11, 1], [2026, 9, 27], [2026, 4, 5]]) {
      for (let h = 0; h < 24; h += 1) instants.push(zonedTimeToUtc({ year: y, month: mo, day: d, hour: h, minute: 30 }, zone));
    }
  }
  let checked = 0;
  for (const zone of ZONES) {
    for (const hours of SCENARIOS) {
      for (const ex of [EXCEPTIONS, []]) {
        const rows = await sql(c, `select t, hours_open_in($1::jsonb, $2::jsonb, t, $3) as open from unnest($4::timestamptz[]) t`, [JSON.stringify(hours), JSON.stringify(ex), zone, instants]);
        for (const row of rows) {
          assert.equal(row.open, isOpenOn(hours, ex, new Date(row.t), zone), `${zone} ${new Date(row.t).toISOString()} ${JSON.stringify(hours)}`);
          checked += 1;
        }
      }
    }
  }
  assert.ok(checked > 50000, String(checked));
});

test("hours_open (Nairobi) reads a 00:00 to 23:59 day as open at 23:59:30", async () => {
  const at = (iso) => sql(c, `select hours_open($1::jsonb, '[]'::jsonb, $2::timestamptz) as open`, [JSON.stringify(everyDay(["00:00", "23:59"])), iso]).then((r) => r[0].open);
  assert.equal(await at("2026-11-04T20:59:30Z"), true);
  assert.equal(await at("2026-11-04T21:00:00Z"), true);
});

test("the shop's date, not Nairobi's, decides which exceptions a customer sees and a seller may add", async () => {
  await sql(c, `update businesses set exceptions = '[]', timezone = 'America/Los_Angeles', paid_until = now() + interval '30 days' where id = $1`, [ids.bizA]);
  const today = (await sql(c, `select shop_day(now(), 'America/Los_Angeles')::text as d`))[0].d;
  const nairobi = (await sql(c, `select nairobi_day(now())::text as d`))[0].d;
  const save = (date) => tx(c, asA, async (k) => (await sql(k, `select seller_save_exception(null, $1::date, 'closed') as r`, [date]))[0].r, { commit: true });
  const saved = await save(today);
  assert.equal(saved.date, today);
  if (today < nairobi) await rejects(c, asA, `select seller_save_exception(null, $1::date, 'closed')`, [nairobi < today ? nairobi : "1999-01-01"], /date_in_past/);
  const listed = (await sql(c, `select public_exceptions(exceptions, timezone) as e from businesses where id = $1`, [ids.bizA]))[0].e;
  assert.deepEqual(listed.map((e) => e.date), [today]);
  const view = await sql(c, `select exceptions from public_businesses where id = $1`, [ids.bizA]);
  assert.deepEqual(view[0].exceptions.map((e) => e.date), [today]);
});

test("yesterday in the shop's zone is kept so an overnight exception carries past midnight", async () => {
  const yesterday = (await sql(c, `select (shop_day(now(), 'Pacific/Auckland') - 1)::text as d`))[0].d;
  const twoAgo = (await sql(c, `select (shop_day(now(), 'Pacific/Auckland') - 2)::text as d`))[0].d;
  const list = JSON.stringify([
    { id: "a", date: yesterday, kind: "special", intervals: [["22:00", "04:00"]], note: null },
    { id: "b", date: twoAgo, kind: "closed", intervals: [], note: null }
  ]);
  const rows = (await sql(c, `select public_exceptions($1::jsonb, 'Pacific/Auckland') as e`, [list]))[0].e;
  assert.deepEqual(rows.map((e) => e.id), ["a"]);
});

test("deleting and saving keep the shop's yesterday and drop older dates", async () => {
  await sql(c, `update businesses set timezone = 'Pacific/Auckland' where id = $1`, [ids.bizA]);
  const day = async (n) => (await sql(c, `select (shop_day(now(), 'Pacific/Auckland') + $1::int)::text as d`, [n]))[0].d;
  const [old, yest, soon] = [await day(-3), await day(-1), await day(2)];
  await sql(c, `update businesses set exceptions = $1::jsonb where id = $2`, [JSON.stringify([
    { id: "00000000-0000-0000-0000-00000000000a", date: old, kind: "closed", intervals: [], note: null },
    { id: "00000000-0000-0000-0000-00000000000b", date: yest, kind: "closed", intervals: [], note: null },
    { id: "00000000-0000-0000-0000-00000000000c", date: soon, kind: "closed", intervals: [], note: null }
  ]), ids.bizA]);
  const found = await tx(c, asA, async (k) => (await sql(k, `select seller_delete_exception('00000000-0000-0000-0000-00000000000c') as r`))[0].r, { commit: true });
  assert.equal(found, true);
  const left = (await sql(c, `select exceptions from businesses where id = $1`, [ids.bizA]))[0].exceptions;
  assert.deepEqual(left.map((e) => e.date), [yest]);
});

test("hours_open_in agrees with the JavaScript rule in every zone Postgres accepts, with breaks, across daylight saving changes", async () => {
  const { isValidTimeZone } = await import("../../shared/src/time.js");
  const names = (await sql(c, `select name from pg_timezone_names where name !~ '^(posix|right)/' order by name`)).map((r) => r.name).filter((z) => isValidTimeZone(z) && z.includes("/"));
  const hours = { mon: ["09:00", "18:00"], tue: ["20:00", "02:00"], wed: ["00:00", "23:59"], thu: ["09:00", "18:00"], fri: ["22:00", "03:00"], sat: ["09:00", "13:00"] };
  const ex = [
    { id: "a", kind: "break", date: "2026-01-01", until: null, weekdays: ["mon", "wed", "thu"], intervals: [["13:00", "14:00"], ["02:30", "03:30"]], note: null },
    { id: "b", kind: "break", date: "2026-01-01", until: null, weekdays: ["tue", "fri"], intervals: [["23:00", "23:30"], ["01:00", "01:30"]], note: null }
  ];
  const windows = [[2026, 3, 7], [2026, 3, 28], [2026, 10, 24], [2026, 11, 1], [2027, 3, 13], [2027, 3, 27]];
  let checked = 0;
  for (const zone of names) {
    const instants = [];
    for (const [y, mo, d] of windows) {
      for (let day = d; day < d + 3; day += 1) {
        for (let h = 0; h < 24; h += 1) for (const mi of [0, 30, 59]) instants.push(zonedTimeToUtc({ year: y, month: mo, day, hour: h, minute: mi }, zone));
      }
    }
    const rows = await sql(c, `select t, hours_open_in($1::jsonb, $2::jsonb, t, $3) as open from unnest($4::timestamptz[]) t`, [JSON.stringify(hours), JSON.stringify(ex), zone, instants]);
    for (const row of rows) {
      assert.equal(row.open, isOpenOn(hours, ex, new Date(row.t), zone), `${zone} ${new Date(row.t).toISOString()}`);
      checked += 1;
    }
  }
  assert.ok(names.length > 300, String(names.length));
  assert.ok(checked > 100000, String(checked));
});
