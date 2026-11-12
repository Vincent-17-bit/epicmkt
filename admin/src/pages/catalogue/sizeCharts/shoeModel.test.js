import test from "node:test";
import assert from "node:assert/strict";
import * as S from "./shoeModel.js";

test("the default table loads as text and validates, and the numbers come back as stored", () => {
  const state = S.defaultState();
  assert.ok(state.adult.length > 10);
  assert.equal(typeof state.adult[0].eu, "string");
  const v = S.validate(state);
  assert.equal(v.ok, true, v.messages.join("; "));
  assert.equal(typeof v.value.adult[0].eu, "number");
});

test("a row out of order is reported against its row, with the database wording", () => {
  const state = S.editCell(S.defaultState(), "adult", 3, "eu", "30");
  const v = S.validate(state);
  assert.equal(v.ok, false);
  assert.ok(v.rows["adult:3"]?.some((m) => /EU must be larger|EU must be/.test(m)), JSON.stringify(v.rows));
  assert.match(S.summary(v), /Fix \d+ problems? before saving/);
});

test("text that is not a number is a problem, a comma decimal is accepted", () => {
  const bad = S.editCell(S.defaultState(), "adult", 2, "cm", "abc");
  assert.equal(S.validate(bad).ok, false);
  const state = S.defaultState();
  const comma = S.editCell(state, "adult", state.adult.length - 1, "cm", "30,5");
  assert.equal(S.toChart(comma).adult.at(-1).cm, 30.5);
});

test("add continues the last row; remove keeps two adult rows; kids may be empty", () => {
  let s = S.defaultState();
  const last = s.adult.at(-1);
  const o = S.addRow(s, "adult");
  assert.equal(o.index, s.adult.length);
  assert.equal(Number(o.state.adult.at(-1).eu), Number(last.eu) + 1);
  assert.equal(S.validate(o.state).ok, true, "a continued row still rises");
  let two = { ...s, adult: s.adult.slice(0, 2) };
  assert.equal(S.removeRow(two, "adult", 0), two);
  let kids = s;
  while (kids.kids.length) kids = S.removeRow(kids, "kids", 0);
  assert.equal(S.validate(kids).ok, true);
});

test("an empty table cell for a required adult field is a problem, an empty kids UK is fine", () => {
  assert.equal(S.validate(S.editCell(S.defaultState(), "adult", 1, "uk", "")).ok, false);
  const s = S.defaultState();
  assert.equal(S.validate(s).ok, true);
  const noKidsUk = { ...s, kids: s.kids.map((r) => ({ ...r, uk: "", usM: "", usW: "" })) };
  assert.equal(S.validate(noKidsUk).ok, true);
});

test("preview shows the table as edited when valid, and the last good table when not", () => {
  const good = S.preview(S.defaultState(), "men");
  assert.equal(good.valid, true);
  assert.ok(good.rows.every((r) => "eu" in r && "uk" in r && "us" in r && "cm" in r));
  assert.ok(S.preview(S.defaultState(), "kids").rows.every((r) => !("uk" in r)));
  const broken = S.preview(S.editCell(S.defaultState(), "adult", 3, "eu", "30"), "men");
  assert.equal(broken.valid, false);
  assert.ok(broken.rows.length > 0);
});

test("try a size converts through the table as edited", () => {
  const r = S.tryConvert(S.defaultState(), "EU 42");
  assert.equal(r.ok, true);
  const text = r.lines.map((l) => l.text);
  assert.ok(text.includes("EU 42"));
  assert.ok(text.some((t) => t.startsWith("UK")));
  assert.ok(text.some((t) => t.endsWith("cm")));
  assert.equal(S.tryConvert(S.defaultState(), "banana").ok, false);
  assert.equal(S.tryConvert(S.editCell(S.defaultState(), "adult", 3, "eu", "30"), "EU 42").ok, false);
});

test("isDirty and fromChart accept the stored shape", () => {
  const stored = { chart: { adult: S.toChart(S.defaultState()).adult, kids: S.toChart(S.defaultState()).kids }, version: 3 };
  const a = S.fromChart(stored.chart);
  assert.equal(S.isDirty(a, S.fromChart(stored.chart)), false);
  assert.equal(S.isDirty(S.editCell(a, "adult", 0, "uk", "1"), a), true);
});
