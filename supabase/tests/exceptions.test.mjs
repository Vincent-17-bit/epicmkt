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
    [addDays(today, 1), "special", [["12:00", "09:00"]], null, /interval_order/],
    [addDays(today, 1), "special", [["09:00", "09:00"]], null, /interval_order/],
    [addDays(today, 1), "special", [["09:00", "12:00"], ["11:00", "14:00"]], null, /intervals_overlap/],
    [addDays(today, 1), "special", [["09:00", "12:00"], ["12:00", "14:00"]], null, /intervals_overlap/],
    [addDays(today, 1), "closed", [], "x".repeat(121), /invalid_note/],
    [addDays(today, 1), "closed", [], "bad\u0007note", /invalid_note/],
  ];
  for (const [d, k, i, n, re] of bad) await rejects(c, asA, `select seller_save_exception(null, $1::date, $2, $3::jsonb, $4)`, [d, k, JSON.stringify(i), n], re);
  assert.equal((await list()).length, 0);
});

test("a closed day ignores any intervals sent with it; a note is plain text stored as given", async () => {
  await reset();
  const e = await save(asA, addDays(today, 7), "closed", [["09:00", "10:00"]], "<b>Back soon</b> & thanks");
  assert.deepEqual(e.intervals, []);
  assert.equal(e.note, "<b>Back soon</b> & thanks");
});

test("works for suspended, paused and expired sellers", async () => {
  for (const status of ["suspended", "paused", "expired"]) {
    await reset();
    await sql(c, `update businesses set status = '${status}' where id = '${ids.bizA}'`);
    const e = await save(asA, addDays(today, 3));
    assert.equal(e.kind, "closed", status);
    assert.equal((await tx(c, asA, (k) => sql(k, `select seller_delete_exception('${e.id}') as r`), { commit: true }))[0].r, true);
  }
  await sql(c, `update businesses set status = 'live' where id = '${ids.bizA}'`);
});

test("changes are audited without the note text", async () => {
  await reset();
  // audit_log is append-only, so the test reads only the rows written after this point instead of clearing the table.
  const since = (await sql(c, `select coalesce(max(id), 0)::bigint as n from audit_log`))[0].n;
  const e = await save(asA, addDays(today, 3), "closed", [], "private reason");
  await tx(c, asA, (k) => k.query(`select seller_delete_exception('${e.id}')`), { commit: true });
  const rows = await sql(c, `select action, data from audit_log where business_id = '${ids.bizA}' and id > ${since} order by id`);
  assert.deepEqual(rows.map((r) => r.action), ["exception_added", "exception_deleted"]);
  assert.ok(!JSON.stringify(rows).includes("private reason"));
});

test("SQL and the shared JS validator agree", async () => {
  const dates = [addDays(today, -1), today, addDays(today, 1), addDays(today, 730), addDays(today, 731), "2026-02-30", "nonsense"];
  const kinds = ["closed", "special", "other"];
  const intervalSets = [[], [["09:00", "12:00"]], [["09:00", "12:00"], ["13:00", "17:00"]], [["12:00", "09:00"]], [["09:00", "12:00"], ["11:00", "13:00"]], [["24:00", "25:00"]], [["09:00", "10:00"], ["11:00", "12:00"], ["13:00", "14:00"], ["15:00", "16:00"]]];
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
