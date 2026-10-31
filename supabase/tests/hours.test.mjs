import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB, asAdmin } from "./db.mjs";
import { validateWeeklyHours } from "../../shared/src/seller/hours.js";

let c;
before(async () => {
  c = await connect(await createDatabase());
  await seedFixtures(c);
});
after(async () => { await c.end(); });

const set = (who, hours) =>
  tx(c, who, async (k) => (await sql(k, `select seller_set_hours($1::jsonb) as r`, [JSON.stringify(hours)]))[0].r, { commit: true });
const stored = async (biz = ids.bizA) => (await sql(c, `select hours from businesses where id = '${biz}'`))[0].hours;
const reset = () => sql(c, `update businesses set hours = '{}', status = 'live'`);

test("a seller saves valid hours; closed days are dropped and the result is returned", async () => {
  await reset();
  const out = await set(asA, { mon: ["08:00", "18:00"], tue: null, sat: ["09:00", "13:00"], sun: ["20:00", "02:00"] });
  assert.deepEqual(out, { mon: ["08:00", "18:00"], sat: ["09:00", "13:00"], sun: ["20:00", "02:00"] }, "overnight is allowed");
  assert.deepEqual(await stored(), out);
  assert.deepEqual(await stored(ids.bizB), {}, "another business is untouched");
  const seen = await tx(c, asA, (k) => sql(k, `select hours from businesses`));
  assert.deepEqual(seen[0].hours, out, "the seller reads their own hours");
});

test("saving again replaces the week, and an empty object closes every day", async () => {
  await reset();
  await set(asA, { mon: ["08:00", "18:00"], fri: ["08:00", "18:00"] });
  assert.deepEqual(await set(asA, { fri: ["10:00", "12:00"] }), { fri: ["10:00", "12:00"] });
  assert.deepEqual(await set(asA, {}), {});
  assert.deepEqual(await stored(), {});
});

test("a full day is stored as 00:00 to 23:59", async () => {
  await reset();
  assert.deepEqual(await set(asA, { mon: ["00:00", "23:59"] }), { mon: ["00:00", "23:59"] });
});

test("bad times are refused and nothing is saved", async () => {
  await reset();
  await set(asA, { mon: ["08:00", "18:00"] });
  const bad = [
    [{ mon: ["25:00", "18:00"] }, /invalid_time/],
    [{ mon: ["08:00", "18:60"] }, /invalid_time/],
    [{ mon: ["8:00", "18:00"] }, /invalid_time/],
    [{ mon: ["08:00", "18:00:00"] }, /invalid_time/],
    [{ mon: ["08:00", ""] }, /invalid_time/],
    [{ mon: [800, 1800] }, /invalid_time/],
    [{ mon: ["08:00", null] }, /invalid_time/],
    [{ mon: ["09:00", "09:00"] }, /zero_length/],
    [{ mon: ["08:00"] }, /invalid_interval/],
    [{ mon: ["08:00", "12:00", "14:00"] }, /invalid_interval/],
    [{ mon: "08:00-18:00" }, /invalid_interval/],
    [{ mon: { open: "08:00" } }, /invalid_interval/],
  ];
  for (const [hours, re] of bad) await rejects(c, asA, `select seller_set_hours($1::jsonb)`, [JSON.stringify(hours)], re);
  assert.deepEqual(await stored(), { mon: ["08:00", "18:00"] });
});

test("bad day keys and non-object values are refused", async () => {
  await reset();
  for (const hours of [{ monday: ["08:00", "18:00"] }, { Mon: ["08:00", "18:00"] }, { mon: ["08:00", "18:00"], xyz: null }, { "": null }]) {
    await rejects(c, asA, `select seller_set_hours($1::jsonb)`, [JSON.stringify(hours)], /unknown_day/);
  }
  for (const value of [[], [["08:00", "18:00"]], "mon", 5, true, null]) {
    await rejects(c, asA, `select seller_set_hours($1::jsonb)`, [JSON.stringify(value)], /invalid_hours/);
  }
  await rejects(c, asA, `select seller_set_hours(null)`, [], /invalid_hours/);
  assert.deepEqual(await stored(), {});
});

test("only a seller can call it: anon is refused, and a user without a business is not a seller", async () => {
  await reset();
  await rejects(c, { role: "anon" }, `select seller_set_hours('{}'::jsonb)`, [], /permission denied/);
  await rejects(c, asAdmin, `select seller_set_hours('{"mon":["08:00","18:00"]}'::jsonb)`, [], /not_a_seller/);
  assert.deepEqual(await stored(), {});
  assert.equal((await tx(c, asA, (k) => k.query(`update businesses set hours = '{"mon":["01:00","02:00"]}'`))).rowCount, 0, "sellers still cannot write the column directly");
  await rejects(c, asA, `select seller_update_profile($1::jsonb)`, [JSON.stringify({ hours: {} })], /field_not_allowed/);
});

test("works for paused and expired sellers, but a suspended seller is locked out", async () => {
  for (const status of ["paused", "expired"]) {
    await reset();
    await sql(c, `update businesses set status = '${status}' where id = '${ids.bizA}'`);
    assert.deepEqual(await set(asA, { mon: ["08:00", "18:00"] }), { mon: ["08:00", "18:00"] }, status);
  }
  await reset();
  await sql(c, `update businesses set status = 'suspended' where id = '${ids.bizA}'`);
  await rejects(c, asA, `select seller_set_hours('{"mon":["08:00","18:00"]}'::jsonb)`, [], /account_suspended/);
  assert.deepEqual(await stored(), {});
  await sql(c, `update businesses set status = 'live' where id = '${ids.bizA}'`);
});

test("each save is audited with the open days", async () => {
  await reset();
  await sql(c, `truncate audit_log`);
  await set(asA, { wed: ["08:00", "12:00"], mon: ["08:00", "18:00"] });
  await rejects(c, asA, `select seller_set_hours('{"mon":["09:00","09:00"]}'::jsonb)`, [], /zero_length/);
  const rows = await sql(c, `select action, entity, data from audit_log where business_id = '${ids.bizA}' order by id`);
  assert.equal(rows.length, 1, "a refused save writes nothing");
  assert.equal(rows[0].action, "hours_updated");
  assert.equal(rows[0].entity, "business");
  assert.deepEqual(rows[0].data, { open_days: ["mon", "wed"] });
});

test("SQL and the shared JS validator agree", async () => {
  const slots = [
    ["08:00", "18:00"], ["20:00", "02:00"], ["00:00", "23:59"], ["09:00", "09:00"], ["24:00", "25:00"], ["8:00", "18:00"],
    ["08:00", "18:60"], ["08:00"], ["08:00", "12:00", "14:00"], [800, 1800], ["08:00", null], null, "08:00-18:00", {}, true,
  ];
  const wholes = [[], "x", 5, null, true];
  let n = 0;
  for (const slot of slots) {
    for (const hours of [{ mon: slot }, { sun: slot, tue: ["08:00", "18:00"] }, { mon: ["08:00", "18:00"], xyz: slot }]) {
      const js = validateWeeklyHours(hours);
      let sqlError = null;
      try {
        await tx(c, asA, (k) => sql(k, `select seller_set_hours($1::jsonb)`, [JSON.stringify(hours)]));
      } catch (e) {
        sqlError = e.message;
      }
      assert.equal(js.ok, sqlError === null, JSON.stringify({ hours, sqlError, js }));
      if (!js.ok) assert.equal(sqlError, js.errors[0].error, JSON.stringify({ hours }));
      n += 1;
    }
  }
  for (const whole of wholes) {
    const js = validateWeeklyHours(whole);
    const err = await rejects(c, asA, `select seller_set_hours($1::jsonb)`, [JSON.stringify(whole)], /invalid_hours/);
    assert.equal(js.ok, false);
    assert.equal(err.message, js.errors[0].error);
    n += 1;
  }
  assert.ok(n > 40);
});
