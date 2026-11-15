import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, ids, asA } from "./db.mjs";
import { addDays } from "../../shared/src/seller/exceptions.js";
import { zonedTimeToUtc } from "../../shared/src/time.js";
import { hoursRowsFor } from "../../shared/src/utils.js";
import { withLiveStatus } from "../../client/src/lib/liveStatus.js";

// A change the seller saves must be what a shopper's page shows. This follows each change the whole way: the seller's save (the same database
// functions the seller app calls), then what a shopper's browser is allowed to read (anon, the public view), then what the client page does with it
// (the same status code the client runs every minute).

let c;
before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_hours_end_to_end" }));
  await seedFixtures(c);
  await sql(c, `update businesses set status = 'live', deleted_at = null, paid_until = now() + interval '30 days'`);
});
after(async () => { await c.end(); });

const setHours = (hours) => tx(c, asA, (k) => sql(k, `select seller_set_hours($1::jsonb)`, [JSON.stringify(hours)]), { commit: true });
const setZone = (zone) => tx(c, asA, (k) => sql(k, `select seller_set_timezone($1)`, [zone]), { commit: true });
const saveException = (date, kind, intervals = [], note = null, { until = null, weekdays = null, id = null } = {}) =>
  tx(c, asA, async (k) => (await sql(k, `select seller_save_exception($1::uuid, $2::date, $3, $4::jsonb, $5, $6::date, $7::jsonb) as r`, [id, date, kind, JSON.stringify(intervals), note, until, weekdays ? JSON.stringify(weekdays) : null]))[0].r, { commit: true });
const clearExceptions = () => sql(c, `update businesses set exceptions = '[]' where id = '${ids.bizA}'`);
const shopToday = async (zone) => (await sql(c, `select shop_day(now(), $1)::text as d`, [zone]))[0].d;

// What a shopper's browser reads, shaped as the client API hands it to the page.
const asShopperSees = async () => {
  const [row] = await tx(c, { role: "anon" }, (k) => sql(k, `select hours, exceptions, timezone from public_businesses where id = '${ids.bizA}'`));
  assert.ok(row, "the shop is visible to shoppers");
  return { hours: row.hours, exceptions: row.exceptions, timezone: row.timezone };
};
const at = (date, hhmm, zone) => {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = hhmm.split(":").map(Number);
  return zonedTimeToUtc({ year, month, day, hour, minute }, zone);
};
const pageAt = (shop, date, hhmm) => withLiveStatus(shop, at(date, hhmm, shop.timezone));
const week = (slot) => Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, slot]));

for (const zone of ["Africa/Nairobi", "Pacific/Auckland", "America/Los_Angeles"]) {
  test(`${zone}: hours, a closed day, special hours, a daily break and a delete each reach the shopper's page`, async () => {
    await setZone(zone);
    await clearExceptions();
    const today = await shopToday(zone);
    const [d1, d2, d3] = [addDays(today, 1), addDays(today, 2), addDays(today, 3)];

    // weekly hours
    await setHours(week(["08:00", "18:00"]));
    let shop = await asShopperSees();
    assert.equal(shop.timezone, zone);
    assert.equal(pageAt(shop, d1, "10:00").isOpen, true);
    assert.equal(pageAt(shop, d1, "19:00").isOpen, false);
    assert.equal(pageAt(shop, d1, "07:59").isOpen, false);

    // a closed day with a note
    await saveException(d1, "closed", [], "Public holiday");
    shop = await asShopperSees();
    const closed = pageAt(shop, d1, "10:00");
    assert.equal(closed.isOpen, false);
    assert.equal(closed.openStatus.reason.kind, "closed_day");
    assert.match(closed.statusLine, /Public holiday/);
    assert.equal(pageAt(shop, d2, "10:00").isOpen, true, "the next day is unaffected");
    const closedRow = hoursRowsFor(shop.hours, shop.exceptions, at(d1, "10:00", zone), zone).find((r) => r.date === d1);
    assert.ok(closedRow, "the hours table has a row for the exception day");

    // special hours replace the weekly hours for that date only
    await saveException(d2, "special", [["10:00", "14:00"]], "Short day");
    shop = await asShopperSees();
    assert.equal(pageAt(shop, d2, "09:00").isOpen, false);
    assert.equal(pageAt(shop, d2, "11:00").isOpen, true);
    assert.equal(pageAt(shop, d2, "11:00").closesAt, "14:00");
    assert.equal(pageAt(shop, d2, "15:00").isOpen, false);
    assert.equal(pageAt(shop, d3, "15:00").isOpen, true, "the day after is back to the weekly hours");

    // a lunch break that repeats every day from d3
    await saveException(d3, "break", [["12:00", "13:00"]], "Lunch", { weekdays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] });
    shop = await asShopperSees();
    const onBreak = pageAt(shop, d3, "12:30");
    assert.equal(onBreak.isOpen, false);
    assert.equal(onBreak.openStatus.reason.kind, "on_break");
    assert.equal(onBreak.opensAt.time, "13:00");
    assert.equal(pageAt(shop, d3, "11:59").isOpen, true);
    assert.equal(pageAt(shop, d3, "13:00").isOpen, true);
    assert.equal(pageAt(shop, addDays(d3, 5), "12:30").isOpen, false, "a repeating break keeps applying on later days");

    // the seller deletes the closed day: it disappears for shoppers and the shop is open again on that date
    const stored = (await sql(c, `select exceptions from businesses where id = '${ids.bizA}'`))[0].exceptions;
    const closedId = stored.find((e) => e.date === d1 && e.kind === "closed").id;
    await tx(c, asA, (k) => sql(k, `select seller_delete_exception($1::uuid)`, [closedId]), { commit: true });
    shop = await asShopperSees();
    assert.equal(shop.exceptions.some((e) => e.id === closedId), false);
    assert.equal(pageAt(shop, d1, "10:00").isOpen, true);

    // the seller changes the weekly hours: shoppers see them at once
    await setHours(week(["09:00", "17:00"]));
    shop = await asShopperSees();
    assert.equal(pageAt(shop, d1, "08:30").isOpen, false);
    assert.equal(pageAt(shop, d1, "16:59").isOpen, true);
    assert.equal(pageAt(shop, d1, "17:00").isOpen, false);
    await clearExceptions();
  });
}

test("a shopper never receives seller-only fields, and the server's open-now filter agrees with the page for the same shop", async () => {
  await setZone("Africa/Nairobi");
  await clearExceptions();
  await setHours(week(["00:00", "23:59"]));
  const today = await shopToday("Africa/Nairobi");
  await saveException(addDays(today, 1), "special", [["10:00", "14:00"]], "Short day");
  const shop = await asShopperSees();
  for (const e of shop.exceptions) assert.deepEqual(Object.keys(e).sort(), ["date", "id", "intervals", "kind", "note"]);
  for (const hhmm of ["09:59", "10:00", "13:59", "14:00", "23:00"]) {
    const instant = at(addDays(today, 1), hhmm, "Africa/Nairobi");
    const server = (await sql(c, `select hours_open_in($1::jsonb, $2::jsonb, $3::timestamptz, $4) as o`, [JSON.stringify(shop.hours), JSON.stringify(shop.exceptions), instant.toISOString(), shop.timezone]))[0].o;
    assert.equal(withLiveStatus(shop, instant).isOpen, server, hhmm);
  }
  await clearExceptions();
});
