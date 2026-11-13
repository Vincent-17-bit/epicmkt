import { SPEC_GROUPS } from "@epicmkt/shared";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SELLER_API } from "./contract.js";
import * as mock from "./mock.js";
import * as shape from "./shape.js";

const exportsOf = (file) => [...readFileSync(new URL(file, import.meta.url), "utf8").matchAll(/export const (\w+)/g)].map((m) => m[1]);

test("mock and live expose the same functions under the same names", async () => {
  const live = exportsOf("./live.js").filter((n) => SELLER_API.includes(n)).sort();
  assert.deepEqual(live, [...SELLER_API].sort());
  for (const name of SELLER_API) assert.equal(typeof mock[name], "function", name);
  const index = exportsOf("./index.js");
  for (const name of SELLER_API) assert.ok(index.includes(name), `index exports ${name}`);
});

test("the mock enforces lockout, password rules and the allow-list", async () => {
  mock.resetMock();
  await assert.rejects(mock.updateProfile({ tagline: "x" }), { code: "unauthorized" });
  for (let i = 0; i < 4; i++) await assert.rejects(mock.login("ES100001", "nope"), { code: "invalid_credentials" });
  await assert.rejects(mock.login("ES100001", "nope"), { code: "locked" });
  await assert.rejects(mock.login("ES100001", "Demo-Passw0rd"), { code: "locked" });
  mock.resetMock();
  await mock.login("es100001", "Demo-Passw0rd");
  await assert.rejects(mock.updateProfile({ status: "live" }), { code: "field_not_allowed" });
  await assert.rejects(mock.updateProfile({ announcement: "Sale" }), { code: "premium_only" });
  await assert.rejects(mock.changePassword({ code: "123456", newPassword: "short" }), { code: "weak_password" });
  await assert.rejects(mock.changePassword({ code: "000000", newPassword: "Brand-New-Pass1" }), { code: "invalid_code" });
  await mock.changePassword({ code: "123456", newPassword: "Brand-New-Pass1" });
  await mock.requestChange("town", "Kisumu");
  await assert.rejects(mock.requestChange("town", "Nairobi"), { code: "change_already_pending" });
  assert.equal(await mock.pauseListing(true), "paused");
  await assert.rejects(mock.pauseListing(true), { code: "invalid_status" });
});

test("the shop pin can be moved by the seller, but only inside Kenya", async () => {
  mock.resetMock();
  await mock.login("es100001", "Demo-Passw0rd");
  const out = await mock.setLocation({ lat: -0.0917349, lng: 34.5995012, address: "  Next to the stage " });
  assert.deepEqual(out, { lat: -0.091735, lng: 34.599501, address: "Next to the stage" });
  assert.equal((await mock.getBusinessFacts()).lat, -0.091735);
  const kept = await mock.setLocation({ lat: -0.1, lng: 34.6 });
  assert.equal(kept.address, "Next to the stage", "no address sent keeps the saved one");
  for (const bad of [{ lat: 51.5, lng: -0.12 }, { lat: 0, lng: 20 }, { lat: Number.NaN, lng: 34 }, { lat: null, lng: 34 }, {}]) {
    await assert.rejects(mock.setLocation(bad), { code: "invalid_location" });
  }
  await assert.rejects(mock.setLocation({ lat: 0, lng: 34, address: "x".repeat(201) }), { code: "invalid_address" });
});

test("specs: the mock stores and returns them, and items without specs are unchanged", async () => {
  mock.resetMock();
  await mock.login("es100001", "Demo-Passw0rd");
  const find = async (id) => (await mock.getCatalog()).items.find((i) => i.id === id);
  assert.deepEqual((await find("it-fade")).specs, []);
  const item = await find("it-fade");
  const form = { name: item.name, priceType: item.priceType, price: item.price, availability: item.availability };
  await mock.saveItem("it-fade", { ...form, specs: [{ label: "Brand", value: "Nike" }] });
  assert.deepEqual((await find("it-fade")).specs, [{ group: "Features & Specs", label: "Brand", value: "Nike" }]);
  await mock.saveItem("it-fade", form);
  assert.deepEqual((await find("it-fade")).specs, [{ group: "Features & Specs", label: "Brand", value: "Nike" }]);
  await mock.saveItem("it-fade", { ...form, specs: [] });
  assert.deepEqual((await find("it-fade")).specs, []);
  const id = await mock.saveItem(null, { ...form, specs: [{ label: "Size", value: "42" }] });
  assert.deepEqual((await find(id)).specs, [{ group: "Features & Specs", label: "Size", value: "42" }]);
  const copyId = await mock.duplicateItem(id);
  assert.deepEqual((await find(copyId)).specs, [{ group: "Features & Specs", label: "Size", value: "42" }]);
  const bare = await mock.saveItem(null, form);
  assert.deepEqual((await find(bare)).specs, []);
});

test("specs: the live shape returns them the same way the mock does", () => {
  const row = { id: "i1", name: "A", price_type: "fixed", availability: "available", created_at: "2026-01-01" };
  assert.deepEqual(shape.catalogItem(row).specs, []);
  assert.deepEqual(shape.catalogItem({ ...row, specs: [{ label: "Size", value: "42" }] }).specs, [{ label: "Size", value: "42" }]);
});

test("item details: the mock saves them, keeps them when the form omits them, and refuses bad ones", async () => {
  mock.resetMock();
  await mock.login("es100001", "Demo-Passw0rd");
  const find = async (id) => (await mock.getCatalog()).items.find((i) => i.id === id);
  const item = await find("it-fade");
  assert.deepEqual(item.highlights, []);
  const form = { name: item.name, priceType: item.priceType, price: item.price, availability: item.availability };
  await mock.saveItem("it-fade", { ...form, brand: " Acme ", shortDescription: "Fresh", packSize: "Box of 6", terms: "Order ahead", includes: ["Candles"], highlights: [{ title: "Soft", text: "Baked today" }, { title: "", text: "Nut free" }] });
  const saved = await find("it-fade");
  assert.deepEqual([saved.brand, saved.shortDescription, saved.packSize, saved.terms, saved.includes], ["Acme", "Fresh", "Box of 6", "Order ahead", ["Candles"]]);
  assert.deepEqual(saved.highlights, [{ title: "Soft", text: "Baked today" }, { text: "Nut free" }]);
  await mock.saveItem("it-fade", form);
  assert.equal((await find("it-fade")).brand, "Acme");
  assert.deepEqual((await find("it-fade")).includes, ["Candles"]);
  await mock.saveItem("it-fade", { ...form, brand: null, includes: [], highlights: [] });
  const cleared = await find("it-fade");
  assert.deepEqual([cleared.brand, cleared.shortDescription, cleared.includes, cleared.highlights], [null, "Fresh", [], []]);
  for (const bad of [{ brand: "x".repeat(61) }, { terms: "x".repeat(501) }, { includes: ["ok", 1] }, { includes: ["ok", ""] }, { highlights: [{ title: "No text" }] }, { highlights: "nope" }]) {
    await assert.rejects(mock.saveItem("it-fade", { ...form, ...bad }), { code: "invalid_details" });
  }
  const id = await mock.saveItem(null, { ...form, brand: "Acme", highlights: [{ text: "New" }] });
  assert.deepEqual([(await find(id)).brand, (await find(id)).highlights], ["Acme", [{ text: "New" }]]);
  const copyId = await mock.duplicateItem(id);
  assert.deepEqual([(await find(copyId)).brand, (await find(copyId)).highlights], ["Acme", [{ text: "New" }]]);
  assert.deepEqual(shape.catalogItem({ id: "x", name: "N", price_type: "free", highlights: [{ text: "A" }] }).highlights, [{ text: "A" }]);
  assert.deepEqual(shape.catalogItem({ id: "x", name: "N", price_type: "free" }).highlights, []);
});

test("import details: the mock stores them, refuses bad ones, and rows without them are unchanged", async () => {
  mock.resetMock();
  await mock.login("es100001", "Demo-Passw0rd");
  mock.__mock.setBusiness({ planKey: "premium" });
  const find = async (id) => (await mock.getCatalog()).items.find((i) => i.id === id);
  const bare = await find("it-fade");
  assert.deepEqual([bare.brand, bare.shortDescription, bare.packSize, bare.terms, bare.includes], [null, null, null, null, []]);
  const before = (await mock.getCatalog()).items.length;
  // A bad detail skips only that row and names it; the other rows are still created (the database does the same).
  assert.deepEqual(await mock.importItems([{ name: "Fine", price_type: "free", row: 2 }, { name: "Bad", price_type: "free", row: 3, brand: "x".repeat(61) }]), { created: 1, skipped: [{ row: 3, error: "invalid_details" }] });
  assert.deepEqual(await mock.importItems([{ name: "Bad", price_type: "free", includes: ["ok", 1] }]), { created: 0, skipped: [{ row: 1, error: "invalid_details" }] });
  assert.deepEqual(await mock.importItems([{ name: "Bad", price_type: "free", terms: "=cmd" }]), { created: 0, skipped: [{ row: 1, error: "formula_rejected" }] });
  // A bad name still refuses everything.
  await assert.rejects(mock.importItems([{ name: "Fine", price_type: "free" }, { name: "=SUM(A1)", price_type: "free" }]), { code: "formula_rejected" });
  assert.equal((await mock.getCatalog()).items.length, before + 1);
  assert.deepEqual(await mock.importItems([
    { name: "Cake", price_type: "free", brand: " Acme ", short_description: "Fresh", pack_size: "Box of 6", terms: "Order ahead", includes: ["Candles", " "] },
    { name: "Plain", price_type: "free" },
  ]), { created: 2, skipped: [] });
  const items = (await mock.getCatalog()).items;
  const cake = items.find((i) => i.name === "Cake");
  assert.deepEqual([cake.brand, cake.shortDescription, cake.packSize, cake.terms, cake.includes], ["Acme", "Fresh", "Box of 6", "Order ahead", ["Candles"]]);
  const plain = items.find((i) => i.name === "Plain");
  assert.deepEqual([plain.brand, plain.shortDescription, plain.packSize, plain.terms, plain.includes], [null, null, null, null, []]);
});

test("import details: highlights and specs are stored, a missing group is filled, bad ones skip the row", async () => {
  mock.resetMock();
  await mock.login("es100001", "Demo-Passw0rd");
  mock.__mock.setBusiness({ planKey: "premium" });
  const spec = (over = {}) => ({ group: "Measurements", label: "Weight", value: "2 kg", ...over });
  const out = await mock.importItems([
    { name: "Kettle", price_type: "free", row: 2, highlights: [{ text: "Fast" }, { title: " ", text: "Quiet" }, { title: "Safe", text: "Auto off" }], specs: [{ label: "Material", value: "Steel" }, spec()] },
    { name: "Too many specs", price_type: "free", row: 3, specs: Array.from({ length: 21 }, (_, i) => spec({ label: `L${i}` })) },
    { name: "Bad group", price_type: "free", row: 4, specs: [spec({ group: "Nope" })] },
    { name: "Nine highlights", price_type: "free", row: 5, highlights: Array.from({ length: 9 }, () => ({ text: "x" })) },
    { name: "Formula spec", price_type: "free", row: 6, specs: [spec({ value: "=1+1" })] },
    { name: "Plain", price_type: "free", row: 7 },
  ]);
  assert.deepEqual(out, { created: 2, skipped: [{ row: 3, error: "invalid_details" }, { row: 4, error: "invalid_details" }, { row: 5, error: "invalid_details" }, { row: 6, error: "formula_rejected" }] });
  const items = (await mock.getCatalog()).items;
  const kettle = items.find((i) => i.name === "Kettle");
  assert.deepEqual(kettle.highlights, [{ text: "Fast" }, { text: "Quiet" }, { title: "Safe", text: "Auto off" }]);
  assert.deepEqual(kettle.specs, [{ group: "Features & Specs", label: "Material", value: "Steel" }, { group: "Measurements", label: "Weight", value: "2 kg" }]);
  const plain = items.find((i) => i.name === "Plain");
  assert.deepEqual([plain.highlights, plain.specs], [[], []]);
});

test("import details: the live shape returns them the same way the mock does", () => {
  const row = { id: "i1", name: "A", price_type: "fixed", availability: "available", created_at: "2026-01-01" };
  const plain = shape.catalogItem(row);
  assert.deepEqual([plain.brand, plain.shortDescription, plain.packSize, plain.terms, plain.includes], [null, null, null, null, []]);
  const full = shape.catalogItem({ ...row, brand: "Acme", short_description: "Fresh", pack_size: "Box", terms: "Ahead", includes: ["Candles"] });
  assert.deepEqual([full.brand, full.shortDescription, full.packSize, full.terms, full.includes], ["Acme", "Fresh", "Box", "Ahead", ["Candles"]]);
});

const signedInMock = async () => {
  mock.resetMock();
  await mock.login("es100001", "Demo-Passw0rd");
  const find = async (id) => (await mock.getCatalog()).items.find((i) => i.id === id);
  const item = await find("it-fade");
  const form = { name: item.name, priceType: item.priceType, price: item.price, availability: item.availability };
  return { find, form };
};
const NONE = { brand: null, shortDescription: null, highlights: [], includes: [], terms: null, packSize: null };
const pick = (item) => Object.fromEntries(Object.keys(NONE).map((k) => [k, item[k]]));

test("details: items without the new fields come back empty, from the mock seed and from new items", async () => {
  const { find, form } = await signedInMock();
  assert.deepEqual(pick(await find("it-fade")), NONE);
  assert.deepEqual(pick(await find(await mock.saveItem(null, form))), NONE);
});

test("details: the mock stores trimmed text and strips an empty lead", async () => {
  const { find, form } = await signedInMock();
  const id = await mock.saveItem(null, { ...form, brand: " Nike ", shortDescription: " Light ", terms: " No returns ", packSize: " 6 ", highlights: [{ title: " ", text: "Soft" }, { title: "Lead", text: "Warm" }], includes: [" Charger ", "Cable"], specs: [{ group: "Measurements", label: "Size", value: "M" }] });
  const saved = await find(id);
  assert.deepEqual(pick(saved), { brand: "Nike", shortDescription: "Light", terms: "No returns", packSize: "6", highlights: [{ text: "Soft" }, { title: "Lead", text: "Warm" }], includes: ["Charger", "Cable"] });
  assert.deepEqual(saved.specs, [{ group: "Measurements", label: "Size", value: "M" }]);
});

test("details: a save that leaves a field out keeps it, an empty or null value clears it", async () => {
  const { find, form } = await signedInMock();
  const id = await mock.saveItem(null, { ...form, brand: "Nike", highlights: [{ text: "Soft" }], includes: ["Tag"], terms: "T", packSize: "1", shortDescription: "S" });
  await mock.saveItem(id, form);
  assert.deepEqual(pick(await find(id)), { brand: "Nike", highlights: [{ text: "Soft" }], includes: ["Tag"], terms: "T", packSize: "1", shortDescription: "S" });
  await mock.saveItem(id, { ...form, brand: null, highlights: [], includes: [], terms: "", packSize: null, shortDescription: "" });
  assert.deepEqual(pick(await find(id)), NONE);
});

test("details: a duplicate copies the new fields", async () => {
  const { find, form } = await signedInMock();
  const id = await mock.saveItem(null, { ...form, brand: "Nike", highlights: [{ title: "A", text: "B" }], includes: ["Tag"] });
  const copy = await find(await mock.duplicateItem(id));
  assert.deepEqual([copy.brand, copy.highlights, copy.includes], ["Nike", [{ title: "A", text: "B" }], ["Tag"]]);
});

test("a duplicate gets its own copies of the photos and videos, in the same order, and the original keeps its own", async () => {
  const { find } = await signedInMock();
  const before = await find("it-fade");
  assert.ok(before.imagePaths.length > 0);
  const copy = await find(await mock.duplicateItem("it-fade"));
  assert.equal(copy.imagePaths.length, before.imagePaths.length);
  assert.equal(copy.imageCount, before.imageCount);
  for (const p of copy.imagePaths) assert.ok(!before.imagePaths.includes(p), `${p} is shared`);
  assert.deepEqual(await find("it-fade"), before);
});

test("details: the mock refuses what the database refuses, specs included, and keeps the item as it was", async () => {
  const { find, form } = await signedInMock();
  const before = await find("it-fade");
  const rows = (n, make) => Array.from({ length: n }, (_, i) => make(i));
  const refused = [
    { highlights: [{ text: "ok", extra: 1 }] }, { highlights: [{ title: "Lead", text: "  " }] },
    { specs: rows(21, (i) => ({ label: `L${i}`, value: "v" })) }, { specs: [{ label: "l".repeat(41), value: "v" }] }, { specs: [{ label: "l", value: "v".repeat(121) }] },
    { specs: [{ label: "Size", value: "" }] }, { specs: [{ group: "Nope", label: "Size", value: "M" }] }, { specs: [{ label: "l", value: "v", extra: 1 }] },
  ];
  for (const bad of refused) await assert.rejects(mock.saveItem("it-fade", { ...form, ...bad }), { code: "invalid_details" }, JSON.stringify(bad).slice(0, 60));
  assert.deepEqual(await find("it-fade"), before);
});

// ---- options, variants and size charts (migration 0084): the mock follows the same rules as seller_save_item ----

const optForm = async () => {
  const item = (await mock.getCatalog()).items.find((i) => i.id === "it-fade");
  return { name: item.name, priceType: item.priceType, price: item.price, availability: item.availability };
};
const sizeAxes = () => [
  { key: "color", label: "Color", display: "swatch", values: [{ id: "red", label: "Red", color: "#ff0000" }, { id: "blue", label: "Blue", color: "#0000ff" }] },
  { key: "size", label: "Size", display: "button", values: [{ id: "s", label: "S" }, { id: "m", label: "M" }] },
];
const variantOf = (color, size, extra = {}) => ({ choice: { color, size }, ...extra });

test("options: saved, read back with the availability matrix, and an absent key keeps them", async () => {
  mock.resetMock();
  await mock.login("es100001", "Demo-Passw0rd");
  const form = await optForm();
  assert.deepEqual(await mock.getItemOptions("it-fade"), { axes: [], variants: [], optionAvailability: { axes: [], missing: "unavailable", cells: [], values: {} }, defaultVariantId: null, sizeChartId: null, sizeChartOverride: null });
  await mock.saveItem("it-fade", { ...form, options: { axes: sizeAxes(), variants: [variantOf("red", "s", { price: 1500, stock: 3, sku: "R-S" }), variantOf("blue", "m", { stock: 0 })] } });
  const o = await mock.getItemOptions("it-fade");
  assert.equal(o.axes.length, 2);
  assert.deepEqual(o.variants.map((v) => [v.choice.color, v.choice.size, v.price, v.stock, v.status, v.sku]), [["red", "s", 1500, 3, "available", "R-S"], ["blue", "m", null, 0, "out_of_stock", null]]);
  assert.equal(o.optionAvailability.missing, "unavailable");
  assert.equal(o.optionAvailability.values.size.s, "available");
  assert.equal(o.optionAvailability.values.color.blue, "out_of_stock");
  await mock.saveItem("it-fade", { ...form, price: form.price + 100 });
  assert.equal((await mock.getItemOptions("it-fade")).variants.length, 2, "a save without options leaves them");
  await mock.saveItem("it-fade", { ...form, options: null });
  assert.deepEqual((await mock.getItemOptions("it-fade")).axes, []);
});

test("options: a default combination is kept, moved, cleared, and dropped with its variant; variant specs and dependsOn are stored", async () => {
  mock.resetMock();
  await mock.login("es100001", "Demo-Passw0rd");
  const form = await optForm();
  const deps = sizeAxes();
  deps[1].dependsOn = "color";
  const rows = () => [variantOf("red", "s", { price: 10 }), variantOf("red", "m", { price: 20, specs: [{ group: "Measurements", label: "Weight", value: "1 kg" }] }), variantOf("blue", "m", { price: 30 })];
  await mock.saveItem("it-fade", { ...form, options: { axes: deps, variants: rows(), defaultChoice: { color: "blue", size: "m" } } });
  let o = await mock.getItemOptions("it-fade");
  assert.equal(o.axes[1].dependsOn, "color");
  assert.equal(o.defaultVariantId, "it-fade:color=blue|size=m");
  assert.deepEqual(o.variants[1].specs, [{ group: "Measurements", label: "Weight", value: "1 kg" }]);
  assert.deepEqual(o.variants[0].specs, []);
  // a save that does not mention the default keeps it
  await mock.saveItem("it-fade", { ...form, options: { axes: deps, variants: rows() } });
  assert.equal((await mock.getItemOptions("it-fade")).defaultVariantId, "it-fade:color=blue|size=m");
  // moved, then cleared
  await mock.saveItem("it-fade", { ...form, options: { axes: deps, variants: rows(), defaultChoice: { color: "red", size: "s" } } });
  assert.equal((await mock.getItemOptions("it-fade")).defaultVariantId, "it-fade:color=red|size=s");
  await mock.saveItem("it-fade", { ...form, options: { axes: deps, variants: rows(), defaultChoice: null } });
  assert.equal((await mock.getItemOptions("it-fade")).defaultVariantId, null);
  // removed with its variant
  await mock.saveItem("it-fade", { ...form, options: { axes: deps, variants: rows(), defaultChoice: { color: "blue", size: "m" } } });
  await mock.saveItem("it-fade", { ...form, options: { axes: deps, variants: rows().slice(0, 2) } });
  assert.equal((await mock.getItemOptions("it-fade")).defaultVariantId, null, "the default goes with its variant");
  // refused, and nothing changes
  const before = await mock.getItemOptions("it-fade");
  await assert.rejects(mock.saveItem("it-fade", { ...form, options: { axes: deps, variants: rows(), defaultChoice: { color: "red", size: "x" } } }), { code: "invalid_default" });
  await assert.rejects(mock.saveItem("it-fade", { ...form, options: { axes: deps, variants: rows().slice(0, 2), defaultChoice: { color: "blue", size: "m" } } }), { code: "invalid_default" });
  const later = sizeAxes(); later[0].dependsOn = "size";
  await assert.rejects(mock.saveItem("it-fade", { ...form, options: { axes: later, variants: rows() } }), { code: "invalid_options" });
  assert.deepEqual(await mock.getItemOptions("it-fade"), before);
});

test("checkItem returns the save's error name and never saves; a good item is ok", async () => {
  mock.resetMock();
  await mock.login("es100001", "Demo-Passw0rd");
  const form = await optForm();
  const before = await mock.getItemOptions("it-fade");
  const catalog = (await mock.getCatalog()).items.length;
  assert.deepEqual(await mock.checkItem("it-fade", { ...form, name: "Renamed", options: { axes: sizeAxes(), variants: [variantOf("red", "s")], defaultChoice: { color: "red", size: "s" } } }), { ok: true, issues: [] });
  assert.deepEqual(await mock.checkItem(null, { ...form, options: { axes: sizeAxes(), variants: [variantOf("red", "s")] } }), { ok: true, issues: [] });
  assert.deepEqual((await mock.checkItem("it-fade", { ...form, name: "x" })).issues, [{ code: "invalid_name" }]);
  assert.deepEqual((await mock.checkItem("it-fade", { ...form, options: { axes: sizeAxes(), variants: [variantOf("red", "s")], defaultChoice: { color: "blue", size: "m" } } })).issues, [{ code: "invalid_default" }]);
  assert.deepEqual((await mock.checkItem("it-fade", { ...form, options: { axes: sizeAxes(), variants: [variantOf("red", "s"), variantOf("red", "s")] } })).issues, [{ code: "duplicate_variant" }]);
  assert.deepEqual((await mock.checkItem("nope", form)).issues, [{ code: "item_not_found" }]);
  assert.deepEqual(await mock.getItemOptions("it-fade"), before, "nothing was stored");
  assert.equal((await mock.getCatalog()).items.length, catalog, "and no item was made");
  assert.equal((await mock.getCatalog()).items.find((i) => i.id === "it-fade").name, form.name);
});

test("options: the mock refuses what the database refuses, with the same error names, and a refused save changes nothing", async () => {
  mock.resetMock();
  await mock.login("es100001", "Demo-Passw0rd");
  const form = await optForm();
  await mock.saveItem("it-fade", { ...form, options: { axes: sizeAxes(), variants: [variantOf("red", "s")] } });
  const bad = (options, code) => assert.rejects(mock.saveItem("it-fade", { ...form, name: "Changed", options }), { code });
  await bad({ axes: [{ ...sizeAxes()[0], display: "grid" }], variants: [] }, "invalid_options");
  await bad({ axes: sizeAxes(), variants: [variantOf("green", "s")] }, "invalid_variant");
  await bad({ axes: sizeAxes(), variants: [variantOf("red", "s"), variantOf("red", "s")] }, "duplicate_variant");
  await bad({ axes: sizeAxes(), variants: [variantOf("red", "s", { sku: "A" }), variantOf("red", "m", { sku: "a" })] }, "duplicate_sku");
  const big = [{ key: "a", label: "A", display: "dropdown", values: Array.from({ length: 40 }, (_, i) => ({ id: `a${i}`, label: `A${i}` })) }, { key: "b", label: "B", display: "dropdown", values: Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, label: `B${i}` })) }];
  const many = big[0].values.flatMap((x) => big[1].values.map((y) => ({ choice: { a: x.id, b: y.id } })));
  await bad({ axes: big, variants: many.slice(0, 201) }, "too_many_variants");
  await mock.saveItem("it-fade", { ...form, options: { axes: big, variants: many.slice(0, 200) } });
  assert.equal((await mock.getItemOptions("it-fade")).variants.length, 200);
  assert.equal((await mock.getCatalog()).items.find((i) => i.id === "it-fade").name, form.name, "the refused saves changed nothing");
});

test("size chart: pick one from the library, override its rows, clear it", async () => {
  mock.resetMock();
  await mock.login("es100001", "Demo-Passw0rd");
  const form = await optForm();
  const charts = await mock.listSizeCharts();
  assert.ok(charts.length >= 2);
  assert.deepEqual(Object.keys(charts[0]).sort(), ["category", "columns", "id", "name", "rows", "unit"]);
  const chart = charts[0];
  await mock.saveItem("it-fade", { ...form, sizeChartId: chart.id });
  assert.equal((await mock.getItemOptions("it-fade")).sizeChartId, chart.id);
  const mine = [chart.columns.map((_, i) => String(40 + i))];
  await mock.saveItem("it-fade", { ...form, sizeChartOverride: { rows: mine } });
  assert.deepEqual((await mock.getItemOptions("it-fade")).sizeChartOverride, { rows: mine });
  await assert.rejects(mock.saveItem("it-fade", { ...form, sizeChartOverride: { rows: [["x"]] } }), { code: "invalid_size_chart" });
  await assert.rejects(mock.saveItem("it-fade", { ...form, sizeChartId: "nope" }), { code: "invalid_size_chart" });
  await mock.saveItem("it-fade", { ...form, sizeChartId: charts[1].id });
  assert.equal((await mock.getItemOptions("it-fade")).sizeChartOverride, null, "a different chart clears the override");
  await mock.saveItem("it-fade", { ...form, sizeChartId: null });
  assert.equal((await mock.getItemOptions("it-fade")).sizeChartId, null);
  await assert.rejects(mock.saveItem("it-fade", { ...form, sizeChartOverride: { rows: mine } }), { code: "invalid_size_chart" });
});

test("duplicate copies options and the size chart; bulk price change scales variant prices", async () => {
  mock.resetMock();
  await mock.login("es100001", "Demo-Passw0rd");
  const form = await optForm();
  const chart = (await mock.listSizeCharts())[0];
  await mock.saveItem("it-fade", { ...form, sizeChartId: chart.id, options: { axes: sizeAxes(), variants: [variantOf("red", "s", { price: 2000, salePrice: 1500 }), variantOf("red", "m")] } });
  const copyId = await mock.duplicateItem("it-fade");
  const copy = await mock.getItemOptions(copyId);
  assert.deepEqual(copy.variants.map((v) => [v.choice.size, v.price, v.salePrice]), [["s", 2000, 1500], ["m", null, null]]);
  assert.equal(copy.sizeChartId, chart.id);
  assert.ok(copy.variants.every((v) => v.id.startsWith(copyId)), "the copy's variants are its own rows");
  const r = await mock.bulkItems("price_percent", ["it-fade"], { percent: 10 });
  assert.equal(r.affected, 1);
  const o = await mock.getItemOptions("it-fade");
  assert.deepEqual(o.variants.map((v) => [v.price, v.salePrice]), [[2200, 1650], [null, null]]);
  assert.equal((await mock.getItemOptions(copyId)).variants[0].price, 2000, "the copy is untouched");
});

test("an item without options is unchanged by all of this", async () => {
  mock.resetMock();
  await mock.login("es100001", "Demo-Passw0rd");
  const form = await optForm();
  const before = (await mock.getCatalog()).items.find((i) => i.id === "it-fade");
  await mock.saveItem("it-fade", form);
  const after = (await mock.getCatalog()).items.find((i) => i.id === "it-fade");
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort(), "the catalog item has no new keys");
  const copyId = await mock.duplicateItem("it-fade");
  assert.deepEqual((await mock.getItemOptions(copyId)).variants, []);
});

const guide = (o = {}) => ({ unit: "cm", columns: ["Size", "Chest"], rows: [["S", "86"], ["M", "92"]], ...o });
test("size guide: none at first, saved, read back, copied with a duplicate, removed with null", async () => {
  mock.resetMock();
  await mock.login("es100001", "Demo-Passw0rd");
  assert.equal(await mock.getItemSizeGuide("it-fade"), null);
  assert.equal(await mock.saveItemSizeGuide("it-fade", guide()), true);
  assert.deepEqual(await mock.getItemSizeGuide("it-fade"), guide());
  const copyId = await mock.duplicateItem("it-fade");
  assert.deepEqual(await mock.getItemSizeGuide(copyId), guide());
  await mock.saveItemSizeGuide("it-fade", null);
  assert.equal(await mock.getItemSizeGuide("it-fade"), null);
  assert.deepEqual(await mock.getItemSizeGuide(copyId), guide(), "the copy keeps its own");
});
test("size guide: the same rules as the database, and only the seller's own items", async () => {
  mock.resetMock();
  await mock.login("es100001", "Demo-Passw0rd");
  const bad = [
    guide({ columns: [] , rows: [] }), guide({ rows: [] }), guide({ rows: [["S"]] }), guide({ rows: [["S", ""]] }), guide({ columns: ["Size", "Size"], rows: [["S", "1"]] }),
    guide({ unit: "yd" }), guide({ columns: ["Size", "x".repeat(31)], rows: [["S", "1"]] }), guide({ rows: [["S", "x".repeat(21)]] }), { ...guide(), extra: 1 },
    guide({ columns: Array.from({ length: 13 }, (_, i) => `C${i}`), rows: [Array.from({ length: 13 }, () => "1")] }),
    guide({ rows: Array.from({ length: 61 }, (_, i) => [`S${i}`, "1"]) })
  ];
  for (const g of bad) await assert.rejects(() => mock.saveItemSizeGuide("it-fade", g), { code: "invalid_size_guide" }, JSON.stringify(g).slice(0, 80));
  await assert.rejects(() => mock.saveItemSizeGuide("nope", guide()), { code: "item_not_found" });
  await assert.rejects(() => mock.getItemSizeGuide("nope"), { code: "item_not_found" });
  assert.equal(await mock.saveItemSizeGuide("it-fade", guide({ unit: undefined })), true, "a missing unit is allowed");
  assert.equal(await mock.getItemSizeGuide("it-fade").then((g) => g.rows.length), 2);
});

test("the mock refuses a publish the real server would refuse, and lets it through once the required rows are filled", async () => {
  mock.resetMock();
  await mock.login("es100001", "Demo-Passw0rd");
  const base = { name: "Pulse X1", priceType: "fixed", price: 9000, availability: "available", productTypeId: "phone" };
  const id = await mock.saveItem(null, base);
  await assert.rejects(mock.bulkItems("show", [id]), (e) => e.code === "publish_blocked" && JSON.parse(e.details).some((b) => b.label === "Warranty"));
  assert.equal((await mock.getCatalog()).items.find((i) => i.id === id).visible, false);
  await mock.saveItem(id, { ...base, specs: [{ group: SPEC_GROUPS[0], label: "Warranty", value: "1 year" }] });
  assert.equal((await mock.bulkItems("show", [id])).affected, 1);
  await assert.rejects(mock.saveItem(id, { ...base, specs: [] }), { code: "publish_blocked" });
  assert.equal((await mock.getCatalog()).items.find((i) => i.id === id).specs.length, 1);
});

test("an item that was live before the gate stays live until its type or specs are edited", async () => {
  mock.resetMock();
  await mock.login("es100001", "Demo-Passw0rd");
  const item = (await mock.getCatalog()).items.find((i) => i.id === "it-fade");
  const form = { name: item.name, priceType: item.priceType, price: item.price + 50, availability: item.availability };
  await mock.saveItem("it-fade", form);
  await assert.rejects(mock.saveItem("it-fade", { ...form, productTypeId: "phone" }), { code: "publish_blocked" });
});
test("product type: saved with the item, read back from the catalog, kept when a later save does not send it", async () => {
  mock.resetMock();
  await mock.login("es100001", "Demo-Passw0rd");
  const base = { name: "Red vodka", description: "", section: null, priceType: "fixed", price: 900, availability: "available" };
  const id = await mock.saveItem(null, { ...base, productTypeId: "liquor" });
  const read = async () => (await mock.getCatalog()).items.find((i) => i.id === id);
  assert.equal((await read()).productTypeId, "liquor");
  await mock.saveItem(id, { ...base, name: "Red vodka 1L" });
  assert.equal((await read()).productTypeId, "liquor", "absent key leaves the type alone");
  await mock.saveItem(id, { ...base, productTypeId: null });
  assert.equal((await read()).productTypeId, null, "null is Other goods");
});
test("shape: the catalog item carries product_type_id as productTypeId", async () => {
  const { catalogItem } = await import("./shape.js");
  assert.equal(catalogItem({ id: "a", name: "x", price_type: "fixed", product_type_id: "shoes" }).productTypeId, "shoes");
  assert.equal(catalogItem({ id: "a", name: "x", price_type: "fixed" }).productTypeId, null);
});
