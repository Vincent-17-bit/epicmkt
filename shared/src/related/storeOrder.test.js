import { test } from "node:test";
import assert from "node:assert/strict";
import { orderStoreItems } from "./storeOrder.js";

const row = (id, name, extra = {}) => ({ id, name, createdAt: "2026-11-01T00:00:00Z", ...extra });

test("the closest items come first: another dress before a jacket, even when the jacket is newer", () => {
  const current = { id: "x", name: "Ankara maxi dress" };
  const out = orderStoreItems(current, [
    row("a", "Mitumba jackets", { createdAt: "2026-11-10T00:00:00Z" }),
    row("b", "Ladies Ankara dress"),
    row("c", "Ladies handbag", { createdAt: "2026-11-09T00:00:00Z" })
  ]);
  assert.equal(out[0].id, "b");
});

test("the same section beats name likeness; then flash, then newest, then id", () => {
  const current = { id: "x", name: "Sourdough loaf", section: "Bakery" };
  const out = orderStoreItems(current, [
    row("a", "Sourdough loaf large"),
    row("b", "Croissant", { section: "bakery" }),
    row("c", "Milk 500ml", { flash: { sale: true } }),
    row("d", "Eggs tray", { createdAt: "2026-11-05T00:00:00Z" }),
    row("e", "Butter")
  ]);
  assert.deepEqual(out.map((r) => r.id), ["b", "a", "c", "d", "e"]);
});

test("without the current item it is flash, newest, id", () => {
  const out = orderStoreItems(null, [row("b", "B"), row("a", "A"), row("c", "C", { flash: {} })]);
  assert.deepEqual(out.map((r) => r.id), ["c", "a", "b"]);
});
