import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SIZE, defaultSort, filterOps, fromParams, hasFilters, normalizeQuery, orderOps, pageRange, phoneTail, quoteValue, runQuery, searchFilter, toParams, viewState,
} from "./queueQuery.js";

const NOW = new Date("2026-10-15T12:00:00Z");
const ago = (h) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const ME = "00000000-0000-4000-8000-00000000000a";
const OTHER = "00000000-0000-4000-8000-00000000000b";

test("defaults: the Submitted tab, oldest first, 50 a page", () => {
  assert.deepEqual(normalizeQuery(), { status: "submitted", q: "", category: "", plan: "", assignee: "any", sla: "", sort: "submitted_at", dir: "asc", page: 1, size: DEFAULT_SIZE });
});

test("finished tabs default to newest first; work tabs to oldest first", () => {
  assert.equal(defaultSort("activated").dir, "desc");
  assert.equal(defaultSort("all").dir, "desc");
  assert.equal(defaultSort("under_review").dir, "asc");
  assert.equal(normalizeQuery({ status: "rejected" }).dir, "desc");
});

test("anything in a URL is cleaned: unknown values fall back, never throw", () => {
  const q = normalizeQuery({ status: "drop table", sort: "owner_id_number", dir: "sideways", page: "-4", size: "9999", plan: "gold", assignee: "somebody", sla: "late", category: "bar!ber" });
  assert.deepEqual([q.status, q.sort, q.dir, q.page, q.size, q.plan, q.assignee, q.sla, q.category], ["submitted", "submitted_at", "asc", 1, 50, "", "any", "", "barber"]);
  assert.equal(normalizeQuery({ page: "3.9" }).page, 3);
  assert.equal(normalizeQuery({ q: `   a   ${"x".repeat(200)}` }).q.length, 80);
  assert.equal(normalizeQuery({ assignee: ME }).assignee, ME);
  assert.equal(normalizeQuery(null).status, "submitted");
});

test("a direction without a known sort column is ignored", () => {
  assert.equal(normalizeQuery({ dir: "desc" }).dir, "asc");
  assert.equal(normalizeQuery({ sort: "business_name", dir: "desc" }).dir, "desc");
});

test("the SLA filter only applies on Submitted and All", () => {
  assert.equal(normalizeQuery({ status: "submitted", sla: "breached" }).sla, "breached");
  assert.equal(normalizeQuery({ status: "all", sla: "soon" }).sla, "soon");
  assert.equal(normalizeQuery({ status: "activated", sla: "breached" }).sla, "");
});

test("URL round trip leaves out defaults and survives a trip", () => {
  assert.equal(toParams({}).toString(), "");
  const q = normalizeQuery({ status: "under_review", q: "mara", category: "barber", plan: "premium", assignee: "me", sort: "business_name", dir: "desc", page: 3, size: 100 });
  const text = toParams(q).toString();
  assert.equal(text, "status=under_review&q=mara&category=barber&plan=premium&assignee=me&sort=business_name&dir=desc&page=3&size=100");
  assert.deepEqual(fromParams(new URLSearchParams(text)), q);
  // the default sort for a tab is not written, even when it differs between tabs
  assert.equal(toParams({ status: "activated" }).toString(), "status=activated");
  assert.equal(toParams({ status: "activated", sort: "submitted_at", dir: "asc" }).toString(), "status=activated&sort=submitted_at&dir=asc");
});

test("saved views remember the filters and sort, not the page or the search text", () => {
  const v = viewState(normalizeQuery({ q: "mara", page: 4, plan: "premium", sort: "business_name", dir: "desc" }));
  assert.deepEqual(Object.keys(v).sort(), ["assignee", "category", "dir", "plan", "size", "sla", "sort", "status"]);
  assert.equal("q" in v, false);
  assert.equal("page" in v, false);
});

test("hasFilters ignores the tab and the sort", () => {
  assert.equal(hasFilters(normalizeQuery({ status: "under_review", sort: "business_name" })), false);
  assert.equal(hasFilters(normalizeQuery({ q: "x" })), true);
  assert.equal(hasFilters(normalizeQuery({ assignee: "none" })), true);
});

test("search: wildcards are literal, quotes are escaped, and all five fields are searched", () => {
  assert.equal(searchFilter("   "), "");
  const f = searchFilter(`100% "pure"_x`);
  assert.ok(f.startsWith(`business_name.ilike."%100\\\\% \\"pure\\"\\\\_x%"`), f);
  for (const field of ["business_name", "reference_no", "owner_full_name", "phone", "email"]) assert.ok(f.includes(`${field}.ilike.`), field);
  // commas and brackets inside the term cannot break out of the filter
  const evil = searchFilter(`a),owner_id_number.neq.x,(b`);
  assert.equal(evil.split(",owner_full_name").length, 2);
  assert.ok(evil.includes(`"%a),owner\\\\_id\\\\_number.neq.x,(b%"`)); // inside quotes, with the underscores escaped as LIKE literals
  assert.equal(evil.includes(",owner_id_number.neq"), false);
  assert.equal(quoteValue(`a"b\\c`), `"a\\"b\\\\c"`);
});

test("search: Kenyan phone formats all find the same number", () => {
  assert.equal(phoneTail("0700 000 001"), "700000001");
  assert.equal(phoneTail("+254 700 000 001"), "700000001");
  assert.equal(phoneTail("254700000001"), "700000001");
  assert.equal(phoneTail("12345"), ""); // too short to mean a phone
  assert.equal(phoneTail("shop 700000001"), ""); // text, so not a phone search
  assert.ok(searchFilter("0700 000 001").includes(`phone.ilike."%700000001%"`));
});

test("filterOps: tab, filters, assignee and SLA in a fixed order", () => {
  assert.deepEqual(filterOps({ status: "under_review" }), [["eq", "status", "under_review"]]);
  assert.deepEqual(filterOps({ status: "all" })[0], ["in", "status", ["submitted", "under_review", "changes_requested", "approved", "payment_confirming", "activated", "rejected"]]);
  assert.deepEqual(filterOps({ category: "barber", plan: "premium", assignee: "none" }), [["eq", "status", "submitted"], ["eq", "category_id", "barber"], ["eq", "plan_key", "premium"], ["is", "reviewer_id", null]]);
  assert.deepEqual(filterOps({ assignee: "me" }, { me: ME })[1], ["eq", "reviewer_id", ME]);
  assert.deepEqual(filterOps({ assignee: OTHER })[1], ["eq", "reviewer_id", OTHER]);
  assert.deepEqual(filterOps({ sla: "breached" }, { now: NOW }).slice(1), [["eq", "status", "submitted"], ["lt", "submitted_at", ago(24)]]);
  assert.deepEqual(filterOps({ sla: "soon" }, { now: NOW }).slice(2), [["gte", "submitted_at", ago(24)], ["lt", "submitted_at", ago(18)]]);
  assert.deepEqual(filterOps({ sla: "ok" }, { now: NOW }).slice(2), [["gte", "submitted_at", ago(18)]]);
});

test("filterOps for tab counts: skip the tab and the SLA", () => {
  assert.deepEqual(filterOps({ plan: "premium", sla: "breached" }, { skip: ["status", "sla"] }), [["eq", "plan_key", "premium"]]);
});

test("order and range: ties break on id, pages are inclusive", () => {
  assert.deepEqual(orderOps({ sort: "business_name", dir: "desc" }), [["business_name", { ascending: false, nullsFirst: false }], ["id", { ascending: true }]]);
  assert.deepEqual(pageRange({ page: 1, size: 25 }), [0, 24]);
  assert.deepEqual(pageRange({ page: 3, size: 50 }), [100, 149]);
});

// ---- the in-memory engine -------------------------------------------------------------------------------------

const rows = [
  { id: "1", status: "submitted", business_name: "Zuri Studio", reference_no: "EPM-2026-0001", owner_full_name: "Amani Zuri", phone: "+254700000001", email: "z@x.co", category_id: "barber", plan_key: "standard", reviewer_id: null, submitted_at: ago(30), price_at_submission: 500 },
  { id: "2", status: "submitted", business_name: "mara fresh", reference_no: "EPM-2026-0002", owner_full_name: "Joy Mara", phone: "+254711000002", email: "m@x.co", category_id: "grocer", plan_key: "premium", reviewer_id: ME, submitted_at: ago(20), price_at_submission: 1500 },
  { id: "3", status: "submitted", business_name: "Alpha 100% Gym", reference_no: "EPM-2026-0003", owner_full_name: "Ben Alpha", phone: "+254722000003", email: "a@x.co", category_id: "gym", plan_key: "standard", reviewer_id: OTHER, submitted_at: ago(2), price_at_submission: 500 },
  { id: "4", status: "under_review", business_name: "Karibu Corner", reference_no: "EPM-2026-0004", owner_full_name: "Kim Karibu", phone: "+254733000004", email: "k@x.co", category_id: "barber", plan_key: "premium", reviewer_id: ME, submitted_at: ago(50), price_at_submission: 1500 },
  { id: "5", status: "activated", business_name: "Old Shop", reference_no: "EPM-2026-0005", owner_full_name: "Old Timer", phone: "+254744000005", email: "o@x.co", category_id: "barber", plan_key: "standard", reviewer_id: ME, submitted_at: ago(500), price_at_submission: 500 },
  { id: "6", status: "uploading", business_name: "Draft Only", reference_no: "EPM-2026-0006", owner_full_name: "Dee Draft", phone: "+254755000006", email: "d@x.co", category_id: "barber", plan_key: "standard", reviewer_id: null, submitted_at: null, price_at_submission: 500 },
  { id: "7", status: "submitted", business_name: "No Date Co", reference_no: "EPM-2026-0007", owner_full_name: "Nia Date", phone: "+254766000007", email: "n@x.co", category_id: "gym", plan_key: "standard", reviewer_id: null, submitted_at: null, price_at_submission: 500 },
];
const ids = (r) => r.rows.map((x) => x.id);
const run = (q, o = {}) => runQuery(rows, q, { now: NOW, me: ME, ...o });

test("engine: tabs, drafts never show, All includes every real status", () => {
  assert.deepEqual(ids(run({})), ["1", "2", "3", "7"].filter((x) => x !== "7").concat("7")); // oldest first, undated last
  assert.deepEqual(ids(run({ status: "under_review" })), ["4"]);
  assert.deepEqual(ids(run({ status: "all" })).sort(), ["1", "2", "3", "4", "5", "7"]);
  assert.equal(run({ status: "all" }).rows.some((r) => r.status === "uploading"), false);
});

test("engine: assignee, category, plan and SLA filters", () => {
  assert.deepEqual(ids(run({ assignee: "me" })), ["2"]);
  assert.deepEqual(ids(run({ assignee: "none" })).sort(), ["1", "7"]);
  assert.deepEqual(ids(run({ assignee: OTHER })), ["3"]);
  assert.deepEqual(ids(run({ category: "gym" })).sort(), ["3", "7"]);
  assert.deepEqual(ids(run({ plan: "premium" })), ["2"]);
  assert.deepEqual(ids(run({ sla: "breached" })), ["1"]);
  assert.deepEqual(ids(run({ sla: "soon" })), ["2"]);
  assert.deepEqual(ids(run({ sla: "ok" })), ["3"]);
  assert.deepEqual(ids(run({ status: "all", sla: "breached" })), ["1"]);
});

test("engine: search is case-insensitive over name, reference, owner, phone and email", () => {
  assert.deepEqual(ids(run({ q: "MARA" })), ["2"]); // business name and owner both say mara
  assert.deepEqual(ids(run({ q: "epm-2026-0003" })), ["3"]);
  assert.deepEqual(ids(run({ q: "ben" })), ["3"]);
  assert.deepEqual(ids(run({ q: "z@x" })), ["1"]);
  assert.deepEqual(ids(run({ q: "0711 000 002" })), ["2"]); // local format finds +254 number
  assert.deepEqual(ids(run({ q: "100%" })), ["3"]);
  assert.deepEqual(ids(run({ q: "nothing like this" })), []);
});

test("engine: sorting, direction, ties and missing values", () => {
  assert.deepEqual(ids(run({ sort: "submitted_at", dir: "desc" })), ["3", "2", "1", "7"]); // undated always last
  assert.deepEqual(ids(run({ sort: "business_name", dir: "asc" })), ["3", "2", "7", "1"]); // case-insensitive: Alpha, mara, No Date, Zuri
  assert.deepEqual(ids(run({ sort: "price_at_submission", dir: "desc" })), ["2", "1", "3", "7"]); // 1500 first; the 500s tie, so id order
  assert.deepEqual(ids(run({ sort: "plan_key", dir: "asc" })), ["2", "1", "3", "7"]); // premium before standard
});

test("engine: pagination returns the page and the full total", () => {
  const many = Array.from({ length: 130 }, (_, i) => ({ ...rows[0], id: String(1000 + i), submitted_at: ago(100 - i * 0.1) }));
  const page2 = runQuery(many, { size: 50, page: 2 }, { now: NOW });
  assert.equal(page2.total, 130);
  assert.equal(page2.rows.length, 50);
  assert.equal(page2.rows[0].id, "1050");
  assert.equal(runQuery(many, { size: 50, page: 3 }, { now: NOW }).rows.length, 30);
  assert.equal(runQuery(many, { size: 50, page: 9 }, { now: NOW }).rows.length, 0);
  assert.equal(runQuery(many, { size: 25 }, { now: NOW, paginate: false }).rows.length, 130);
});

test("engine: tab counts skip the tab and the SLA but keep search and the other filters", () => {
  const count = (tab, q) => runQuery(rows, { ...q, status: tab }, { now: NOW, me: ME, skip: ["sla"] }).total;
  assert.equal(count("submitted", { q: "mara" }), 1);
  assert.equal(count("submitted", { sla: "breached" }), 4); // the SLA filter does not shrink the tab number
});
