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
