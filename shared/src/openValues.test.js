import test from "node:test";
import assert from "node:assert/strict";
import { normalizeValueKey, cleanValueLabel, validateOpenValue, matchOpenValues, matchRank, isHexColor, KEY_CASES, VALUE_KINDS, MAX_LABEL } from "./openValues.js";

test("normalizeValueKey: the shared table", () => {
  for (const [raw, key] of KEY_CASES) assert.equal(normalizeValueKey(raw), key, JSON.stringify(raw));
});

test("Samsung, SAMSUNG and samsung are one filter choice", () => {
  assert.equal(new Set(["Samsung", "SAMSUNG", "samsung", " Samsung "].map(normalizeValueKey)).size, 1);
});

test("normalizeValueKey: not text gives an empty key", () => {
  for (const v of [null, undefined, 5, {}, [], true]) assert.equal(normalizeValueKey(v), "");
});

test("normalizeValueKey: idempotent and never has edge or double spaces", () => {
  for (const [raw] of KEY_CASES) {
    const k = normalizeValueKey(raw);
    assert.equal(normalizeValueKey(k), k);
    assert.equal(k, k.trim());
    assert.ok(!k.includes("  "));
  }
});

test("normalizeValueKey: non-Latin letters pass through", () => {
  assert.equal(normalizeValueKey("ブランド"), "ブランド");
  assert.equal(normalizeValueKey("أحمر"), "أحمر");
});

test("cleanValueLabel keeps the typed case but folds spaces", () => {
  assert.equal(cleanValueLabel("  Wine \t red  "), "Wine red");
  assert.equal(cleanValueLabel(null), "");
});

test("validateOpenValue: accepts a plain value and returns the key", () => {
  const r = validateOpenValue({ kind: "material", label: "  Mahogany   veneer ", tags: ["Precious Metal", "precious-metal"] });
  assert.deepEqual(r, { ok: true, value: { kind: "material", label: "Mahogany veneer", key: "mahogany veneer", hex: null, tags: ["precious-metal"] } });
});

test("validateOpenValue: colour shade", () => {
  assert.equal(validateOpenValue({ kind: "color", label: "Wine red", hex: "#7B1E3A" }).value.hex, "#7b1e3a");
  assert.equal(validateOpenValue({ kind: "color", label: "Wine red", hex: "red" }).error.code, "invalid_hex");
  assert.equal(validateOpenValue({ kind: "brand", label: "Samsung", hex: "#ffffff" }).error.code, "hex_not_allowed");
  assert.equal(validateOpenValue({ kind: "color", label: "Wine red", hex: "" }).value.hex, null);
});

test("validateOpenValue: refusals", () => {
  assert.equal(validateOpenValue({ kind: "size", label: "x" }).error.code, "invalid_kind");
  assert.equal(validateOpenValue({ kind: "brand", label: "---" }).error.code, "invalid_label");
  assert.equal(validateOpenValue({ kind: "brand", label: "a".repeat(MAX_LABEL + 1) }).error.code, "label_too_long");
  assert.equal(validateOpenValue({ kind: "brand", label: "ok", tags: ["!!"] }).error.code, "invalid_tag");
  assert.equal(validateOpenValue({ kind: "brand", label: "ok", tags: Array.from({ length: 9 }, (_, i) => `t${i}`) }).error.code, "too_many_tags");
  assert.equal(validateOpenValue(null).error.code, "invalid_kind");
  assert.deepEqual(VALUE_KINDS, ["material", "color", "brand", "finish", "flavour"]);
});

test("isHexColor", () => {
  assert.ok(isHexColor("#a1B2c3"));
  for (const v of ["a1b2c3", "#abc", "#gggggg", null, 5]) assert.equal(isHexColor(v), false);
});

test("matchRank", () => {
  assert.equal(matchRank("mahogany", "mahogany"), 0);
  assert.equal(matchRank("mahogany veneer", "mahog"), 1);
  assert.equal(matchRank("african mahogany", "mahog"), 2);
  assert.equal(matchRank("oak", "mahog"), -1);
  assert.equal(matchRank("oak", ""), -1);
});

test('matchOpenValues: "Mahog..." finds Mahogany and Mahogany veneer; merged and other kinds are hidden', () => {
  const list = [
    { id: 1, kind: "material", label: "Mahogany veneer", status: "pending", use_count: 9 },
    { id: 2, kind: "material", label: "Mahogany", status: "approved", use_count: 3 },
    { id: 3, kind: "material", label: "Mahogoni", status: "merged" },
    { id: 4, kind: "brand", label: "Mahogany Co", status: "approved" },
    { id: 5, kind: "material", label: "African mahogany", status: "approved" },
    { id: 6, kind: "material", label: "Oak", status: "approved" }
  ];
  assert.deepEqual(matchOpenValues(list, "material", "Mahog").map((v) => v.id), [2, 1, 5]);
  assert.deepEqual(matchOpenValues(list, "material", "MAHOGANY").map((v) => v.id), [2, 1, 5]);
  assert.deepEqual(matchOpenValues(list, "material", "").map((v) => v.id), []);
  assert.deepEqual(matchOpenValues(list, "material", "mahog", { limit: 1 }).map((v) => v.id), [2]);
});
