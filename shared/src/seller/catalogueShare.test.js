import test from "node:test";
import assert from "node:assert/strict";
import { catalogueFileName, catalogueMessage, catalogueWhatsappUrl, chatSafe, groupBySection, pdfSafe, sectionCounts, shareableItems, sharePrice, MESSAGE_LIMIT } from "./catalogueShare.js";

const item = (over = {}) => ({ id: "a", name: "Bread", section: "Bakery", priceType: "fixed", price: 60, salePrice: null, visibility: "showing", removed: false, soldOut: false, ...over });

test("sharePrice reads every kind of price", () => {
  assert.equal(sharePrice(item()), "KES 60");
  assert.equal(sharePrice(item({ price: 1200 })), "KES 1,200");
  assert.equal(sharePrice(item({ price: 100, salePrice: 80 })), "KES 80");
  assert.equal(sharePrice(item({ price: 100, salePrice: 120 })), "KES 100");
  assert.equal(sharePrice(item({ priceType: "from", price: 500 })), "From KES 500");
  assert.equal(sharePrice(item({ priceType: "range", price: 300, priceMax: 900 })), "KES 300 to KES 900");
  assert.equal(sharePrice(item({ priceType: "range", price: 300, priceMax: null })), "KES 300 to KES 300");
  assert.equal(sharePrice(item({ priceType: "free", price: null })), "Free");
  assert.equal(sharePrice(item({ priceType: "contact", price: null })), "Contact for price");
  assert.equal(sharePrice(item({ price: null })), "Contact for price");
});

test("shareableItems leaves out drafts, hidden, removed and sold out", () => {
  const items = [item({ id: "1" }), item({ id: "2", visibility: "draft" }), item({ id: "3", visibility: "hidden_me" }), item({ id: "4", visibility: "hidden_admin" }), item({ id: "5", removed: true }), item({ id: "6", soldOut: true })];
  assert.deepEqual(shareableItems(items).map((i) => i.id), ["1"]);
  assert.deepEqual(shareableItems(items, { includeSoldOut: true }).map((i) => i.id), ["1", "6"]);
  assert.deepEqual(shareableItems(null), []);
});

test("shareableItems can pick sections, including items with none, and ids", () => {
  const items = [item({ id: "1", section: "Bakery" }), item({ id: "2", section: "Drinks" }), item({ id: "3", section: null })];
  assert.deepEqual(shareableItems(items, { sections: ["Drinks"] }).map((i) => i.id), ["2"]);
  assert.deepEqual(shareableItems(items, { sections: [""] }).map((i) => i.id), ["3"]);
  assert.deepEqual(shareableItems(items, { sections: ["Bakery", ""] }).map((i) => i.id), ["1", "3"]);
  assert.deepEqual(shareableItems(items, { ids: ["2", "3"] }).map((i) => i.id), ["2", "3"]);
});

test("sections count and group with no-section last", () => {
  const items = [item({ id: "1", section: "Drinks" }), item({ id: "2", section: null }), item({ id: "3", section: "Bakery" }), item({ id: "4", section: "Drinks" })];
  assert.deepEqual(sectionCounts(items), [{ name: "Bakery", count: 1 }, { name: "Drinks", count: 2 }, { name: "", count: 1 }]);
  assert.deepEqual(groupBySection(items).map((g) => [g.title, g.items.map((i) => i.id)]), [["Bakery", ["3"]], ["Drinks", ["1", "4"]], ["", ["2"]]]);
});

test("chatSafe strips formatting characters, line breaks and shortens", () => {
  assert.equal(chatSafe("Fresh *bread*\n_loaf_ ~big~"), "Fresh bread loaf big");
  assert.equal(chatSafe("x".repeat(100)).length, 60);
  assert.ok(chatSafe("x".repeat(100)).endsWith("…"));
});

test("the message has the shop, a short list with prices, and the link", () => {
  const text = catalogueMessage({ name: "Sunrise Bakery", slug: "sunrise-bakery", items: [item({ id: "1" }), item({ id: "2", name: "Cake", price: 1500 })] });
  assert.equal(text, ["*Sunrise Bakery* on EpicMKT", "", "Some of what we have:", "• Bread - KES 60", "• Cake - KES 1,500", "", "See everything with photos:", "https://epicmkt.app/s/sunrise-bakery"].join("\n"));
});

test("the message lists at most eight items and counts the rest", () => {
  const items = Array.from({ length: 20 }, (_, i) => item({ id: String(i), name: `Item ${i}` }));
  const text = catalogueMessage({ name: "Shop", slug: "my-shop", items });
  assert.equal(text.split("\n").filter((l) => l.startsWith("• ")).length, 8);
  assert.ok(text.includes("and 12 more"));
});

test("the message can leave prices out, and a single item reads naturally", () => {
  const text = catalogueMessage({ name: "Shop", slug: "my-shop", items: [item()], prices: false });
  assert.ok(text.includes("• Bread\n"));
  assert.ok(!text.includes("KES"));
  assert.ok(text.includes("What we have:"));
});

test("a very long list is cut so the message stays sendable", () => {
  const items = Array.from({ length: 8 }, (_, i) => item({ id: String(i), name: "N".repeat(60) + i }));
  const text = catalogueMessage({ name: "S".repeat(80), slug: "my-shop", items, site: "https://example.test" });
  assert.ok(text.length <= MESSAGE_LIMIT);
  assert.ok(text.endsWith("https://example.test/s/my-shop"));
});

test("with no items the message is the shop and the link", () => {
  assert.equal(catalogueMessage({ name: "Shop", slug: "my-shop", items: [] }), "*Shop* on EpicMKT\n\nSee everything with photos:\nhttps://epicmkt.app/s/my-shop");
});

test("a bad slug fails loudly instead of sharing a broken link", () => {
  assert.throws(() => catalogueMessage({ name: "Shop", slug: "No Good!", items: [] }), /invalid_slug/);
});

test("whatsapp url encodes the text, file name carries the date", () => {
  assert.equal(catalogueWhatsappUrl("a b\nc"), "https://wa.me/?text=a%20b%0Ac");
  assert.equal(catalogueFileName("my-shop", new Date("2026-11-22T10:00:00Z")), "my-shop-catalogue-2026-11-22.pdf");
});

test("pdfSafe keeps what the PDF font can print", () => {
  assert.equal(pdfSafe("Kenya’s “best” – café \u{1F600} م"), "Kenya's \"best\" - café");
  assert.equal(pdfSafe("  a   b "), "a b");
});
