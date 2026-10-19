import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_SAVED_VIEWS, addSavedView, applyPricePreview, previewPriceChange, reorderIds, scalePrice, validatePercent, validateSavedViews, validateViewName } from "./bulk.js";

const row = (id, o = {}) => ({ id, name: `Item ${id}`, priceType: "fixed", price: 100, priceMax: null, salePrice: null, ...o });

test("percent validation", () => {
  assert.equal(validatePercent(10).ok, true);
  assert.equal(validatePercent("-12.5").tenths, -125);
  assert.equal(validatePercent(0).ok, false);
  assert.equal(validatePercent(301).ok, false);
  assert.equal(validatePercent(-91).ok, false);
  assert.equal(validatePercent(12.34).ok, false);
  assert.equal(validatePercent("abc").ok, false);
  assert.equal(validatePercent(300).ok, true);
  assert.equal(validatePercent(-90).ok, true);
});

test("whole KES rounding: halves round up and never below 1", () => {
  assert.equal(scalePrice(100, 100), 110);
  assert.equal(scalePrice(15, 100), 17);
  assert.equal(scalePrice(199, -500), 100);
  assert.equal(scalePrice(1, -900), 1);
  assert.equal(scalePrice(99.5, 0), 100);
  assert.equal(scalePrice(333, 75), 358);
  assert.equal(scalePrice(null, 100), null);
});

test("preview lists before and after, skips unpriced items and keeps sale below price", () => {
  const items = [
    row("a", { price: 1000, salePrice: 800 }),
    row("b", { price: 15, priceType: "from" }),
    row("c", { price: 2000, priceMax: 3000, priceType: "range" }),
    row("d", { priceType: "free", price: null }),
    row("e", { priceType: "contact", price: null }),
    row("f", { price: 2, salePrice: 1 }),
  ];
  const p = previewPriceChange(items, 10);
  assert.equal(p.ok, true);
  assert.equal(p.affected, 4);
  assert.equal(p.skipped, 2);
  const by = Object.fromEntries(p.rows.map((r) => [r.id, r.after]));
  assert.deepEqual(by.a, { price: 1100, priceMax: null, salePrice: 880 });
  assert.equal(by.b.price, 17);
  assert.deepEqual(by.c, { price: 2200, priceMax: 3300, salePrice: null });
  assert.equal(by.f.price, 2);
  assert.ok(by.f.salePrice < by.f.price);
  assert.match(p.rule, /whole KES/);
});

test("the preview is exactly what gets applied", () => {
  const items = [row("a", { price: 333 }), row("b", { price: 49.5 }), row("d", { priceType: "free", price: null })];
  const p = previewPriceChange(items, -12.5);
  const applied = applyPricePreview(items, p);
  assert.deepEqual(applied.slice(0, 2).map((i) => i.price), p.rows.map((r) => r.after.price));
  assert.deepEqual(applied.slice(0, 2).map((i) => i.price), [291, 43]);
  assert.equal(applied[2].price, null);
  assert.equal(previewPriceChange(items, 0).ok, false);
});

test("saved view names are validated", () => {
  assert.equal(validateViewName("Out of stock").ok, true);
  assert.equal(validateViewName("   ").ok, false);
  assert.equal(validateViewName("x".repeat(31)).ok, false);
  assert.equal(validateViewName("<script>").ok, false);
  assert.equal(validateViewName("=cmd").ok, false);
  assert.equal(validateViewName("  Spaced  ").value, "Spaced");
});

test("at most ten saved views with unique names", () => {
  let views = [];
  for (let i = 0; i < MAX_SAVED_VIEWS; i += 1) {
    const r = addSavedView(views, `View ${i}`, "sort=name_asc", `id${i}`);
    assert.equal(r.ok, true);
    views = r.views;
  }
  assert.equal(addSavedView(views, "One more", "q=a").ok, false);
  assert.equal(validateSavedViews(views).ok, true);
  assert.equal(validateSavedViews([...views, { id: "zz", name: "Extra", query: "" }]).ok, false);
  assert.equal(addSavedView(views.slice(0, 2), "view 0", "q=a").ok, false);
  assert.equal(validateSavedViews([{ id: "a", name: "A", query: "" }, { id: "b", name: "a", query: "" }]).ok, false);
  assert.equal(validateSavedViews([{ id: "a b", name: "A", query: "" }]).ok, false);
  assert.equal(validateSavedViews([{ id: "a", name: "A", query: "x".repeat(601) }]).ok, false);
  assert.equal(validateSavedViews("nope").ok, false);
});

test("reorder moves one id", () => {
  assert.deepEqual(reorderIds(["a", "b", "c", "d"], 0, 2), ["b", "c", "a", "d"]);
  assert.deepEqual(reorderIds(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
  assert.deepEqual(reorderIds(["a", "b"], 0, 0), ["a", "b"]);
  assert.deepEqual(reorderIds(["a", "b"], 0, 5), ["a", "b"]);
});

test("preview skips items that are in a flash sale", () => {
  const items = [row("a", { price: 1000 }), row("b", { price: 500, inFlashSale: true }), row("c", { price: 200, inFlashSale: false })];
  const p = previewPriceChange(items, 10);
  assert.equal(p.affected, 2);
  assert.equal(p.skipped, 1);
  assert.deepEqual(p.rows.map((r) => r.id), ["a", "c"]);
  const next = applyPricePreview(items, p);
  assert.equal(next[1].price, 500);
});
