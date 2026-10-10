import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SELLER_API } from "./contract.js";
import * as mock from "./mock.js";

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

test("catalog: the mock behaves like the database", async () => {
  const { blankItem } = await import("@epicmkt/shared");
  mock.resetMock();
  await assert.rejects(mock.listItems(), { code: "unauthorized" });
  await mock.login("ES100001", "Demo-Passw0rd");

  const ctx = await mock.getCatalogContext();
  assert.equal(ctx.category.id, "salons");
  assert.ok(ctx.category.fields.length > 0);
  assert.equal(ctx.itemsLimit, 25);

  const tea = await mock.createItem(blankItem({ name: "Tea", price: 50, trackStock: true, stockCount: 2, lowStockThreshold: 3 }));
  assert.equal(tea.availability, "limited_stock", "the stock trigger decides the status, not the client");
  const edited = await mock.updateItem(tea.id, { ...tea, stockCount: 0, availability: "available" });
  assert.equal(edited.availability, "out_of_stock");
  const seasonal = await mock.updateItem(tea.id, { ...edited, availability: "seasonal", seasonFrom: "2026-12-01", seasonTo: "2026-12-31" });
  assert.equal(seasonal.availability, "seasonal", "manual statuses are never overwritten");

  await assert.rejects(mock.createItem(blankItem({ name: "A" })), { code: "invalid_value" });
  await assert.rejects(mock.createItem(blankItem({ name: "Bad", price: 10.5 })), { code: "invalid_value" });
  await assert.rejects(mock.createItem(tea), { code: "already_exists" });
  await assert.rejects(mock.updateItem("nope", tea), { code: "not_found" });

  const history = await mock.listItemHistory({ itemId: tea.id });
  assert.deepEqual([...new Set(history.map((h) => h.field))].sort(), ["availability", "stock_count"]);

  const first = await mock.updateItem(tea.id, { ...seasonal, price: 60 });
  assert.equal(first.price, 60);
  assert.ok((await mock.listItemHistory()).some((h) => h.field === "price" && h.old_value === "50" && h.new_value === "60"));
});

test("catalog: limit error, undo re-inserts the same row, reorder", async () => {
  const { blankItem } = await import("@epicmkt/shared");
  mock.resetMock();
  await mock.login("ES100001", "Demo-Passw0rd");
  mock.setMockLimit(2);
  const a = await mock.createItem(blankItem({ name: "Alpha", sort: 0 }));
  const b = await mock.createItem(blankItem({ name: "Bravo", sort: 1 }));
  await assert.rejects(mock.createItem(blankItem({ name: "Charlie", sort: 2 })), { code: "item_limit_reached" });

  await mock.deleteItem(a.id);
  const back = await mock.restoreItem(a);
  assert.equal(back.id, a.id, "undo keeps the same id");
  assert.equal(back.name, "Alpha");
  await assert.rejects(mock.restoreItem(a), { code: "already_exists" });

  await mock.deleteItem(b.id);
  await mock.createItem(blankItem({ name: "Charlie", sort: 5 }));
  await assert.rejects(mock.restoreItem(b), { code: "item_limit_reached" }, "undo respects a full plan");

  await mock.reorderItems([{ id: a.id, sort: 9 }]);
  assert.deepEqual((await mock.listItems()).map((i) => i.name), ["Charlie", "Alpha"]);
  assert.equal((await mock.catalogStats()).total, 2);

  assert.deepEqual(await mock.saveCatalogSettings({ sections: ["Cuts", "Braids"] }), { sections: ["Cuts", "Braids"], units: [] });
  assert.deepEqual((await mock.getCatalogSettings()).sections, ["Cuts", "Braids"]);
});

test("live maps the database's limit error to item_limit_reached", async () => {
  const { fromDb } = await import("./live.js");
  const limit = fromDb({ message: "limit_reached:items", code: "P0001" });
  assert.equal(limit.code, "item_limit_reached");
  assert.equal(fromDb({ message: "P0001: limit_reached:items" }).code, "item_limit_reached");
  assert.notEqual(fromDb({ message: "limit_reached:faqs" }).code, "item_limit_reached");
  assert.notEqual(fromDb({ message: "limit_reached:item_media" }).code, "item_limit_reached");
  assert.equal(fromDb({ message: "new row violates check constraint", code: "23514" }).code, "invalid_value");
  assert.equal(fromDb({ message: "admin_columns_protected", code: "42501" }).code, "admin_columns_protected");
  assert.equal(fromDb({ message: "duplicate key", code: "23505" }).code, "already_exists");
  assert.equal(fromDb({ message: "new row violates row-level security policy" }).code, "not_allowed");
});
