import test from "node:test";
import assert from "node:assert/strict";
import { shopUrl, shopQrUrl, shopDisplayUrl, whatsappShareUrl, isValidSlug, siteBase } from "./shopLink.js";

test("link is <site>/s/<slug> and the QR adds only the source tag", () => {
  assert.equal(shopUrl("mama-oliech-bakery"), "https://epicmkt.app/s/mama-oliech-bakery");
  assert.equal(shopQrUrl("mama-oliech-bakery"), "https://epicmkt.app/s/mama-oliech-bakery?src=qr");
  assert.equal(shopDisplayUrl("mama-oliech-bakery"), "epicmkt.app/s/mama-oliech-bakery");
});

test("base comes from config, trailing slashes dropped, blank falls back", () => {
  assert.equal(siteBase("https://staging.epicmkt.app//"), "https://staging.epicmkt.app");
  assert.equal(siteBase(""), "https://epicmkt.app");
  assert.equal(shopUrl("abc", "https://x.test/"), "https://x.test/s/abc");
});

test("different businesses never share a link", () => {
  const slugs = ["shop-a", "shop-b", "shop-a2", "a-shop"];
  assert.equal(new Set(slugs.map((s) => shopQrUrl(s))).size, slugs.length);
});

test("only a clean slug can be encoded, so nothing personal or injected reaches the code", () => {
  for (const bad of ["", "ab", "Has Space", "a/b", "a?b=1", "x#y", "ÜÜÜ", "a".repeat(61), null, undefined, 5, "https://evil.test"]) {
    assert.equal(isValidSlug(bad), false, String(bad));
    assert.throws(() => shopQrUrl(bad), /invalid_slug/);
  }
  assert.equal(isValidSlug("ok-shop-9"), true);
});

test("WhatsApp share is a wa.me link carrying the public link only", () => {
  const url = whatsappShareUrl("shop-a", "Shop A");
  assert.ok(url.startsWith("https://wa.me/?text="));
  const text = decodeURIComponent(url.slice("https://wa.me/?text=".length));
  assert.ok(text.includes("https://epicmkt.app/s/shop-a"));
  assert.ok(!text.includes("src=qr"));
});
