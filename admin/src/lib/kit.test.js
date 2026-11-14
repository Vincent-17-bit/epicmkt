import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PRODUCT_TYPES, TYPE_DEPARTMENTS } from "@epicmkt/shared";
import { KIT_FORMAT, applyPlan, buildKit, cloneType, diffKit, freeTypeId, kitCounts, kitFileName, kitText, parseKit, planImport, slugify } from "./kit.js";
import * as typesApi from "../api/mockProductTypes.js";
import * as specApi from "../api/mockSpecRules.js";
import * as chartApi from "../api/mockSizeCharts.js";
import * as valuesApi from "../api/mockValues.js";

const api = { saveTypeSettings: typesApi.saveTypeSettings, saveSpecRows: specApi.saveSpecRows, saveSizeChart: chartApi.saveSizeChart, importOptionValue: valuesApi.importOptionValue };

// what an environment holds, read the way the pages read it
async function snapshot() {
  const ts = await typesApi.listTypeSettings();
  const approved = [];
  for (let offset = 0; ; offset += 200) {
    const page = await valuesApi.listOptionValues({ status: "approved", limit: 200, offset });
    approved.push(...page.values);
    if (approved.length >= page.total) break;
  }
  return { types: ts.types, departments: ts.departments, categories: ts.categories, specTypes: await specApi.listSpecTypes(), sizeCharts: await chartApi.listSizeCharts(), values: approved };
}
const EMPTY = { types: [], departments: [], categories: [], specTypes: [], sizeCharts: [], values: [] };
// the category whose kit has the most in it, so the tests exercise charts and spec rules and not just an empty list
const anyCategory = (types, env = null) => {
  const ids = [...new Set(types.flatMap((t) => t.categoryIds ?? []))];
  if (!env) return ids[0];
  const size = (id) => { const k = buildKit({ category: { id, name: id }, types: env.types, specTypes: env.specTypes, sizeCharts: env.sizeCharts, values: null }); return k.sizeCharts.length * 100 + k.types.reduce((n, t) => n + t.specRows.length, 0) + k.types.length; };
  return ids.sort((a, b) => size(b) - size(a) || a.localeCompare(b))[0];
};
const kitFor = (env, category, withValues = true) => buildKit({ category: { id: category, name: category }, types: env.types, specTypes: env.specTypes, sizeCharts: env.sizeCharts, values: withValues ? env.values : null });

beforeEach(async () => {
  typesApi.resetMockProductTypes(); specApi.resetMockSpecRules(); chartApi.resetMockSizeCharts(); valuesApi.resetMockValues();
  // the demo data assigns no chart to a type; give one chart two types so the kits carry a size chart
  const [chart] = await chartApi.listSizeCharts();
  await chartApi.saveSizeChart(chart.id, { name: chart.name, category: chart.category, unit: chart.unit, columns: chart.columns, rows: chart.rows, product_type_ids: ["shoes-eu", "fragrance"] });
});

test("export collects the types a category sells with their options and spec rules, and the size charts and values that go with them", async () => {
  const env = await snapshot();
  const category = anyCategory(env.types, env);
  const kit = kitFor(env, category);
  assert.equal(kit.format, KIT_FORMAT);
  assert.ok(kit.types.length >= 1);
  assert.ok(kit.types.every((t) => t.categoryIds.includes(category)));
  assert.deepEqual(kit.types.map((t) => t.id), [...kit.types.map((t) => t.id)].sort(), "sorted by id");
  const withRows = kit.types.find((t) => t.specRows.length);
  assert.ok(withRows, "a type with spec rows exports them");
  assert.ok(kit.sizeCharts.every((c) => c.typeIds.every((id) => kit.types.some((t) => t.id === id))), "a chart lists only the kit's own types");
  assert.ok(kit.values.every((v) => ["material", "color", "brand", "finish", "flavour"].includes(v.kind)));
  assert.ok(!kit.values.some((v) => v.label === "Mahogany veneer"), "pending values are not exported");
  assert.equal(kitFileName(kit), `kit-${category}.json`);
  assert.equal(kitCounts(kit).types, kit.types.length);
  assert.equal("values" in kitFor(env, category, false), false, "values can be left out");
});

test("export, then import into an empty environment, then export again gives the same kit", async () => {
  const env = await snapshot();
  const category = anyCategory(env.types, env);
  const kit = kitFor(env, category);
  assert.ok(kit.sizeCharts.length >= 1 && kit.types.some((t) => t.specRows.length) && kit.values.length >= 1, "the kit under test has a chart, spec rules and values");
  const parsed = parseKit(kitText(kit));
  assert.equal(parsed.ok, true, parsed.errors?.join(" "));

  // a second, empty environment, with the same behaviour as the mocks: here we reset them and clear what the kit would add
  const target = { types: [], specTypes: [], sizeCharts: [], values: [], departments: TYPE_DEPARTMENTS, categories: [...new Set(kit.types.flatMap((t) => t.categoryIds))].map((id) => ({ id, name: id })) };
  const diff = diffKit(parsed.kit, target);
  assert.equal(diff.counts.same, 0);
  assert.equal(diff.counts.add, diff.entries.length, "everything is new there");
  const plan = planImport(diff);
  const order = plan.map((p) => p.op);
  assert.ok(order.lastIndexOf("saveTypeSettings") < order.indexOf("saveSizeChart") || !order.includes("saveSizeChart"), "types before charts");
  assert.ok(order.indexOf("saveSizeChart") < order.indexOf("importOptionValue") || !order.includes("importOptionValue"), "values last");

  const store = { types: new Map(), rows: new Map(), charts: [], values: new Map() };
  const fake = {
    saveTypeSettings: async (id, input) => { store.types.set(id, { id, kind: "good", ...input, items: 0 }); },
    saveSpecRows: async (id, rows) => { store.rows.set(id, rows); },
    saveSizeChart: async (id, fields) => { store.charts.push({ id: `c${store.charts.length}`, ...fields }); },
    importOptionValue: async (kind, label, fields) => { store.values.set(`${kind}|${label}`, { kind, label, status: "approved", hex: fields?.hex ?? null, tags: fields?.tags ?? [] }); }
  };
  const result = await applyPlan(plan, fake);
  assert.equal(result.ok, true);
  assert.equal(result.applied, plan.length);

  const after = {
    types: [...store.types.values()],
    specTypes: [...store.rows].map(([id, specRows]) => ({ id, specRows })),
    sizeCharts: store.charts.map((c) => ({ ...c })),
    values: [...store.values.values()]
  };
  assert.deepEqual(kitFor(after, category), kit);
});

test("importing a kit into the environment it came from changes nothing: the preview is all 'same' and the plan is empty", async () => {
  const env = await snapshot();
  const kit = kitFor(env, anyCategory(env.types, env));
  const diff = diffKit(kit, env);
  assert.equal(diff.counts.add + diff.counts.change, 0, JSON.stringify(diff.entries.filter((e) => e.action !== "same").map((e) => [e.key, e.changes])));
  assert.equal(diff.empty, true);
  assert.deepEqual(planImport(diff), []);
});

test("the preview says what would change, entry by entry", async () => {
  const env = await snapshot();
  const kit = kitFor(env, anyCategory(env.types, env));
  const t = structuredClone(kit);
  t.types[0].name = "Renamed in the kit";
  t.types[0].active = false;
  t.types[0].axes = [{ key: "pack", label: "Pack", display: "button" }];
  t.types[0].specRows = [{ key: "origin", label: "Origin", level: "required", input: "text" }];
  const diff = diffKit(t, env);
  const type = diff.entries.find((e) => e.entity === "type" && e.key === t.types[0].id);
  assert.equal(type.action, "change");
  assert.ok(type.changes.some((c) => c.startsWith("name:")));
  assert.ok(type.changes.includes("options"));
  assert.ok(type.changes.includes("switched off"));
  const rows = diff.entries.find((e) => e.entity === "specRows" && e.key === t.types[0].id);
  assert.equal(rows.action, "change");
  assert.match(rows.changes[0], /to 1 rows$/);
  assert.equal(diff.counts.change >= 2, true);
  const plan = planImport(diff);
  assert.deepEqual(plan.map((p) => p.op), ["saveTypeSettings", "saveSpecRows"]);
});

test("a type that already sells in other categories keeps them: an import adds categories, never removes one", async () => {
  const env = await snapshot();
  const category = anyCategory(env.types, env);
  const kit = kitFor(env, category);
  const wide = structuredClone(env);
  const mine = wide.types.find((x) => x.id === kit.types[0].id);
  mine.categoryIds = [...mine.categoryIds, "home-extra"];
  const t = structuredClone(kit);
  t.types[0].categoryIds = [category];
  const entry = diffKit(t, wide).entries.find((e) => e.entity === "type" && e.key === mine.id);
  assert.equal(entry.action, "same");
  assert.ok(entry.next.categoryIds.includes("home-extra"));
  const less = structuredClone(wide);
  less.types.find((x) => x.id === mine.id).categoryIds = [];
  assert.deepEqual(diffKit(t, less).entries.find((e) => e.entity === "type" && e.key === mine.id).changes, ["more categories"]);
});

test("a chart the kit shares with types outside the kit keeps those types: an import adds to a chart's types, never releases one", async () => {
  const env = await snapshot();
  const category = anyCategory(env.types, env);
  const kit = kitFor(env, category);
  const chart = kit.sizeCharts[0];
  const wide = structuredClone(env);
  const live = wide.sizeCharts.find((c) => c.name === chart.name);
  live.product_type_ids = [...live.product_type_ids, "table"];
  const t = structuredClone(kit);
  t.sizeCharts[0].typeIds = [chart.typeIds[0]];
  const entry = diffKit(t, wide).entries.find((e) => e.entity === "sizeChart" && e.label === chart.name);
  assert.equal(entry.action, "same", "the kit adds nothing the chart does not already have");
  assert.ok(entry.fields.product_type_ids.includes("table"), "'table' is kept");
  const fewer = structuredClone(wide);
  fewer.sizeCharts.find((c) => c.name === chart.name).product_type_ids = [];
  const more = diffKit(t, fewer).entries.find((e) => e.entity === "sizeChart" && e.label === chart.name);
  assert.equal(more.action, "change");
  assert.deepEqual(more.changes, ["more types it applies to"]);
});

test("things this environment does not have are left out and said so: unknown categories, a missing department, types a chart points at", async () => {
  const env = await snapshot();
  const kit = kitFor(env, anyCategory(env.types, env));
  const t = structuredClone(kit);
  t.types = [{ id: "brand-new", name: "Brand new", kind: "good", departmentId: "no-such-department", categoryIds: ["alpha-category", "beta-category"], axes: [], specRows: [], active: true }];
  t.sizeCharts = [{ ...kit.sizeCharts[0] ?? { name: "Chart", category: null, unit: "cm", columns: ["Size"], rows: [["S"]], active: true }, typeIds: ["brand-new", "ghost-type"] }];
  const target = { ...EMPTY, departments: TYPE_DEPARTMENTS, categories: [{ id: "beta-category", name: "Beta" }] };
  const diff = diffKit(t, target);
  const type = diff.entries.find((e) => e.entity === "type");
  assert.match(type.note, /alpha-category/);
  assert.doesNotMatch(type.note, /beta-category/);
  assert.match(type.note, /department "no-such-department" is not here/);
  assert.equal(type.next.departmentId, null);
  assert.deepEqual(type.next.categoryIds, ["beta-category"]);
  const chart = diff.entries.find((e) => e.entity === "sizeChart");
  assert.match(chart.note, /ghost-type/);
  assert.deepEqual(chart.fields.product_type_ids, ["brand-new"]);
});

test("a pending value is approved by the import, an approved one gains a missing shade, and a value that is already complete is left alone", () => {
  const kit = { format: KIT_FORMAT, version: 1, category: { id: "c", name: "C" }, types: [], sizeCharts: [], values: [
    { kind: "color", label: "Wine red", hex: "#7b1e3a", tags: [] }, { kind: "color", label: "Sand", hex: "#c2b280", tags: [] }, { kind: "brand", label: "Samsung", hex: null, tags: [] }, { kind: "material", label: "Teak", hex: null, tags: ["wood"] }
  ] };
  const env = { ...EMPTY, values: [
    { kind: "color", label: "wine RED", status: "pending", hex: null, tags: [] }, { kind: "color", label: "Sand", status: "approved", hex: null, tags: [] }, { kind: "brand", label: "Samsung", status: "approved", hex: null, tags: [] }
  ] };
  const by = Object.fromEntries(diffKit(kit, env).entries.map((e) => [e.text, e]));
  assert.deepEqual([by["Wine red"].action, by["Wine red"].changes], ["change", ["approved", "shade added"]]);
  assert.deepEqual([by.Sand.action, by.Sand.changes], ["change", ["shade added"]]);
  assert.equal(by.Samsung.action, "same");
  assert.equal(by.Teak.action, "add");
});

test("a kit that is not valid is refused with reasons, and nothing is read from it", () => {
  const bad = (x) => parseKit(typeof x === "string" ? x : JSON.stringify(x));
  assert.match(bad("").errors[0], /Choose a kit file/);
  assert.match(bad("{nope").errors[0], /not valid JSON/);
  assert.match(bad({ format: "something-else" }).errors[0], /not an EpicMKT kit/);
  assert.match(bad({ format: KIT_FORMAT, version: 9 }).errors[0], /version 9/);
  assert.match(bad({ format: KIT_FORMAT, version: 1, types: [], sizeCharts: [] }).errors[0], /which category/);
  const base = { format: KIT_FORMAT, version: 1, category: { id: "c", name: "C" }, sizeCharts: [], values: [] };
  const type = { id: "ok-type", name: "Ok", categoryIds: ["c"], axes: [], specRows: [], active: true };
  assert.equal(bad({ ...base, types: [type] }).ok, true);
  const errors = (over) => bad({ ...base, types: [{ ...type, ...over }] }).errors?.join(" ") ?? "";
  assert.match(errors({ id: "Bad Id" }), /id is not valid/);
  assert.match(errors({ name: "" }), /needs a name/);
  assert.match(errors({ axes: [{ key: "a", label: "A", display: "weird" }] }), /unknown display/);
  assert.match(errors({ axes: [1, 2, 3, 4] }), /at most 3/);
  assert.match(errors({ specRows: [{ key: "", label: "", level: "mandatory", input: "text" }] }), /Ok|specRows|level/i);
  assert.match(bad({ ...base, types: [type, type] }).errors.join(" "), /appears twice/);
  assert.match(bad({ ...base, types: [], values: [{ kind: "brand", label: "" }] }).errors.join(" "), /Value 1/);
  assert.match(bad({ ...base, types: [], sizeCharts: [{ name: "", unit: "cm", columns: [], rows: [] }] }).errors.join(" "), /Size chart 1/);
  assert.match(bad(" ".repeat(10) + "x".repeat(2_000_001)).errors[0], /too large/);
});

test("applying stops at the first refusal, says how far it got, and leaves the rest to run again", async () => {
  const calls = [];
  const fake = { saveTypeSettings: async (id) => { calls.push(id); if (id === "second") throw Object.assign(new Error("invalid_axes"), { code: "invalid_axes" }); }, saveSpecRows: async () => { calls.push("rows"); } };
  const plan = [{ op: "saveTypeSettings", key: "first", args: ["first", {}] }, { op: "saveTypeSettings", key: "second", args: ["second", {}] }, { op: "saveSpecRows", key: "third", args: ["third", []] }];
  const seen = [];
  const r = await applyPlan(plan, fake, { onProgress: (n, total) => seen.push([n, total]) });
  assert.equal(r.ok, false);
  assert.equal(r.applied, 1);
  assert.equal(r.total, 3);
  assert.equal(r.failed.step.key, "second");
  assert.equal(r.failed.error.code, "invalid_axes");
  assert.deepEqual(calls, ["first", "second"], "nothing after the failure ran");
  assert.deepEqual(seen, [[1, 3]]);
});

test("the real mock apis accept what a kit applies, and a second import is a no-op", async () => {
  const env = await snapshot();
  const category = anyCategory(env.types, env);
  const kit = kitFor(env, category);
  const t = structuredClone(kit);
  t.types[0].name = "Changed by import";
  t.values.push({ kind: "finish", label: "Brushed steel", hex: null, tags: ["metal"] });
  const diff = diffKit(t, env);
  const result = await applyPlan(planImport(diff), api);
  assert.equal(result.ok, true, result.failed?.error?.message);
  const after = await snapshot();
  assert.equal(after.types.find((x) => x.id === t.types[0].id).name, "Changed by import");
  assert.ok(after.values.some((v) => v.label === "Brushed steel" && v.status === "approved" && v.tags.includes("metal")));
  assert.equal(diffKit(t, after).empty, true, "applying twice changes nothing");
});

test("clone: same options, spec rules, department and categories; a fresh valid id; switched off until looked at", () => {
  const type = { id: "phone", name: "Phone", departmentId: "phones", categoryIds: ["phones-accessories"], axes: [{ key: "colour", label: "Colour", display: "swatch" }], active: true };
  const rows = [{ key: "warranty", label: "Warranty", level: "required", input: "text" }];
  const c = cloneType({ type, specRows: rows, name: "Phone (refurbished)", takenIds: ["phone", "tablet"] });
  assert.equal(c.ok, true);
  assert.equal(c.id, "phone-refurbished");
  assert.deepEqual(c.input, { name: "Phone (refurbished)", departmentId: "phones", categoryIds: ["phones-accessories"], axes: type.axes, active: false });
  assert.deepEqual(c.specRows, rows);
  c.input.axes[0].label = "changed";
  c.specRows[0].label = "changed";
  assert.equal(type.axes[0].label, "Colour", "the copy does not share anything with the original");
  assert.equal(rows[0].label, "Warranty");
  assert.equal(cloneType({ type, name: " " }).ok, false);
  assert.equal(cloneType({ type, name: "x".repeat(61) }).ok, false);
});

test("ids made from names are always valid and never clash", () => {
  assert.equal(slugify("  Café au lait! "), "cafe-au-lait");
  assert.equal(freeTypeId("Phone", ["phone"]), "phone-2");
  assert.equal(freeTypeId("Phone", ["phone", "phone-2", "phone-3"]), "phone-4");
  assert.equal(freeTypeId("123 numbers", []), "type-123-numbers");
  assert.equal(freeTypeId("???", []), "type");
  assert.equal(freeTypeId("a", []), "type-a");
  assert.match(freeTypeId("x".repeat(80), []), /^[a-z][a-z0-9-]{1,39}$/);
  assert.match(freeTypeId("x".repeat(80), ["x".repeat(36)]), /^[a-z][a-z0-9-]{1,39}$/);
  for (const name of ["Phone", "ÄÖÜ", "-", "9", "Memory card and flash drive"]) assert.match(freeTypeId(name, []), /^[a-z][a-z0-9-]{1,39}$/, name);
  assert.ok(PRODUCT_TYPES.length > 0);
});
