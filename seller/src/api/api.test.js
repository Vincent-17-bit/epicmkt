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

const signedInMock = async () => {
  mock.resetMock();
  await mock.login("es100001", "Demo-Passw0rd");
  const find = async (id) => (await mock.getCatalog()).items.find((i) => i.id === id);
  const item = await find("it-fade");
  const form = { name: item.name, priceType: item.priceType, price: item.price, availability: item.availability };
  return { find, form };
};
const NONE = { brand: null, shortDescription: null, highlights: [], includes: [], terms: null, packSize: null };

test("details: items without the new fields come back empty, from the mock seed and from new items", async () => {
  const { find, form } = await signedInMock();
  const seeded = await find("it-fade");
  assert.deepEqual(Object.fromEntries(Object.keys(NONE).map((k) => [k, seeded[k]])), NONE);
  const made = await find(await mock.saveItem(null, form));
  assert.deepEqual(Object.fromEntries(Object.keys(NONE).map((k) => [k, made[k]])), NONE);
});

test("details: the mock stores trimmed values, strips an empty lead, and returns them", async () => {
  const { find, form } = await signedInMock();
  const id = await mock.saveItem(null, { ...form, brand: " Nike ", shortDescription: " Light ", terms: " No returns ", packSize: " 6 ", highlights: [{ title: " ", text: "Soft" }, { title: "Lead", text: "Warm" }], includes: [" Charger ", "Cable"], specs: [{ group: "Measurements", label: "Size", value: "M" }] });
  assert.deepEqual(await find(id), { ...(await find(id)), brand: "Nike", shortDescription: "Light", terms: "No returns", packSize: "6", highlights: [{ text: "Soft" }, { title: "Lead", text: "Warm" }], includes: ["Charger", "Cable"], specs: [{ group: "Measurements", label: "Size", value: "M" }] });
});

test("details: a save that leaves a field out keeps it, an empty value clears it", async () => {
  const { find, form } = await signedInMock();
  const id = await mock.saveItem(null, { ...form, brand: "Nike", highlights: [{ text: "Soft" }], includes: ["Tag"], terms: "T", packSize: "1", shortDescription: "S" });
  await mock.saveItem(id, form);
  const kept = await find(id);
  assert.deepEqual([kept.brand, kept.highlights, kept.includes, kept.terms, kept.packSize, kept.shortDescription], ["Nike", [{ text: "Soft" }], ["Tag"], "T", "1", "S"]);
  await mock.saveItem(id, { ...form, brand: "", highlights: [], includes: [], terms: "", packSize: "", shortDescription: "" });
  const cleared = await find(id);
  assert.deepEqual(Object.fromEntries(Object.keys(NONE).map((k) => [k, cleared[k]])), NONE);
  await mock.saveItem(id, { ...form, brand: undefined, highlights: null });
  assert.deepEqual((await find(id)).highlights, []);
});

test("details: a duplicate copies the new fields", async () => {
  const { find, form } = await signedInMock();
  const id = await mock.saveItem(null, { ...form, brand: "Nike", highlights: [{ title: "A", text: "B" }], includes: ["Tag"] });
  const copyId = await mock.duplicateItem(id);
  const copy = await find(copyId);
  assert.deepEqual([copy.brand, copy.highlights, copy.includes], ["Nike", [{ title: "A", text: "B" }], ["Tag"]]);
});

test("details: the mock refuses what the database refuses, with the same code", async () => {
  const { find, form } = await signedInMock();
  const before = await find("it-fade");
  const rows = (n, make) => Array.from({ length: n }, (_, i) => make(i));
  const refused = [
    { brand: "b".repeat(61) }, { shortDescription: "s".repeat(141) }, { terms: "t".repeat(501) }, { packSize: "p".repeat(41) },
    { highlights: rows(9, (i) => ({ text: `P${i}` })) }, { highlights: [{ title: "x".repeat(41), text: "ok" }] }, { highlights: [{ text: "t".repeat(201) }] },
    { highlights: [{ title: "Lead", text: "  " }] }, { highlights: [{ text: "ok", extra: 1 }] },
    { includes: rows(11, (i) => `L${i}`) }, { includes: ["x".repeat(81)] }, { includes: ["ok", " "] },
    { specs: rows(21, (i) => ({ label: `L${i}`, value: "v" })) }, { specs: [{ label: "l".repeat(41), value: "v" }] }, { specs: [{ label: "l", value: "v".repeat(121) }] },
    { specs: [{ label: "Size", value: "" }] }, { specs: [{ group: "Nope", label: "Size", value: "M" }] },
  ];
  for (const bad of refused) await assert.rejects(mock.saveItem("it-fade", { ...form, ...bad }), { code: "invalid_details" }, JSON.stringify(bad).slice(0, 60));
  assert.deepEqual(await find("it-fade"), before);
});

test("details: the live shape returns them the same way the mock does", () => {
  const row = { id: "i1", name: "A", price_type: "fixed", availability: "available", created_at: "2026-01-01" };
  assert.deepEqual(Object.fromEntries(Object.keys(NONE).map((k) => [k, shape.catalogItem(row)[k]])), NONE);
  const full = shape.catalogItem({ ...row, brand: "Nike", short_description: "S", pack_size: "6", terms: "T", highlights: [{ title: "A", text: "B" }], includes: ["Tag"] });
  assert.deepEqual([full.brand, full.shortDescription, full.packSize, full.terms, full.highlights, full.includes], ["Nike", "S", "6", "T", [{ title: "A", text: "B" }], ["Tag"]]);
});
