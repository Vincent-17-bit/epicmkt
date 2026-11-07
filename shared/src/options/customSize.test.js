import test from "node:test";
import assert from "node:assert/strict";
import { emptyCustomSize, fieldFrom, BODY_FIELDS, DIMENSION_FIELDS, validateCustomSize, parseMeasurement, checkMeasurements, customPrice, customSizeMessage } from "./customSize.js";

const dress = () => ({ ...emptyCustomSize("size"), fields: BODY_FIELDS.slice(0, 3).map(fieldFrom), price: { mode: "fixed", base: "4500" } });
const sofa = () => ({ ...emptyCustomSize("size"), fields: DIMENSION_FIELDS.slice(0, 1).map(fieldFrom), price: { mode: "per-extra", base: "30000", perUnit: "100", field: "width", over: "180" } });

test("a tailor's config (body measurements, one price) is valid; a disabled one is never checked", () => {
  assert.equal(validateCustomSize(dress()).ok, true);
  assert.equal(validateCustomSize({ enabled: false }).ok, true);
  assert.equal(validateCustomSize(null).ok, true);
});

test("required measurements: at least one field, named, distinct, with sensible limits", () => {
  const c = dress();
  assert.ok(validateCustomSize({ ...c, fields: [] }).errors.fields);
  assert.ok(validateCustomSize({ ...c, fields: [{ ...c.fields[0], label: "" }] }).errors["fields.0.label"]);
  assert.ok(validateCustomSize({ ...c, fields: [c.fields[0], { ...c.fields[1], label: "bust" }] }).errors["fields.1.label"]);
  assert.ok(validateCustomSize({ ...c, fields: [{ ...c.fields[0], min: 100, max: 50 }] }).errors["fields.0.max"]);
});

test("price rules are validated: fixed needs a base, per-extra needs the rate, the field and where it starts", () => {
  assert.ok(validateCustomSize({ ...dress(), price: { mode: "fixed", base: "" } }).errors["price.base"]);
  assert.equal(validateCustomSize(sofa()).ok, true);
  const bad = validateCustomSize({ ...sofa(), price: { mode: "per-extra", base: "30000" } }).errors;
  assert.ok(bad["price.perUnit"] && bad["price.field"] && bad["price.over"]);
  assert.ok(validateCustomSize({ ...dress(), price: { mode: "weird", base: "1" } }).errors["price.mode"]);
});

test("a buyer's measurements are read in cm or inches and kept inside the limits", () => {
  const f = fieldFrom(BODY_FIELDS[0]);
  assert.deepEqual(parseMeasurement(f, "92"), { value: 92 });
  assert.deepEqual(parseMeasurement(f, "92 cm"), { value: 92 });
  assert.deepEqual(parseMeasurement(f, '36"'), { value: 91.4 });
  assert.deepEqual(parseMeasurement(f, "36 in"), { value: 91.4 });
  assert.match(parseMeasurement(f, "5").error, /between 60 and 200 cm/);
  assert.match(parseMeasurement(f, "big").error, /as a number/);
});

test("required fields must be filled; optional ones may stay empty", () => {
  const c = dress();
  const none = checkMeasurements(c, { bust: "92" });
  assert.equal(none.ok, false);
  assert.match(none.errors.waist, /Enter waist in cm/);
  const all = checkMeasurements(c, { bust: "92", waist: "74", hips: "100" });
  assert.deepEqual([all.ok, all.values], [true, { bust: 92, waist: 74, hips: 100 }]);
  const optional = { ...c, fields: c.fields.map((f, i) => (i === 2 ? { ...f, required: false } : f)) };
  assert.equal(checkMeasurements(optional, { bust: "92", waist: "74" }).ok, true);
});

test("price rule: fixed gives the base; base + per extra unit charges only above the starting size", () => {
  assert.equal(customPrice(dress(), {}), 4500);
  assert.equal(customPrice(sofa(), { width: 180 }), 30000);
  assert.equal(customPrice(sofa(), { width: 170 }), 30000);
  assert.equal(customPrice(sofa(), { width: 200 }), 32000);
  assert.equal(customPrice(sofa(), { width: 200.5 }), 32100, "a part unit rounds up");
  assert.equal(customPrice(sofa(), {}), null, "no price until the measurement is given");
});

test("the message to the seller says exactly what the buyer chose", () => {
  assert.equal(customSizeMessage("Wrap dress", dress(), { bust: 92, waist: 74, hips: 100 }, 4500), "Wrap dress, Made to measure: Bust 92 cm, Waist 74 cm, Hips 100 cm, KES 4,500");
  assert.equal(customSizeMessage("Sofa", sofa(), { width: 200 }, null), "Sofa, Made to measure: Width 200 cm");
});

import { customSizePayload } from "./customSize.js";
test("the saved config has numbers and no leftovers; off saves null", () => {
  const p = customSizePayload(sofa());
  assert.deepEqual(p.price, { mode: "per-extra", base: 30000, perUnit: 100, field: "width", over: 180 });
  assert.equal(typeof p.fields[0].min, "number");
  assert.equal(customSizePayload({ enabled: false }), null);
  assert.equal(customSizePayload(undefined), null);
});
