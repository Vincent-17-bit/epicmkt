import test from "node:test";
import assert from "node:assert/strict";
import { shareTargets } from "./shareLinks.js";

const url = "https://epicmkt.app/s/mama-oliech-bakery?a=1&b=2";

test("every target carries the full link, encoded", () => {
  const t = shareTargets({ url, text: "Mama Oliech on EpicMKT" });
  assert.equal(new URL(t.whatsapp).searchParams.get("text"), `Mama Oliech on EpicMKT ${url}`);
  assert.equal(new URL(t.facebook).searchParams.get("u"), url);
  assert.equal(new URL(t.x).searchParams.get("url"), url);
  assert.equal(new URL(t.x).searchParams.get("text"), "Mama Oliech on EpicMKT");
});

test("without text only the link is sent", () => {
  const t = shareTargets({ url });
  assert.equal(new URL(t.whatsapp).searchParams.get("text"), url);
  assert.equal(new URL(t.x).searchParams.has("text"), false);
});

test("a missing or non-web link throws", () => {
  assert.throws(() => shareTargets({}), /invalid_url/);
  assert.throws(() => shareTargets({ url: "javascript:alert(1)" }), /invalid_url/);
});
