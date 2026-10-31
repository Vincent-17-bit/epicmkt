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
