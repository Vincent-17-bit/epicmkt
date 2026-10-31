import test from "node:test";
import assert from "node:assert/strict";
import { SIDEBAR_KEY, initialCollapsed, parsePref, readSaved, writeSaved } from "./sidebar.js";

const memory = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
};

test("a saved choice wins over the screen width", () => {
  assert.equal(initialCollapsed("expanded", 800), false);
  assert.equal(initialCollapsed("collapsed", 1600), true);
});

test("without a saved choice, tablets start collapsed and wide screens start open", () => {
  assert.equal(initialCollapsed(null, 768), true);
  assert.equal(initialCollapsed(null, 1440), false);
  assert.equal(initialCollapsed("garbage", 1440), false);
});

test("the choice round-trips through storage", () => {
  const storage = memory();
  writeSaved(storage, true);
  assert.equal(storage.getItem(SIDEBAR_KEY), "collapsed");
  assert.equal(parsePref(readSaved(storage)), "collapsed");
  writeSaved(storage, false);
  assert.equal(readSaved(storage), "expanded");
});

test("broken storage never throws", () => {
  const broken = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  assert.equal(readSaved(broken), null);
  assert.doesNotThrow(() => writeSaved(broken, true));
  assert.doesNotThrow(() => writeSaved(undefined, true));
});
