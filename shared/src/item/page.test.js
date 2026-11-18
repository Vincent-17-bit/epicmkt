import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PAGE_LIMITS, brandPayload, checkItemDelivery, checkNotices, cleanNotices, deliveryForm, galleryPayload, includeRows, itemDeliveryInfo,
  joinInclude, splitInclude
} from "./page.js";

const shop = { offers: true, fee: 100, radiusKm: 8, area: "Kisumu town", minOrder: 500, notes: null };
const ID = "0b8c3d3e-6c7a-4b5e-9a1c-2f3d4e5f6a7b";

test("delivery: 'same as my shop' is stored as null, the item's own setting is cleaned", () => {
  assert.deepEqual(checkItemDelivery({ mode: "shop", fee: "50" }), { ok: true, value: null });
  assert.deepEqual(checkItemDelivery(undefined), { ok: true, value: null });
  assert.deepEqual(
    checkItemDelivery({ mode: "custom", fee: "KES 1,200", area: "  Kisumu   CBD ", time: "Same day", notes: "", pickup: true }),
    { ok: true, value: { mode: "custom", fee: 1200, area: "Kisumu CBD", time: "Same day", notes: null, pickup: true } }
  );
  assert.deepEqual(checkItemDelivery({ mode: "custom", fee: "" }).value.fee, null, "no fee: buyers are told to ask");
  assert.deepEqual(checkItemDelivery({ mode: "custom", fee: 0 }).value.fee, 0, "0 is free delivery");
  assert.deepEqual(checkItemDelivery({ mode: "none", notes: "Collect at the back gate", fee: 99 }), { ok: true, value: { mode: "none", notes: "Collect at the back gate", pickup: true } });
  assert.deepEqual(checkItemDelivery({ mode: "custom", fee: "-5" }).errors, { fee: "invalid_fee" });
  assert.deepEqual(checkItemDelivery({ mode: "custom", area: "x".repeat(121) }).errors, { area: "area_too_long" });
  assert.deepEqual(checkItemDelivery({ mode: "teleport" }).errors, { mode: "invalid_mode" });
});

test("delivery: the item wins over the shop and keeps the shop's radius and minimum order", () => {
  assert.equal(itemDeliveryInfo(null, shop).source, "shop");
  assert.equal(itemDeliveryInfo(null, shop).fee, 100);
  const own = itemDeliveryInfo({ mode: "custom", fee: 0, area: "Kisumu CBD", time: "Same day", pickup: true }, shop);
  assert.deepEqual(own, { source: "item", offers: true, fee: 0, area: "Kisumu CBD", time: "Same day", notes: null, pickup: true, radiusKm: 8, minOrder: 500 });
  const none = itemDeliveryInfo({ mode: "none", notes: "Too heavy to deliver" }, shop);
  assert.equal(none.offers, false);
  assert.equal(none.pickup, true);
  assert.equal(itemDeliveryInfo({ mode: "custom", fee: 50 }, { offers: false }).radiusKm, null, "no shop radius when the shop does not deliver");
  assert.deepEqual(deliveryForm(null).mode, "shop");
  assert.deepEqual(deliveryForm({ mode: "custom", fee: 0, area: "A" }), { mode: "custom", fee: "0", area: "A", time: "", notes: "", pickup: false });
});

test("notes: need a title and a text, at most 3, unknown tones become info", () => {
  const r = checkNotices([{ tone: "caution", title: "Product voltage: 240 V", text: "Works with Kenyan sockets." }, { title: "", text: "" }, { title: "Only a title" }]);
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors[2], { text: "required" });
  assert.equal(r.errors[1], null, "an empty row is ignored");
  assert.deepEqual(r.value, [{ tone: "caution", title: "Product voltage: 240 V", text: "Works with Kenyan sockets." }]);
  assert.equal(checkNotices(Array.from({ length: 4 }, () => ({ title: "a", text: "b" }))).tooMany, true);
  assert.deepEqual(cleanNotices([{ tone: "loud", title: " Hi ", text: "x" }]), [{ tone: "info", title: "Hi", text: "x" }]);
});

test("what's included: names are bold whatever the seller typed; a colon separates the details", () => {
  assert.deepEqual(splitInclude("**Remote control**: batteries not included"), { name: "Remote control", details: "batteries not included" });
  assert.deepEqual(splitInclude("• 1 x White bread loaf (400 g)"), { name: "1 x White bread loaf (400 g)", details: "" });
  assert.deepEqual(splitInclude("2. Stand bases:"), { name: "Stand bases", details: "" });
  assert.equal(joinInclude({ name: "Power supply", details: "12 V, 1.5 m cable" }), "Power supply: 12 V, 1.5 m cable");
  assert.equal(joinInclude({ name: "Cable: HDMI", details: "" }), "Cable - HDMI", "a colon in a name would split it");
  assert.equal(joinInclude({ name: "", details: "" }), "");
  assert.deepEqual(includeRows(["Power supply: 12 V", "ARC cable"], [null, "https://img/x.jpg"]), [
    { name: "Power supply", details: "12 V", photo: null },
    { name: "ARC cable", details: "", photo: "https://img/x.jpg" }
  ]);
});

test("pictures: at most 5 in the gallery and 8 brand cards, only real media ids", () => {
  const many = Array.from({ length: 7 }, (_, i) => ({ mediaId: ID, label: `Tab ${i}`, caption: "" }));
  assert.equal(galleryPayload(many).length, PAGE_LIMITS.gallery.rows);
  assert.deepEqual(galleryPayload([{ mediaId: "blob:x", label: "a" }, { mediaId: ID, label: "Film mode", caption: "" }]), [{ id: ID, label: "Film mode", caption: null }]);
  assert.equal(brandPayload({ banner: null, cards: [] }), null);
  assert.deepEqual(brandPayload({ banner: { mediaId: ID }, cards: [{ mediaId: ID, caption: " Reddot winner 2026 " }] }), { banner: ID, cards: [{ id: ID, caption: "Reddot winner 2026" }] });
});
