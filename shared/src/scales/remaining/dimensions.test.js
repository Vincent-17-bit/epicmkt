import { test } from "node:test";
import assert from "node:assert/strict";
import { dimensions as d, dimensionLabels, dimensionProfileId, parts } from "./dimensions.js";

const ok = (raw, ctx) => { const r = d.parse(raw, ctx); assert.equal(r.ok, true, `${JSON.stringify(raw)}: ${r.error}`); return r.value; };
const no = (raw, ctx) => { const r = d.parse(raw, ctx); assert.equal(r.ok, false, `${JSON.stringify(raw)} should be rejected`); return r.error; };

test("labels per product type", () => {
  assert.deepEqual(dimensionLabels("table"), ["Length", "Width", "Height"]);
  assert.deepEqual(dimensionLabels("sofa"), ["Width", "Depth", "Height"]);
  assert.deepEqual(dimensionLabels("door"), ["Width", "Height"]);
  assert.deepEqual(dimensionLabels("table", "round"), ["Diameter", "Height"]);
  assert.equal(dimensionProfileId("table", "round"), "round-table");
  assert.deepEqual(dimensionLabels("unknown-type"), ["Length", "Width", "Height"]);
});
test("rectangular: formats, separators, units", () => {
  const v = ok("120 x 60 x 75 cm", { typeId: "table" });
  assert.deepEqual(v, { scale: "dimensions", system: "rectangular", shape: "rectangular", value: "120x60x75", unit: "cm" });
  assert.deepEqual(parts(v), [120, 60, 75]);
  assert.equal(ok("120×60×75 cm", { typeId: "table" }).value, "120x60x75");
  assert.equal(ok("120 by 60 by 75 cm", { typeId: "table" }).value, "120x60x75");
  assert.equal(ok("1.2 x 0.6 x 0.75 m", { typeId: "table" }).unit, "m");
  assert.equal(ok("120cm x 60cm x 75cm", { typeId: "table" }).unit, "cm");
  assert.equal(ok("4 ft x 2 ft x 3 ft", { typeId: "table" }).unit, "ft");
  assert.equal(ok("120x60x75", { typeId: "table", unit: "cm" }).unit, "cm");
  assert.equal(ok({ length: 120, width: 60, height: 75, unit: "cm" }, { typeId: "table" }).value, "120x60x75");
  assert.equal(ok({ values: [90, 210], unit: "cm" }, { typeId: "door" }).value, "90x210");
});
test("door, sofa and generic counts", () => {
  assert.equal(ok("90 x 210 cm", { typeId: "door" }).value, "90x210");
  no("90 x 210 x 5 cm", { typeId: "door" });
  assert.equal(ok("200 x 90 x 85 cm", { typeId: "sofa" }).value, "200x90x85");
  no("200 x 90 cm", { typeId: "sofa" });
  assert.equal(ok("30 x 40 cm", { typeId: "poster" }).value, "30x40");
  assert.equal(ok("30 x 40 x 5 cm").value, "30x40x5");
  no("30 cm"); no("1x2x3x4 cm");
});
test("round: Diameter x Height", () => {
  const v = ok("Ø90 x 75 cm", { typeId: "table" });
  assert.equal(v.shape, "round"); assert.equal(v.system, "round"); assert.equal(v.value, "90x75");
  assert.equal(ok("dia 90 x 75 cm", { typeId: "table" }).shape, "round");
  assert.equal(ok("90 x 75 cm", { typeId: "table", shape: "round" }).shape, "round");
  assert.equal(ok("Ø 60 cm").value, "60");
  no("Ø90 cm", { typeId: "table" });
  assert.equal(d.format(v, { typeId: "table" }), "Ø 90 × 75 cm");
  assert.equal(d.format(v, { typeId: "table", labels: true }), "Ø 90 × H 75 cm");
});
test("rejects bad input", () => {
  no(""); no("a x b x c cm"); no("120 x 60 x 75"); no("120 cm x 60 in x 75 cm"); no("0 x 60 x 75 cm", { typeId: "table" });
  no("120 x -60 x 75 cm", { typeId: "table" }); no("120 x 60 x 75 parsec", { typeId: "table" });
  no("120 x 60 x 90000 cm", { typeId: "table" });
  no({ scale: "length", value: 5, unit: "m" });
});
test("format is unit aware", () => {
  const v = ok("120 x 60 x 75 cm", { typeId: "table" });
  assert.equal(d.format(v), "120 × 60 × 75 cm");
  assert.equal(d.format(v, { typeId: "table", labels: true }), "L 120 × W 60 × H 75 cm");
  assert.equal(d.format(ok("1200 x 600 x 750 mm", { typeId: "table" }), { unit: "cm" }), "120 × 60 × 75 cm");
});
test("plausible: a table 750 cm high warns, 7500 cm is rejected", () => {
  const high = ok("120 x 60 x 750 cm", { typeId: "table" });
  const r = d.plausible("table", "size", high);
  assert.equal(r.ok, true); assert.match(r.warn, /Height 750 cm/);
  assert.equal(d.plausible("table", "size", ok("120 x 60 x 75 cm", { typeId: "table" })).warn, undefined);
  assert.equal(d.plausible("table", "size", { scale: "dimensions", system: "rectangular", shape: "rectangular", value: "120x60x7500", unit: "cm" }).ok, false);
  assert.match(d.plausible("table", "size", ok("60 x 120 x 75 cm", { typeId: "table" })).warn, /bigger than Length/);
  assert.match(d.plausible("door", "size", ok("210 x 90 cm", { typeId: "door" })).warn, /Height 90 cm is less than usual/);
  assert.match(d.plausible("door", "size", ok("200 x 190 cm", { typeId: "door" })).warn, /Width is bigger than Height/);
  assert.equal(d.plausible("door", "size", ok("90 x 210 cm", { typeId: "door" })).warn, undefined);
  assert.match(d.plausible("sofa", "size", ok("20 x 90 x 85 cm", { typeId: "sofa" })).warn, /less than usual/);
  assert.match(d.plausible("table", "size", ok("Ø 900 x 75 cm", { typeId: "table" })).warn, /Diameter 900/);
});
test("sizeKey separates round from rectangular and units", () => {
  assert.equal(d.sizeKey(ok("120 x 60 x 75 cm", { typeId: "table" })), "dimensions:rectangular:120x60x75:cm");
  assert.notEqual(d.sizeKey(ok("Ø90 x 75 cm", { typeId: "table" })), d.sizeKey(ok("90 x 75 cm", { typeId: "door" })));
  assert.notEqual(d.sizeKey(ok("120 x 60 x 75 cm", { typeId: "table" })), d.sizeKey(ok("120 x 60 x 75 in", { typeId: "table" })));
});
test("toBase and compare", () => {
  assert.deepEqual(d.toBase(ok("12 x 6 x 7.5 cm", { typeId: "table" })), [120, 60, 75]);
  assert.equal(d.compare(ok("120 x 60 x 75 cm", { typeId: "table" }), ok("1200 x 600 x 750 mm", { typeId: "table" })), 0);
  assert.ok(d.compare(ok("120 x 60 x 75 cm", { typeId: "table" }), ok("150 x 60 x 75 cm", { typeId: "table" })) < 0);
  const sorted = ["150x80x75", "120x60x75", "180x90x75"].map((s) => ok(s + " cm", { typeId: "table" })).sort(d.compare).map((v) => v.value);
  assert.deepEqual(sorted, ["120x60x75", "150x80x75", "180x90x75"]);
});
