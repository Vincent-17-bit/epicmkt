import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB } from "./db.mjs";
import { addDays, validateException } from "../../shared/src/seller/exceptions.js";

let c;
let today;
before(async () => {
  c = await connect(await createDatabase());
  await seedFixtures(c);
  today = (await sql(c, `select public.nairobi_day(now())::text as d`))[0].d;
});
after(async () => { await c.end(); });

const save = (who, date, kind = "closed", intervals = [], note = null, id = null) =>
  tx(c, who, async (k) => (await sql(k, `select seller_save_exception($1::uuid, $2::date, $3, $4::jsonb, $5) as r`, [id, date, kind, JSON.stringify(intervals), note]))[0].r, { commit: true });
const list = async (biz = ids.bizA) => (await sql(c, `select exceptions from businesses where id = '${biz}'`))[0].exceptions;
const reset = () => sql(c, `update businesses set exceptions = '[]'`);

test("sellers cannot write exceptions directly", async () => {
  assert.equal((await tx(c, asA, (k) => k.query(`update businesses set exceptions = '[{"date":"2030-01-01"}]'`))).rowCount, 0);
  await rejects(c, asA, `select seller_update_profile($1::jsonb)`, [JSON.stringify({ exceptions: [] })], /field_not_allowed/);
  await rejects(c, { role: "anon" }, `select seller_save_exception(null, '2030-01-01', 'closed')`, [], /permission denied/);
});

test("adds a closed day and a special-hours day; the list is sorted by date", async () => {
  await reset();
  const later = await save(asA, addDays(today, 20), "special", [["14:00", "18:00"], ["08:00", "12:00"]], "Stock take");
  const sooner = await save(asA, addDays(today, 3), "closed", [], "  Public holiday  ");
  assert.deepEqual(later.intervals, [["08:00", "12:00"], ["14:00", "18:00"]], "intervals are sorted");
  assert.equal(sooner.note, "Public holiday");
  assert.deepEqual(sooner.intervals, []);
  const stored = await list();
  assert.deepEqual(stored.map((e) => e.date), [addDays(today, 3), addDays(today, 20)]);
  assert.match(stored[0].id, /^[0-9a-f-]{36}$/);
  const seen = await tx(c, asA, (k) => sql(k, `select exceptions from businesses`));
  assert.equal(seen[0].exceptions.length, 2, "the seller reads their own list");
  assert.equal((await list(ids.bizB)).length, 0, "another business is untouched");
});

test("edits keep the id and one exception per date", async () => {
  await reset();
  const a = await save(asA, addDays(today, 5), "closed", [], "x");
  const edited = await save(asA, addDays(today, 6), "special", [["10:00", "13:00"]], "Late start", a.id);
  assert.equal(edited.id, a.id);
  const stored = await list();
  assert.equal(stored.length, 1);
  assert.deepEqual([stored[0].date, stored[0].kind], [addDays(today, 6), "special"]);
  await save(asA, addDays(today, 9));
  await rejects(c, asA, `select seller_save_exception(null, $1::date, 'closed')`, [addDays(today, 9)], /date_taken/);
  await rejects(c, asA, `select seller_save_exception($1::uuid, $2::date, 'closed')`, [a.id, addDays(today, 9)], /date_taken/);
  assert.equal((await list()).length, 2);
});

test("delete, then Undo puts the same exception back", async () => {
  await reset();
  const e = await save(asA, addDays(today, 4), "special", [["09:00", "11:00"]], "Training");
  assert.equal((await tx(c, asA, (k) => sql(k, `select seller_delete_exception('${e.id}') as r`), { commit: true }))[0].r, true);
  assert.equal((await list()).length, 0);
  assert.equal((await tx(c, asA, (k) => sql(k, `select seller_delete_exception('${e.id}') as r`)))[0].r, false, "deleting twice is harmless");
  const back = await save(asA, e.date, e.kind, e.intervals, e.note, e.id);
  assert.deepEqual(back, e);
  assert.deepEqual(await list(), [e]);
});

test("a seller cannot delete or edit another seller's exception", async () => {
  await reset();
  const mine = await save(asA, addDays(today, 4));
  assert.equal((await tx(c, asB, (k) => sql(k, `select seller_delete_exception('${mine.id}') as r`), { commit: true }))[0].r, false);
  assert.equal((await list()).length, 1);
  const theirs = await save(asB, addDays(today, 4), "special", [["10:00", "12:00"]], null, mine.id);
  assert.equal((await list()).length, 1, "same id on another business is a new row there");
  assert.equal((await list(ids.bizB)).length, 1);
  assert.equal(theirs.id, mine.id);
  assert.equal((await list())[0].kind, "closed");
});

test("past dates are refused, and past ones already stored are dropped on the next write", async () => {
  await reset();
  await rejects(c, asA, `select seller_save_exception(null, $1::date, 'closed')`, [addDays(today, -1)], /date_in_past/);
  await save(asA, today);
  await sql(c, `update businesses set exceptions = exceptions || $1::jsonb where id = '${ids.bizA}'`.replace("$1", `'[{"id":"${"0".repeat(8)}-0000-0000-0000-000000000000","date":"${addDays(today, -5)}","kind":"closed","intervals":[],"note":null}]'`));
  assert.equal((await list()).length, 2);
  await save(asA, addDays(today, 2));
  assert.deepEqual((await list()).map((e) => e.date), [today, addDays(today, 2)]);
});

test("limit of 60 upcoming: the 61st is refused, editing at the limit still works, a freed slot can be reused", async () => {
  await reset();
  for (let i = 0; i < 60; i++) await save(asA, addDays(today, i + 1));
  assert.equal((await list()).length, 60);
  await rejects(c, asA, `select seller_save_exception(null, $1::date, 'closed')`, [addDays(today, 100)], /limit_reached:exceptions/);
  const first = (await list())[0];
  const edited = await save(asA, first.date, "special", [["10:00", "12:00"]], null, first.id);
  assert.equal(edited.kind, "special");
  assert.equal((await list()).length, 60);
  await tx(c, asA, (k) => k.query(`select seller_delete_exception('${first.id}')`), { commit: true });
  await save(asA, addDays(today, 100));
  assert.equal((await list()).length, 60);
  await reset();
});

test("far-future, malformed and unsafe input is refused", async () => {
  await reset();
  const bad = [
    [addDays(today, 731), "closed", [], null, /date_too_far/],
    [addDays(today, 1), "weekend", [], null, /invalid_kind/],
    [addDays(today, 1), "special", [], null, /intervals_required/],
    [addDays(today, 1), "special", [["08:00", "09:00"], ["10:00", "11:00"], ["12:00", "13:00"], ["14:00", "15:00"]], null, /too_many_intervals/],
    [addDays(today, 1), "special", [["25:00", "26:00"]], null, /invalid_time/],
    [addDays(today, 1), "special", [["8:00", "9:00"]], null, /invalid_time/],
    [addDays(today, 1), "special", [["20:00", "02:00"], ["22:00", "23:00"]], null, /intervals_overlap/],
    [addDays(today, 1), "special", [["09:00", "09:00"], ["10:00", "11:00"]], null, /intervals_overlap/],
    [addDays(today, 1), "special", [["09:00", "12:00"], ["11:00", "14:00"]], null, /intervals_overlap/],
    [addDays(today, 1), "special", [["09:00", "12:00"], ["12:00", "14:00"]], null, /intervals_overlap/],
    [addDays(today, 1), "closed", [], "x".repeat(121), /invalid_note/],
    [addDays(today, 1), "closed", [], "bad\u0007note", /invalid_note/],
  ];
  for (const [d, k, i, n, re] of bad) await rejects(c, asA, `select seller_save_exception(null, $1::date, $2, $3::jsonb, $4)`, [d, k, JSON.stringify(i), n], re);
  assert.equal((await list()).length, 0);
});

test("an overnight interval (end not after start) is accepted and stored as given, sorted by start", async () => {
  await reset();
  const e = await save(asA, addDays(today, 2), "special", [["20:00", "02:00"], ["09:00", "12:00"]], "Late night");
  assert.deepEqual(e.intervals, [["09:00", "12:00"], ["20:00", "02:00"]]);
  assert.deepEqual((await save(asA, addDays(today, 3), "special", [["09:00", "09:00"]])).intervals, [["09:00", "09:00"]], "end equal to start is a full 24 hours");
  await rejects(c, asA, `select seller_save_exception(null, $1::date, 'special', '[["20:00","02:00"],["22:00","23:00"]]'::jsonb)`, [addDays(today, 4)], /intervals_overlap/);
  assert.equal((await list()).length, 2);
});

test("a closed day ignores any intervals sent with it; a note is plain text stored as given", async () => {
  await reset();
  const e = await save(asA, addDays(today, 7), "closed", [["09:00", "10:00"]], "<b>Back soon</b> & thanks");
  assert.deepEqual(e.intervals, []);
  assert.equal(e.note, "<b>Back soon</b> & thanks");
});

test("works for paused and expired sellers, but a suspended seller is locked out", async () => {
  for (const status of ["paused", "expired"]) {
    await reset();
    await sql(c, `update businesses set status = '${status}' where id = '${ids.bizA}'`);
    const e = await save(asA, addDays(today, 3));
    assert.equal(e.kind, "closed", status);
    assert.equal((await tx(c, asA, (k) => sql(k, `select seller_delete_exception('${e.id}') as r`), { commit: true }))[0].r, true);
  }
  await reset();
  await sql(c, `update businesses set status = 'suspended' where id = '${ids.bizA}'`);
  await rejects(c, asA, `select seller_save_exception(null, '${addDays(today, 3)}'::date, 'closed', '[]', null)`, [], /account_suspended/);
  await sql(c, `update businesses set status = 'live' where id = '${ids.bizA}'`);
});

test("changes are audited without the note text", async () => {
  await reset();
  await sql(c, `truncate audit_log`);
  const e = await save(asA, addDays(today, 3), "closed", [], "private reason");
  await tx(c, asA, (k) => k.query(`select seller_delete_exception('${e.id}')`), { commit: true });
  const rows = await sql(c, `select action, data from audit_log where business_id = '${ids.bizA}' order by id`);
  assert.deepEqual(rows.map((r) => r.action), ["exception_added", "exception_deleted"]);
  assert.ok(!JSON.stringify(rows).includes("private reason"));
});

test("SQL and the shared JS validator agree", async () => {
  const dates = [addDays(today, -1), today, addDays(today, 1), addDays(today, 730), addDays(today, 731), "2026-02-30", "nonsense"];
  const kinds = ["closed", "special", "other"];
  const intervalSets = [[], [["09:00", "12:00"]], [["09:00", "12:00"], ["13:00", "17:00"]], [["12:00", "09:00"]], [["20:00", "02:00"]], [["09:00", "09:00"]], [["20:00", "02:00"], ["22:00", "23:00"]], [["20:00", "02:00"], ["09:00", "12:00"]], [["09:00", "12:00"], ["11:00", "13:00"]], [["24:00", "25:00"]], [["09:00", "10:00"], ["11:00", "12:00"], ["13:00", "14:00"], ["15:00", "16:00"]]];
  const notes = [null, "ok", "x".repeat(121)];
  let n = 0;
  for (const date of dates) for (const kind of kinds) for (const intervals of intervalSets) for (const note of notes) {
    const js = validateException({ date, kind, intervals, note }, today);
    let sqlOk = true;
    let sqlError = null;
    try {
      await tx(c, null, (k) => sql(k, `select public.exception_normalize($1::date, $2, $3::jsonb, $4, $5::date)`, [date, kind, JSON.stringify(intervals), note, today]));
    } catch (e) {
      sqlOk = false;
      sqlError = e.message;
    }
    if (date === "2026-02-30" || date === "nonsense") {
      assert.equal(js.ok, false, `${date} is not a real date`);
      continue;
    }
    assert.equal(js.ok, sqlOk, JSON.stringify({ date, kind, intervals, note, sqlError, js }));
    if (!js.ok) assert.equal(sqlError, js.error, JSON.stringify({ date, kind, intervals, note }));
    n += 1;
  }
  assert.ok(n > 200);
});

test("customers (anon) see only today and upcoming exceptions, with public fields only", async () => {
  await reset();
  await sql(c, `update businesses set status = 'live', paid_until = now() + interval '30 days' where id = '${ids.bizA}'`);
  const old = { id: "00000000-0000-0000-0000-000000000001", date: addDays(today, -3), kind: "closed", intervals: [], note: "old", seller_only: "secret" };
  const mk = (id, date, kind, intervals, note) => ({ id, date, kind, intervals, note, seller_only: "secret" });
  const stored = [old, mk("00000000-0000-0000-0000-000000000002", today, "closed", [], "Holiday"), mk("00000000-0000-0000-0000-000000000003", addDays(today, 4), "special", [["10:00", "14:00"]], null), { id: "x", date: "not-a-date", kind: "closed" }];
  await sql(c, `update businesses set exceptions = $1::jsonb where id = '${ids.bizA}'`, [JSON.stringify(stored)]);

  const rows = await tx(c, { role: "anon" }, (k) => sql(k, `select slug, exceptions from public_businesses where id = '${ids.bizA}'`));
  assert.equal(rows.length, 1, "the business is visible to customers");
  assert.deepEqual(rows[0].exceptions, [
    { id: "00000000-0000-0000-0000-000000000002", date: today, kind: "closed", intervals: [], note: "Holiday" },
    { id: "00000000-0000-0000-0000-000000000003", date: addDays(today, 4), kind: "special", intervals: [["10:00", "14:00"]], note: null },
  ], "past and malformed entries are gone, unknown keys are not passed on");

  await rejects(c, { role: "anon" }, `select exceptions from businesses`, [], /permission denied/);
  await reset();
  assert.deepEqual((await tx(c, { role: "anon" }, (k) => sql(k, `select exceptions from public_businesses where id = '${ids.bizA}'`)))[0].exceptions, [], "no exceptions is an empty list");
});

for (const zone of ["America/Los_Angeles", "Pacific/Honolulu", "America/New_York", "Asia/Kolkata"]) test(`a ${zone} shop is closed on its own exception date, including the evening the date is still running there`, async () => {
  await reset();
  await sql(c, `update businesses set timezone = '${zone}' where id = '${ids.bizA}'`);
  const day = (await sql(c, `select shop_day(now(), '${zone}')::text as d`))[0].d;
  await save(asA, day, "closed");
  const row = (await sql(c, `select hours, exceptions, timezone from businesses where id = '${ids.bizA}'`))[0];
  const hours = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, ["08:00", "22:00"]]));
  const openAt = async (hh) => (await sql(c, `select hours_open_in($1::jsonb, $2::jsonb, ($3::date + $4::time) at time zone '${zone}', '${zone}') as o`, [JSON.stringify(hours), JSON.stringify(row.exceptions), day, hh]))[0].o;
  assert.equal(await openAt("19:00"), false);
  assert.equal(await openAt("00:05"), false);
  assert.equal(await openAt("23:30"), false);
  await sql(c, `update businesses set timezone = 'Africa/Nairobi' where id = '${ids.bizA}'`);
});

const saveBreak = (who, date, intervals, { until = null, weekdays = null, note = null, id = null } = {}) =>
  tx(c, who, async (k) => (await sql(k, `select seller_save_exception($1::uuid, $2::date, 'break', $3::jsonb, $4, $5::date, $6::jsonb) as r`, [id, date, JSON.stringify(intervals), note, until, weekdays ? JSON.stringify(weekdays) : null]))[0].r, { commit: true });

test("a break is saved with only its closed windows, one day, a run of days, or every week", async () => {
  await reset();
  const one = await saveBreak(asA, addDays(today, 2), [["14:00", "15:00"], ["13:00", "13:30"]], { note: " Lunch " });
  assert.deepEqual({ ...one, id: undefined }, { id: undefined, date: addDays(today, 2), kind: "break", intervals: [["13:00", "13:30"], ["14:00", "15:00"]], note: "Lunch", until: null, weekdays: null });
  const run = await saveBreak(asA, addDays(today, 5), [["13:00", "14:00"]], { until: addDays(today, 8) });
  assert.equal(run.until, addDays(today, 8));
  const weekly = await saveBreak(asA, addDays(today, 1), [["13:00", "14:00"]], { weekdays: ["fri", "mon", "mon"] });
  assert.deepEqual([weekly.weekdays, weekly.until], [["mon", "fri"], null]);
  assert.equal((await list()).length, 3);
  const closed = await save(asA, addDays(today, 30), "closed");
  assert.deepEqual(Object.keys(closed).sort(), ["date", "id", "intervals", "kind", "note"], "closed and special keep their old shape");
});

test("breaks never block each other or a closed day, but two closed or special exceptions on one date still do", async () => {
  await reset();
  const d = addDays(today, 4);
  await saveBreak(asA, d, [["13:00", "14:00"]]);
  await saveBreak(asA, d, [["16:00", "17:00"]]);
  await save(asA, d, "closed");
  await saveBreak(asA, d, [["10:00", "11:00"]]);
  await rejects(c, asA, `select seller_save_exception(null, $1::date, 'special', '[["09:00","12:00"]]'::jsonb)`, [d], /date_taken/);
  assert.equal((await list()).length, 4);
});

test("break input that makes no sense is refused with the same codes as the shared validator", async () => {
  await reset();
  const d = addDays(today, 3);
  const bad = [
    [{ intervals: [] }, /intervals_required/],
    [{ intervals: [["13:00", "13:00"]] }, /break_order/],
    [{ intervals: [["15:00", "14:00"]] }, /break_order/],
    [{ intervals: [["13:00", "14:00"], ["13:30", "15:00"]] }, /intervals_overlap/],
    [{ intervals: [["01:00", "02:00"], ["03:00", "04:00"], ["05:00", "06:00"], ["07:00", "08:00"]] }, /too_many_intervals/],
    [{ intervals: [["1pm", "14:00"]] }, /invalid_time/],
    [{ until: addDays(today, 2) }, /until_before_date/],
    [{ until: addDays(today, 800) }, /date_too_far/],
    [{ weekdays: [] }, /invalid_weekdays/],
    [{ weekdays: ["funday"] }, /invalid_weekdays/],
  ];
  for (const [over, re] of bad) {
    const input = { intervals: [["13:00", "14:00"]], until: null, weekdays: null, ...over };
    const js = validateException({ date: d, kind: "break", intervals: input.intervals, note: null, until: input.until, weekdays: input.weekdays }, today);
    assert.equal(js.ok, false, JSON.stringify(over));
    await rejects(c, asA, `select seller_save_exception(null, $1::date, 'break', $2::jsonb, null, $3::date, $4::jsonb)`, [d, JSON.stringify(input.intervals), input.until, input.weekdays ? JSON.stringify(input.weekdays) : null], re);
    assert.match(re.source, new RegExp(js.error));
  }
  await rejects(c, asA, `select seller_save_exception(null, $1::date, 'break', '[["13:00","14:00"]]'::jsonb, null, null, null)`, [addDays(today, -1)], /date_in_past/);
  assert.equal((await list()).length, 0);
});

test("a running break stays; an ended one is dropped; a repeating break with no end is kept", async () => {
  await reset();
  const past = addDays(today, -10);
  await sql(c, `update businesses set exceptions = $1::jsonb where id = $2`, [JSON.stringify([
    { id: "00000000-0000-0000-0000-00000000aa01", kind: "break", date: past, until: addDays(today, 2), intervals: [["13:00", "14:00"]], note: null, weekdays: null },
    { id: "00000000-0000-0000-0000-00000000aa02", kind: "break", date: past, until: addDays(past, 1), intervals: [["13:00", "14:00"]], note: null, weekdays: null },
    { id: "00000000-0000-0000-0000-00000000aa03", kind: "break", date: past, until: null, intervals: [["13:00", "14:00"]], note: null, weekdays: ["mon"] },
    { id: "00000000-0000-0000-0000-00000000aa04", kind: "break", date: past, until: null, intervals: [["13:00", "14:00"]], note: null, weekdays: null },
  ]), ids.bizA]);
  const anon = async () => (await tx(c, { role: "anon" }, (k) => sql(k, `select exceptions from public_businesses where id = '${ids.bizA}'`)))[0].exceptions.map((e) => e.id.slice(-2));
  assert.deepEqual(await anon(), ["01", "03"], "customers get the running and the repeating ones only");
  await save(asA, addDays(today, 40), "closed");
  assert.deepEqual((await list()).map((e) => e.id.slice(-2)).filter((x) => x.startsWith("0")).sort(), ["01", "03"]);
  const seen = (await tx(c, { role: "anon" }, (k) => sql(k, `select exceptions from public_businesses where id = '${ids.bizA}'`)))[0].exceptions[0];
  assert.deepEqual(Object.keys(seen).sort(), ["date", "id", "intervals", "kind", "note", "until", "weekdays"]);
});

test("limit of 60 counts each break once, however many days it covers", async () => {
  await reset();
  for (let i = 0; i < 59; i += 1) await save(asA, addDays(today, i + 1), "closed");
  await saveBreak(asA, addDays(today, 1), [["13:00", "14:00"]], { weekdays: ["mon", "tue", "wed", "thu", "fri"] });
  await rejects(c, asA, `select seller_save_exception(null, $1::date, 'break', '[["15:00","16:00"]]'::jsonb)`, [addDays(today, 2)], /limit_reached/);
  await reset();
});

test("hours_open_in agrees with the shared JS for breaks, across zones, days and every minute that matters", async () => {
  await reset();
  const { isOpenOn } = await import("../../shared/src/utils.js");
  const { zonedTimeToUtc } = await import("../../shared/src/time.js");
  const hours = { mon: ["09:00", "18:00"], tue: ["09:00", "18:00"], wed: ["20:00", "02:00"], thu: ["00:00", "23:59"], fri: ["09:00", "18:00"], sat: ["09:00", "13:00"] };
  const ex = [
    { id: "a", kind: "break", date: "2026-11-02", until: null, weekdays: null, intervals: [["13:00", "14:00"], ["16:00", "16:30"]], note: null },
    { id: "b", kind: "break", date: "2026-11-03", until: "2026-11-05", weekdays: null, intervals: [["12:00", "12:30"]], note: null },
    { id: "c", kind: "break", date: "2026-11-01", until: null, weekdays: ["wed", "thu"], intervals: [["23:00", "23:30"], ["01:00", "01:30"]], note: null },
    { id: "d", kind: "closed", date: "2026-11-06", intervals: [], note: null },
    { id: "e", kind: "special", date: "2026-11-07", intervals: [["10:00", "17:00"]], note: null },
    { id: "f", kind: "break", date: "2026-11-06", until: null, weekdays: ["fri", "sat"], intervals: [["11:00", "12:00"]], note: null },
    { id: "g", kind: "break", date: "2026-11-07", until: null, weekdays: ["fri", "sat"], intervals: [["11:00", "12:00"]], note: null },
  ];
  let checked = 0;
  for (const zone of ["Africa/Nairobi", "America/Los_Angeles"]) {
    for (let day = 1; day <= 9; day += 1) {
      for (const [h, mi] of [[0, 0], [0, 30], [1, 0], [1, 15], [1, 30], [2, 0], [9, 0], [11, 0], [11, 59], [12, 0], [12, 29], [12, 30], [13, 0], [13, 59], [14, 0], [16, 0], [16, 29], [16, 30], [17, 59], [18, 0], [20, 0], [22, 59], [23, 0], [23, 29], [23, 30], [23, 59]]) {
        const at = zonedTimeToUtc({ year: 2026, month: 11, day, hour: h, minute: mi }, zone);
        const db = (await sql(c, `select hours_open_in($1::jsonb, $2::jsonb, $3::timestamptz, $4) as o`, [JSON.stringify(hours), JSON.stringify(ex), at.toISOString(), zone]))[0].o;
        assert.equal(db, isOpenOn(hours, ex, at, zone), `${zone} 2026-11-${day} ${h}:${mi}`);
        checked += 1;
      }
    }
  }
  assert.ok(checked > 400);
});
