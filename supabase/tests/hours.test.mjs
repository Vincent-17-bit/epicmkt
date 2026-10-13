import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB, asAdmin } from "./db.mjs";
import { validateClosureMessage, validateWeek, validateDay } from "../../shared/src/hours/index.js";

let c;
let url;

before(async () => {
  url = await createDatabase();
  c = await connect(url);
  await seedFixtures(c);
});
after(async () => { await c.end(); });

const day = (...iv) => ({ closed: false, open24: false, intervals: iv.map(([start, end]) => ({ start, end })) });
const call = (who, text, params) => tx(c, who, async (k) => (await sql(k, text, params))[0], { commit: true });
const save = (who, biz, hours, version) => call(who, `select save_seller_hours($1, $2::jsonb, $3) as r`, [biz, JSON.stringify(hours), version]);
const iso = (ms) => new Date(Date.now() + ms).toISOString();

test("saving hours bumps the version, fills missing days and rejects stale versions", async () => {
  const before = (await sql(c, `select hours_version from businesses where id = '${ids.bizA}'`))[0].hours_version;
  assert.equal(before, 1);
  const out = (await save(asA, ids.bizA, { mon: day(["09:00", "17:00"]) }, 1)).r;
  assert.equal(out.hours_version, 2);
  assert.equal(out.hours.mon.intervals[0].start, "09:00");
  assert.equal(out.hours.sun.closed, true);
  assert.equal(Object.keys(out.hours).length, 7);
  await rejects(c, asA, `select save_seller_hours($1, $2::jsonb, 1)`, [ids.bizA, JSON.stringify({ mon: day(["10:00", "18:00"]) })], /CONCURRENCY_CONFLICT/);
  const ok = (await save(asA, ids.bizA, { mon: day(["10:00", "18:00"]) }, 2)).r;
  assert.equal(ok.hours_version, 3);
  assert.equal((await sql(c, `select hours -> 'mon' -> 'intervals' -> 0 ->> 'start' as s from businesses where id = '${ids.bizA}'`))[0].s, "10:00");
});

test("hours validation mirrors the client rules", async () => {
  const bad = async (hours, re) => rejects(c, asA, `select save_seller_hours($1, $2::jsonb, 3)`, [ids.bizA, JSON.stringify(hours)], re);
  await bad({ mon: day(["09:00", "13:00"], ["12:00", "15:00"]) }, /invalid_hours:overlap/);
  await bad({ mon: day(["08:00", "09:00"], ["10:00", "11:00"], ["12:00", "13:00"], ["14:00", "15:00"], ["16:00", "17:00"]) }, /invalid_hours:too_many_intervals/);
  await bad({ mon: day(["09:00", "09:00"]) }, /invalid_hours:same_time/);
  await bad({ mon: day(["09:03", "17:00"]) }, /invalid_hours:invalid_step/);
  await bad({ mon: day(["9:00", "17:00"]) }, /invalid_hours:invalid_time/);
  await bad({ mon: day(["24:00", "17:00"]) }, /invalid_hours:invalid_time/);
  await bad({ mon: day() }, /invalid_hours:empty_day/);
  await bad({ xyz: day(["09:00", "17:00"]) }, /invalid_hours/);
  await bad({ mon: "open" }, /invalid_hours:invalid_day/);
  await rejects(c, asA, `select save_seller_hours($1, '[]'::jsonb, 3)`, [ids.bizA], /invalid_hours/);
  const fine = (await save(asA, ids.bizA, {
    mon: day(["09:00", "13:00"], ["13:00", "15:00"]),
    tue: day(["22:00", "02:00"]),
    wed: { closed: false, open24: true, intervals: [] },
    thu: { closed: true, open24: false, intervals: [] }
  }, 3)).r;
  assert.equal(fine.hours_version, 4);
});

test("server and client agree on weekly validation", async () => {
  const cases = [
    day(["09:00", "13:00"], ["12:00", "15:00"]),
    day(["09:00", "13:00"], ["13:00", "15:00"]),
    day(["22:00", "02:00"], ["23:00", "23:30"]),
    day(["22:00", "02:00"], ["01:00", "03:00"]),
    day(["08:00", "08:00"]),
    day(["08:03", "17:00"]),
    day(),
    day(["00:00", "00:05"], ["00:05", "23:55"])
  ];
  let version = 4;
  for (const d of cases) {
    const client = validateDay(d).length === 0;
    let server = true;
    try {
      await save(asA, ids.bizA, { mon: d }, version);
      version += 1;
    } catch (e) {
      assert.match(e.message, /invalid_hours/);
      server = false;
    }
    assert.equal(server, client, JSON.stringify(d));
  }
  assert.equal(validateWeek({}).ok, true);
});

test("sellers cannot touch another business and anon cannot call at all", async () => {
  await rejects(c, asB, `select save_seller_hours($1, '{}'::jsonb, 1)`, [ids.bizA], /not_a_seller/);
  await rejects(c, asB, `select set_seller_closure_override($1, null)`, [ids.bizA], /not_a_seller/);
  await rejects(c, asB, `select set_partial_closure($1, 'delivery', null)`, [ids.bizA], /not_a_seller/);
  await rejects(c, asB, `select save_seller_exceptions($1, '[]'::jsonb, 1)`, [ids.bizA], /not_a_seller/);
  for (const q of [`select save_seller_hours($1, '{}'::jsonb, 1)`, `select set_seller_closure_override($1, null)`, `select set_partial_closure($1, 'delivery', null)`, `select save_seller_exceptions($1, '[]'::jsonb, 1)`]) {
    await rejects(c, { role: "anon" }, q, [ids.bizA], /permission denied/);
  }
  const adminOk = (await call(asAdmin, `select save_seller_exceptions($1, '[]'::jsonb, $2) as r`, [ids.bizB, 1])).r;
  assert.equal(adminOk.hours_version, 2);
});

test("two parallel saves with the same version admit exactly one", async () => {
  const k1 = await connect(url);
  const k2 = await connect(url);
  const open = async (k) => {
    await k.query("begin");
    await k.query("set local role authenticated");
    await k.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ids.userB, role: "authenticated" })]);
  };
  try {
    const v = (await sql(c, `select hours_version from businesses where id = '${ids.bizB}'`))[0].hours_version;
    await open(k1);
    await open(k2);
    await k1.query(`select save_seller_hours($1, $2::jsonb, $3)`, [ids.bizB, JSON.stringify({ mon: day(["09:00", "17:00"]) }), v]);
    const second = k2.query(`select save_seller_hours($1, $2::jsonb, $3)`, [ids.bizB, JSON.stringify({ mon: day(["10:00", "18:00"]) }), v]).then(() => "ok", (e) => e.message);
    await new Promise((r) => setTimeout(r, 400));
    await k1.query("commit");
    assert.match(await second, /CONCURRENCY_CONFLICT/);
    await k2.query("rollback");
    assert.equal((await sql(c, `select hours_version from businesses where id = '${ids.bizB}'`))[0].hours_version, v + 1);
  } finally {
    await k1.end();
    await k2.end();
  }
});

test("exceptions: valid dates, no duplicates, no impossible dates, versioned", async () => {
  const v = (await sql(c, `select hours_version from businesses where id = '${ids.bizA}'`))[0].hours_version;
  const list = [
    { date: "2026-12-25", closed: true, open24: false, intervals: [], note: "Christmas" },
    { date: "2026-12-31", closed: false, open24: false, intervals: [{ start: "09:00", end: "13:00" }] }
  ];
  const ok = (await call(asA, `select save_seller_exceptions($1, $2::jsonb, $3) as r`, [ids.bizA, JSON.stringify(list), v])).r;
  assert.equal(ok.hours_version, v + 1);
  assert.equal(ok.exceptions.length, 2);
  const again = (list2, ver, re) => rejects(c, asA, `select save_seller_exceptions($1, $2::jsonb, $3)`, [ids.bizA, JSON.stringify(list2), ver], re);
  await again(list, v, /CONCURRENCY_CONFLICT/);
  await again([list[0], list[0]], v + 1, /invalid_exceptions/);
  await again([{ date: "2026-02-30", closed: true }], v + 1, /invalid_exceptions/);
  await again([{ date: "tomorrow", closed: true }], v + 1, /invalid_exceptions/);
  await again([{ date: "2026-05-01", closed: false, intervals: [] }], v + 1, /invalid_hours:empty_day/);
  await again(Array.from({ length: 61 }, (_, i) => ({ date: `2027-01-${String((i % 28) + 1).padStart(2, "0")}`, closed: true })), v + 1, /invalid_exceptions/);
});

const MESSAGES = [
  "", "Back soon", "Back at 3:00 PM, thank you!", "Closed 12.10.2026", "Price KSh 1500 only", "Closed for lunch (12-1)",
  "see https://shop.example", "visit www.shop.co.ke", "order at shop.com", "wa.me/254712345678", "SHOP.COM", "mail me a@b.co",
  "call 0712345678", "call 0712 345 678", "call +254 712-345-678", "call (0712) 345.678", "x".repeat(81), "x".repeat(80),
  "  spaced   out  ", "a.b", "version 1.2.3", "tel 254712345678", "call me 1 2 3 4 5 6 7 8 9", "e.g. noon", "no.ke", "ok.ke."
];

test("the server message check matches the shared validator on every case", async () => {
  for (const m of MESSAGES) {
    const js = validateClosureMessage(m).code;
    const pg = (await sql(c, `select closure_text_problem($1, 80) as p`, [m]))[0].p;
    assert.equal(pg, js, JSON.stringify(m));
  }
});

test("closure override: validation, 24 hour cap, clear, audit", async () => {
  const set = (o) => call(asA, `select set_seller_closure_override($1, $2::jsonb) as r`, [ids.bizA, o === null ? null : JSON.stringify(o)]);
  const bad = (o, re) => rejects(c, asA, `select set_seller_closure_override($1, $2::jsonb)`, [ids.bizA, JSON.stringify(o)], re);
  const good = { type: "close", until: iso(3600000), reason: "lunch", message: "  Back   soon " };
  const out = (await set(good)).r.override;
  assert.equal(out.type, "close");
  assert.equal(out.message, "Back soon");
  assert.equal(out.reason, "lunch");
  assert.match(out.until, /Z$/);
  await set(good);
  assert.equal((await sql(c, `select override ->> 'type' as t from businesses where id = '${ids.bizA}'`))[0].t, "close");
  await bad({ ...good, type: "maybe" }, /invalid_override:type/);
  await bad({ ...good, until: "nope" }, /invalid_override:time/);
  await bad({ ...good, until: iso(-60000) }, /closure_in_past/);
  await bad({ ...good, until: iso(24 * 3600000 + 60000) }, /closure_too_long/);
  await bad({ ...good, reason: "party" }, /invalid_override:reason/);
  await bad({ ...good, message: "see https://x.com" }, /invalid_message:link/);
  await bad({ ...good, message: "a@b.co" }, /invalid_message:email/);
  await bad({ ...good, message: "0712345678" }, /invalid_message:phone/);
  await bad({ ...good, message: "y".repeat(81) }, /invalid_message:too_long/);
  await bad({ ...good, message: 12345 }, /invalid_message:type/);
  await rejects(c, asA, `select set_seller_closure_override($1, '"x"'::jsonb)`, [ids.bizA], /invalid_override/);
  const since = iso(-2 * 3600000);
  const extended = (await set({ type: "close", since, until: iso(21 * 3600000), reason: "power", message: "" })).r.override;
  assert.equal(extended.since, new Date(since).toISOString());
  await bad({ type: "close", since, until: iso(23 * 3600000) }, /closure_too_long/);
  await bad({ type: "close", since: iso(-25 * 3600000), until: iso(3600000) }, /invalid_override:since/);
  const future = (await set({ type: "open", since: iso(600000), until: iso(3600000) })).r.override;
  assert.ok(Date.parse(future.since) <= Date.now() + 1000);
  assert.equal((await set(null)).r.override, null);
  assert.equal((await sql(c, `select override from businesses where id = '${ids.bizA}'`))[0].override, null);
  const audit = await sql(c, `select action from audit_log where business_id = '${ids.bizA}' and action in ('closure_set','closure_cleared')`);
  assert.ok(audit.length >= 2);
});

test("partial closures: set, replace per scope and section, clear, expire, cap", async () => {
  const set = (scope, o) => call(asA, `select set_partial_closure($1, $2, $3::jsonb) as r`, [ids.bizA, scope, o === null ? null : JSON.stringify(o)]);
  const bad = (scope, o, re) => rejects(c, asA, `select set_partial_closure($1, $2, $3::jsonb)`, [ids.bizA, scope, JSON.stringify(o)], re);
  const msg = "Delivery paused until 4 PM";
  let list = (await set("delivery", { until: iso(3600000), message: msg })).r.partial_closures;
  assert.equal(list.length, 1);
  assert.equal(list[0].message, msg);
  assert.equal(list[0].section, null);
  list = (await set("delivery", { until: iso(7200000), message: "Later" })).r.partial_closures;
  assert.equal(list.length, 1);
  assert.equal(list[0].message, "Later");
  list = (await set("section", { section: "Cakes", until: iso(3600000), message: "" })).r.partial_closures;
  list = (await set("section", { section: "Drinks", until: iso(3600000), message: "" })).r.partial_closures;
  assert.deepEqual(list.map((e) => e.section ?? "").sort(), ["", "Cakes", "Drinks"]);
  list = (await set("section", { section: "Cakes" })).r.partial_closures;
  assert.deepEqual(list.map((e) => e.section ?? "").sort(), ["", "Drinks"]);
  list = (await set("delivery", null)).r.partial_closures;
  assert.deepEqual(list.map((e) => e.scope), ["section"]);
  await bad("laundry", { until: iso(3600000) }, /invalid_scope/);
  await bad("section", { until: iso(3600000) }, /invalid_closure:section/);
  await bad("delivery", { until: iso(-1000) }, /closure_in_past/);
  await bad("delivery", { until: iso(7 * 86400000 + 60000) }, /closure_too_long/);
  await bad("delivery", { until: iso(3600000), message: "call 0712345678" }, /invalid_message:phone/);
  await bad("delivery", { until: "soon" }, /invalid_closure:time/);
  await set("walkin", { until: iso(7 * 86400000 - 60000), message: "" });
  await sql(c, `update businesses set partial_closures = $1::jsonb where id = '${ids.bizA}'`, [JSON.stringify([{ scope: "appointments", section: null, until: new Date(Date.now() - 1000).toISOString(), message: "" }])]);
  list = (await set("delivery", { until: iso(3600000), message: "" })).r.partial_closures;
  assert.deepEqual(list.map((e) => e.scope), ["delivery"]);
});
