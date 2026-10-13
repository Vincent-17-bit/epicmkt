import { test } from "node:test";
import assert from "node:assert/strict";
import * as mock from "./mock.js";

const day = (...iv) => ({ closed: false, open24: false, intervals: iv.map(([start, end]) => ({ start, end })) });
const iso = (ms) => new Date(Date.now() + ms).toISOString();

const signIn = async () => {
  mock.resetMock();
  await mock.login("ES100001", "Demo-Passw0rd");
  return mock.getHours();
};

test("hours endpoints require a session", async () => {
  mock.resetMock();
  await assert.rejects(mock.getHours(), { code: "unauthorized" });
  await assert.rejects(mock.saveHours({ businessId: "x", hours: {}, version: 1 }), { code: "unauthorized" });
});

test("saving bumps the version and a stale version raises CONCURRENCY_CONFLICT", async () => {
  const cur = await signIn();
  assert.equal(cur.hours_version, 1);
  const saved = await mock.saveHours({ businessId: cur.businessId, hours: { ...cur.hours, mon: day(["09:00", "17:00"]) }, version: 1 });
  assert.equal(saved.hours_version, 2);
  await assert.rejects(mock.saveHours({ businessId: cur.businessId, hours: cur.hours, version: 1 }), { code: "CONCURRENCY_CONFLICT" });
  mock.simulateRemoteHoursChange();
  await assert.rejects(mock.saveHours({ businessId: cur.businessId, hours: cur.hours, version: 2 }), { code: "CONCURRENCY_CONFLICT" });
  const reloaded = await mock.getHours();
  assert.equal(reloaded.hours_version, 3);
  assert.equal(reloaded.hours.mon.intervals[0].start, "07:00");
  const again = await mock.saveHours({ businessId: cur.businessId, hours: reloaded.hours, version: reloaded.hours_version });
  assert.equal(again.hours_version, 4);
});

test("undo restores the previous hours using the current version", async () => {
  const cur = await signIn();
  const before = cur.hours;
  const first = await mock.saveHours({ businessId: cur.businessId, hours: { ...before, tue: day(["10:00", "12:00"]) }, version: cur.hours_version });
  const undone = await mock.saveHours({ businessId: cur.businessId, hours: before, version: first.hours_version });
  assert.equal(undone.hours_version, 3);
  assert.deepEqual((await mock.getHours()).hours, before);
});

test("invalid hours and foreign businesses are rejected", async () => {
  const cur = await signIn();
  await assert.rejects(mock.saveHours({ businessId: cur.businessId, hours: { mon: day(["09:00", "13:00"], ["12:00", "15:00"]) }, version: 1 }), { code: "invalid_hours" });
  await assert.rejects(mock.saveHours({ businessId: "other", hours: cur.hours, version: 1 }), { code: "not_a_seller" });
  assert.equal((await mock.getHours()).hours_version, 1);
});

test("exceptions are validated and versioned with the same counter", async () => {
  const cur = await signIn();
  const list = [{ date: "2026-12-25", closed: true, open24: false, intervals: [], note: "Christmas" }];
  const ok = await mock.saveExceptions({ businessId: cur.businessId, exceptions: list, version: 1 });
  assert.equal(ok.hours_version, 2);
  await assert.rejects(mock.saveExceptions({ businessId: cur.businessId, exceptions: list, version: 1 }), { code: "CONCURRENCY_CONFLICT" });
  await assert.rejects(mock.saveExceptions({ businessId: cur.businessId, exceptions: [list[0], list[0]], version: 2 }), { code: "invalid_exceptions" });
  await assert.rejects(mock.saveExceptions({ businessId: cur.businessId, exceptions: [{ date: "2026-02-30", closed: true }], version: 2 }), { code: "invalid_exceptions" });
});

test("closure override enforces the message rules and the 24 hour limit", async () => {
  const cur = await signIn();
  const b = cur.businessId;
  const good = { type: "close", until: iso(3600000), reason: "lunch", message: "Back soon" };
  assert.equal((await mock.setClosureOverride({ businessId: b, override: good })).override.message, "Back soon");
  await assert.rejects(mock.setClosureOverride({ businessId: b, override: { ...good, message: "see https://x.com" } }), { code: "invalid_message", message: "invalid_message:link" });
  await assert.rejects(mock.setClosureOverride({ businessId: b, override: { ...good, message: "a@b.co" } }), { message: "invalid_message:email" });
  await assert.rejects(mock.setClosureOverride({ businessId: b, override: { ...good, message: "0712 345 678" } }), { message: "invalid_message:phone" });
  await assert.rejects(mock.setClosureOverride({ businessId: b, override: { ...good, message: "y".repeat(81) } }), { message: "invalid_message:too_long" });
  await assert.rejects(mock.setClosureOverride({ businessId: b, override: { ...good, until: iso(25 * 3600000) } }), { code: "closure_too_long" });
  await assert.rejects(mock.setClosureOverride({ businessId: b, override: { ...good, until: iso(-1000) } }), { code: "closure_in_past" });
  assert.equal((await mock.setClosureOverride({ businessId: b, override: null })).override, null);
  assert.equal((await mock.getHours()).override, null);
});

test("partial closures replace per scope, clear, and expire", async () => {
  const cur = await signIn();
  const b = cur.businessId;
  let r = await mock.setPartialClosure({ businessId: b, scope: "delivery", closure: { until: iso(3600000), message: "Delivery paused until 4 PM" } });
  assert.equal(r.partial_closures.length, 1);
  r = await mock.setPartialClosure({ businessId: b, scope: "section", closure: { section: "Cakes", until: iso(3600000), message: "" } });
  assert.equal(r.partial_closures.length, 2);
  r = await mock.setPartialClosure({ businessId: b, scope: "section", closure: { section: "Cakes" } });
  assert.deepEqual(r.partial_closures.map((p) => p.scope), ["delivery"]);
  await assert.rejects(mock.setPartialClosure({ businessId: b, scope: "section", closure: { until: iso(3600000) } }), { code: "invalid_closure" });
  await assert.rejects(mock.setPartialClosure({ businessId: b, scope: "delivery", closure: { until: iso(8 * 86400000) } }), { code: "closure_too_long" });
  await assert.rejects(mock.setPartialClosure({ businessId: b, scope: "nope", closure: null }), { code: "invalid_scope" });
  r = await mock.setPartialClosure({ businessId: b, scope: "delivery", closure: null });
  assert.equal(r.partial_closures.length, 0);
});

test("settings expose defaults and sections", async () => {
  await signIn();
  const s = await mock.getHoursSettings();
  assert.equal(s.hours_defaults.partial_message, "Delivery paused until {time}");
  assert.deepEqual(s.sections, ["Cakes", "Drinks", "Snacks"]);
});
