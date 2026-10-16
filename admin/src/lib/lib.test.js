import test from "node:test";
import assert from "node:assert/strict";
import { parsePeek, withPeek, buildPeek } from "./peek.js";
import { parseQuery, toGroups, flattenGroups } from "./search.js";
import { splitHighlight } from "./highlight.js";
import { addRecent, togglePinned, readList, sanitizeRow } from "./palettePrefs.js";

test("parsePeek accepts known types and rejects the rest", () => {
  assert.deepEqual(parsePeek("business:abc-1"), { type: "business", id: "abc-1" });
  assert.deepEqual(parsePeek("payment:p:1"), { type: "payment", id: "p:1" });
  for (const bad of [null, "", "business", "business:", "nope:1", ":1", `item:${"x".repeat(200)}`]) assert.equal(parsePeek(bad), null);
});

test("withPeek sets and clears without touching other params", () => {
  const set = withPeek(new URLSearchParams("tab=x"), "faq", "9");
  assert.equal(set.get("peek"), "faq:9");
  assert.equal(set.get("tab"), "x");
  assert.equal(withPeek(set, null).has("peek"), false);
});

test("parseQuery reads prefixes and falls back to the chip", () => {
  assert.deepEqual(parseQuery("b: mara", "all"), { scope: "businesses", term: "mara", prefixed: true });
  assert.deepEqual(parseQuery("P:SJK4", "all"), { scope: "payments", term: "SJK4", prefixed: true });
  assert.deepEqual(parseQuery("x: hi", "items"), { scope: "items", term: "x: hi", prefixed: false });
  assert.deepEqual(parseQuery("mara", "items"), { scope: "items", term: "mara", prefixed: false });
});

test("toGroups skips empty scopes and tolerates {}", () => {
  assert.deepEqual(toGroups({}), []);
  const groups = toGroups({ businesses: [{ id: "1", name: "A", seller_id: "ES1", town: "T", phone: "0" }], faqs: [], payments: [{ id: "2", mpesa_code: "X", amount_kes: 100 }] });
  assert.deepEqual(groups.map((g) => g.key), ["businesses", "payments"]);
  assert.deepEqual(flattenGroups(groups).map((r) => r.key), ["business:1", "payment:2"]);
});

test("splitHighlight is case-insensitive and regex-safe", () => {
  assert.deepEqual(splitHighlight("Mara Fresh", "mar"), [{ text: "Mar", match: true }, { text: "a Fresh", match: false }]);
  assert.deepEqual(splitHighlight("a.b (c)", "(c)"), [{ text: "a.b ", match: false }, { text: "(c)", match: true }]);
  assert.deepEqual(splitHighlight("abc", ""), [{ text: "abc", match: false }]);
});

test("recent is capped and de-duplicated, pin toggles", () => {
  const row = (n) => ({ key: `business:${n}`, type: "business", id: String(n), title: `B${n}` });
  let list = [];
  for (let i = 0; i < 9; i += 1) list = addRecent(list, row(i), 6);
  assert.equal(list.length, 6);
  list = addRecent(list, row(5), 6);
  assert.equal(list[0].id, "5");
  assert.equal(list.filter((r) => r.id === "5").length, 1);
  const pinned = togglePinned([], row(1));
  assert.equal(pinned.length, 1);
  assert.equal(togglePinned(pinned, row(1)).length, 0);
});

test("stored rows are sanitised and bad storage is survivable", () => {
  assert.equal(sanitizeRow({ key: "k", type: "t", id: "1", title: "x", evil: "<script>" }).evil, undefined);
  assert.equal(sanitizeRow({ key: "k" }), null);
  assert.deepEqual(readList("k", { getItem: () => "{not json" }), []);
  assert.deepEqual(readList("k", { getItem: () => { throw new Error("blocked"); } }), []);
});

test("buildPeek never exposes sensitive application fields", () => {
  const view = buildPeek("application", { id: "1", reference_no: "EM-1", business_name: "B", owner_full_name: "O", phone: "1", email: "e", status: "submitted", submitted_at: "2026-10-15T06:00:00Z", id_number: "12345678", kra_pin: "A00" });
  const flat = JSON.stringify(view);
  assert.equal(flat.includes("12345678"), false);
  assert.equal(flat.includes("A00"), false);
  assert.equal(buildPeek("business", null), null);
});

// ---- B3: businesses list and detail rules -----------------------------------------------------------------------
import { ACTIONS, actionsFor, bulkActionsFor, validateAction, buildActionCall, countdown, nairobiDay, parseList, listToParams, toCsv, csvCell, healthTone, roleAllows, activeFilterCount } from "./businesses.js";
import { readViews, saveView, deleteView } from "./savedViews.js";

const live = { id: "b1", name: "Mara Fresh Mart", status: "live", featured: false, deleted_at: null };

test("roleAllows: owner always, others only when listed, empty list means owner only", () => {
  assert.equal(roleAllows([], "owner"), true);
  assert.equal(roleAllows([], "reviewer"), false);
  assert.equal(roleAllows(["finance"], "finance"), true);
  assert.equal(roleAllows(["finance"], "support"), false);
});

test("actionsFor follows the business state and marks role problems instead of hiding them", () => {
  const keys = (b, role) => actionsFor(b, role).map((a) => a.key);
  assert.deepEqual(keys(live, "support"), ["suspend", "unlist", "feature", "extend", "verify", "strikes", "delete"]);
  assert.deepEqual(keys({ ...live, status: "suspended" }, "owner"), ["unsuspend", "extend", "verify", "strikes", "delete"]);
  assert.deepEqual(keys({ ...live, status: "paused" }, "owner"), ["suspend", "relist", "feature", "extend", "verify", "strikes", "delete"]);
  assert.deepEqual(keys({ ...live, deleted_at: "2026-10-01T00:00:00Z", status: "deleted" }, "owner"), ["restore"]);
  assert.deepEqual(keys({ ...live, featured: true }, "owner").includes("unfeature"), true);
  const byKey = Object.fromEntries(actionsFor(live, "support").map((a) => [a.key, a]));
  assert.equal(byKey.extend.allowed, false, "support cannot extend");
  assert.equal(byKey.delete.allowed, false, "only the owner deletes");
  assert.equal(byKey.suspend.allowed, true);
});

test("dangerous actions need a reason and the typed business name", () => {
  assert.match(validateAction("suspend", { reason: "", typed: "Mara Fresh Mart" }, live), /reason/i);
  assert.match(validateAction("suspend", { reason: "ab", typed: "Mara Fresh Mart" }, live), /reason/i);
  assert.match(validateAction("suspend", { reason: "fraud suspected", typed: "Mara" }, live), /type the business name/i);
  assert.equal(validateAction("suspend", { reason: "fraud suspected", typed: "  mara   FRESH mart " }, live), null);
  assert.match(validateAction("delete", { reason: "duplicate", typed: "" }, live), /type the business name/i);
  assert.equal(validateAction("relist", {}, live), null, "relist needs no reason");
  assert.match(validateAction("suspend", { reason: "x".repeat(301), typed: live.name }, live), /under 300/);
});

test("action specific validation: days, strikes, verification, feature end date", () => {
  assert.match(validateAction("extend", { reason: "goodwill", days: 0 }, live), /1 to 365/);
  assert.match(validateAction("extend", { reason: "goodwill", days: 2.5 }, live), /whole number/);
  assert.equal(validateAction("extend", { reason: "goodwill", days: 5 }, live), null);
  assert.match(validateAction("strikes", { reason: "reports", delta: 0 }, live), /1 to 3/);
  assert.match(validateAction("strikes", { reason: "reports", delta: 4 }, live), /1 to 3/);
  assert.equal(validateAction("strikes", { reason: "reports", delta: -2 }, live), null);
  assert.match(validateAction("verify", { reason: "checked", level: "gold" }, live), /verification/i);
  assert.match(validateAction("feature", { until: "2020-01-01" }, live), /future/);
  assert.equal(validateAction("feature", { until: new Date(Date.now() + 864e5).toISOString() }, live), null);
});

test("buildActionCall uses the RPC names and argument names the migration defines", () => {
  assert.deepEqual(buildActionCall("suspend", "b1", { reason: " fraud " }), { fn: "admin_suspend_business", args: { p_id: "b1", p_reason: "fraud" } });
  assert.deepEqual(buildActionCall("extend", "b1", { reason: "goodwill", days: "7" }).args, { p_id: "b1", p_days: 7, p_reason: "goodwill" });
  assert.deepEqual(buildActionCall("unfeature", "b1").args, { p_id: "b1", p_featured: false, p_until: null, p_rank: null, p_reason: null });
  assert.equal(buildActionCall("verify", "b1", { reason: "ok good", level: "verified" }).fn, "admin_set_business_verification");
  assert.equal(buildActionCall("strikes", "b1", { reason: "ok good", delta: 1 }).fn, "admin_adjust_business_strikes");
  assert.throws(() => buildActionCall("nope", "b1"), /Unknown/);
  for (const [key, a] of Object.entries(ACTIONS)) assert.match(a.fn, /^admin_[a-z_]+$/, key);
});

test("bulk actions are the intersection of what every selected row allows", () => {
  const rows = [live, { ...live, id: "b2", status: "paused" }];
  const keys = bulkActionsFor(rows, "owner").map((a) => a.key);
  assert.ok(keys.includes("suspend") && keys.includes("feature") && keys.includes("extend"));
  assert.ok(!keys.includes("unlist") && !keys.includes("relist"), "only valid for one of the two states");
  assert.ok(!keys.includes("delete"), "delete is never bulk");
  assert.ok(["tag", "assign", "message", "export"].every((k) => keys.includes(k)));
  assert.deepEqual(bulkActionsFor([], "owner"), []);
  assert.equal(bulkActionsFor([live], "finance").find((a) => a.key === "suspend").allowed, false);
});

test("countdown matches the database: active to the end of the paid day, one grace day, then expired (Nairobi time)", () => {
  const paid = "2026-10-15T21:00:00Z"; // Nairobi midnight starting 16 Oct
  assert.equal(nairobiDay(paid), "2026-10-16");
  const at = (iso) => countdown(paid, new Date(iso));
  assert.deepEqual([at("2026-10-16T08:00:00Z").state, at("2026-10-16T08:00:00Z").daysLeft], ["active", 0]);
  assert.equal(at("2026-10-16T20:59:59Z").state, "active", "still the 16th in Nairobi");
  assert.equal(at("2026-10-16T21:00:00Z").state, "grace", "17th in Nairobi");
  assert.equal(at("2026-10-17T20:59:59Z").state, "grace");
  assert.equal(at("2026-10-17T21:00:00Z").state, "expired", "18th in Nairobi");
  assert.equal(at("2026-10-06T08:00:00Z").daysLeft, 10);
  assert.equal(at("2026-10-06T08:00:00Z").tone, "good");
  assert.equal(at("2026-10-12T08:00:00Z").tone, "warn");
  assert.equal(at("2026-10-14T08:00:00Z").tone, "danger");
  assert.equal(countdown(null).state, "none");
  assert.equal(countdown("garbage").state, "none");
  assert.equal(countdown("2027-10-01T00:00:00Z", new Date("2026-10-16T00:00:00Z")).fraction, 1, "ring is capped at 30 days");
});

test("healthTone thresholds", () => {
  assert.deepEqual([90, 75, 74, 45, 44, 0].map(healthTone), ["good", "good", "warn", "warn", "danger", "danger"]);
  assert.equal(healthTone(NaN), "muted");
});

test("list state round-trips through the URL and rejects junk", () => {
  const list = { tab: "expiring", q: "mara", sort: "paid_until", dir: "desc", page: 3, filters: { plan: "premium", featured: true, minHealth: "40" } };
  assert.deepEqual(parseList(listToParams(list)), list);
  assert.equal(listToParams({ tab: "all", q: "", sort: "name", dir: "asc", page: 1, filters: {} }).toString(), "");
  const junk = parseList(new URLSearchParams("tab=hax&sort=name;drop&dir=sideways&page=-4&f_evil=1"));
  assert.deepEqual(junk, { tab: "all", q: "", sort: "name", dir: "asc", page: 1, filters: {} });
  assert.equal(activeFilterCount({ plan: "premium", town: "", featured: false, agent: "x" }), 2);
});

test("CSV neutralises formulas and quotes awkward cells", () => {
  assert.equal(csvCell('=HYPERLINK("http://evil")'), `"'=HYPERLINK(""http://evil"")"`);
  assert.equal(csvCell("+254712345678"), "'+254712345678");
  assert.equal(csvCell("Mara, Fresh"), '"Mara, Fresh"');
  assert.equal(csvCell(["a", "b"]), "a; b");
  assert.equal(csvCell(null), "");
  const csv = toCsv([{ seller_id: "ES1", name: "=cmd", tags: ["vip"], featured: true }]);
  assert.equal(csv.split("\r\n").length, 2);
  assert.match(csv.split("\r\n")[1], /^ES1,'=cmd,/);
});

test("saved views persist, replace by name, delete, and survive broken or blocked storage", () => {
  const mem = new Map();
  const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.deepEqual(readViews(store), []);
  saveView("Expiring premium", { tab: "expiring", q: "", sort: "paid_until", dir: "asc", page: 4, filters: { plan: "premium" } }, store);
  saveView("Suspended", { tab: "suspended" }, store);
  assert.deepEqual(readViews(store).map((v) => v.name), ["Suspended", "Expiring premium"]);
  assert.equal(readViews(store)[1].list.page, 1, "a saved view always opens on page 1");
  saveView("suspended", { tab: "suspended", q: "x" }, store);
  assert.equal(readViews(store).length, 2, "same name (any case) replaces");
  assert.deepEqual(deleteView("Expiring premium", store).map((v) => v.name), ["suspended"]);
  mem.set("epicmkt-admin-business-views", "{not json");
  assert.deepEqual(readViews(store), []);
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.deepEqual(readViews(blocked), []);
  assert.doesNotThrow(() => saveView("x", {}, blocked));
  mem.clear();
  saveView("keep", {}, store);
  assert.equal(saveView("   ", {}, store).length, 1, "a blank name is ignored");
});
