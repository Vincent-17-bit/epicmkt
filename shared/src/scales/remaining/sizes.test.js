import { test } from "node:test";
import assert from "node:assert/strict";
import { bedSize, crossSection, tyreSize, paperSize, printSize, frameSize, PAPER_SIZES } from "./sizes.js";

const ok = (s, raw, ctx) => { const r = s.parse(raw, ctx); assert.equal(r.ok, true, `${s.id} ${JSON.stringify(raw)}: ${r.error}`); return r.value; };
const no = (s, raw, ctx) => { const r = s.parse(raw, ctx); assert.equal(r.ok, false, `${s.id} ${JSON.stringify(raw)} should be rejected`); assert.ok(r.error); };

test("bed-size: ft by ft, width first", () => {
  assert.deepEqual(ok(bedSize, "4 x 6"), { scale: "bed-size", value: "4x6", unit: "ft", width: 4 });
  assert.equal(ok(bedSize, "5 by 6").value, "5x6");
  assert.equal(ok(bedSize, "4ft x 6ft").value, "4x6");
  assert.equal(ok(bedSize, "6x4").value, "4x6");
  assert.equal(ok(bedSize, "3.5 x 6").value, "3.5x6");
  assert.equal(bedSize.format(ok(bedSize, "4x6")), "4 x 6 ft");
  assert.equal(bedSize.sizeKey(ok(bedSize, "4x6")), "bed-size:-:4x6:ft");
  assert.ok(bedSize.compare(ok(bedSize, "4x6"), ok(bedSize, "5x6")) < 0);
  assert.ok(bedSize.toBase(ok(bedSize, "6x6")) > bedSize.toBase(ok(bedSize, "4x6")));
  no(bedSize, "4"); no(bedSize, "4 x 6 x 7"); no(bedSize, "4 x 6 cm"); no(bedSize, "0 x 6"); no(bedSize, "a x b"); no(bedSize, "4 x 60");
  assert.equal(bedSize.plausible("bed", "size", ok(bedSize, "4x6")).warn, undefined);
  assert.match(bedSize.plausible("bed", "size", ok(bedSize, "1.5 x 6")).warn, /wide/);
  assert.match(bedSize.plausible("bed", "size", ok(bedSize, "4 x 3")).warn ?? "", /long|wide/);
  assert.match(bedSize.plausible("bed", "size", ok(bedSize, "4 x 10")).warn, /long/);
});
test("cross-section: timber and wire", () => {
  assert.deepEqual(ok(crossSection, "2x4", { unit: "in" }), { scale: "cross-section", system: "rect", shape: "rect", value: "2x4", unit: "in", width: 2 });
  assert.equal(ok(crossSection, "4 x 2 in").value, "2x4");
  assert.equal(ok(crossSection, "50 x 100 mm").unit, "mm");
  assert.deepEqual(ok(crossSection, "2.5 mm²"), { scale: "cross-section", system: "area", shape: "area", value: 2.5, unit: "mm2" });
  for (const t of ["2.5mm2", "2.5 sq mm", "2.5 mm^2", "1.5 square mm"]) assert.equal(ok(crossSection, t).shape, "area");
  assert.equal(crossSection.format(ok(crossSection, "2.5 mm2")), "2.5 mm²");
  assert.equal(crossSection.format(ok(crossSection, "2x4 in")), "2 x 4 in");
  assert.equal(crossSection.sizeKey(ok(crossSection, "2.5 mm2")), "cross-section:area:2.5:mm2");
  assert.equal(crossSection.sizeKey(ok(crossSection, "50x100 mm")), "cross-section:rect:50x100:mm");
  assert.equal(crossSection.toBase(ok(crossSection, "50x100 mm")), 5000);
  assert.equal(crossSection.compare(ok(crossSection, "2 x 4 in"), ok(crossSection, "50 x 100 mm")) > 0, true);
  assert.ok(crossSection.compare(ok(crossSection, "1.5 mm2"), ok(crossSection, "2.5 mm2")) < 0);
  assert.ok(crossSection.compare(ok(crossSection, "2 x 4 in"), ok(crossSection, "2.5 mm2")) < 0);
  no(crossSection, "2 x 4"); no(crossSection, ""); no(crossSection, "0 mm2"); no(crossSection, "99999 mm2"); no(crossSection, "2 x 4 m");
  assert.equal(crossSection.plausible("wire", "size", ok(crossSection, "2.5 mm2")).warn, undefined);
  assert.match(crossSection.plausible("wire", "size", ok(crossSection, "2000 mm2")).warn, /usual wire/);
  assert.match(crossSection.plausible("timber", "size", ok(crossSection, "1 x 100 mm")).warn, /usual timber/);
  assert.equal(crossSection.plausible("timber", "size", ok(crossSection, "2 x 4 in")).warn, undefined);
});
test("tyre-size: 205/55 R16", () => {
  assert.deepEqual(ok(tyreSize, "205/55 R16"), { scale: "tyre-size", system: "metric", value: "205/55R16", width: 205 });
  for (const t of ["205/55R16", "205/55 r16", "205/55ZR16", "205/55-16", "205 / 55 R 16"]) assert.equal(ok(tyreSize, t).value, "205/55R16", t);
  assert.equal(ok(tyreSize, "195R15").value, "195R15");
  assert.equal(ok(tyreSize, "195/70R15C").value, "195/70R15C");
  assert.equal(tyreSize.format(ok(tyreSize, "205/55R16")), "205/55 R16");
  assert.equal(tyreSize.sizeKey(ok(tyreSize, "205/55 R16")), "tyre-size:metric:205/55R16");
  assert.notEqual(tyreSize.sizeKey(ok(tyreSize, "205/55R16")), tyreSize.sizeKey(ok(tyreSize, "205/55R17")));
  assert.ok(Math.abs(tyreSize.toBase(ok(tyreSize, "205/55R16")) - 631.9) < 0.01);
  assert.ok(tyreSize.compare(ok(tyreSize, "195/65R15"), ok(tyreSize, "205/55R16")) < 0);
  assert.ok(tyreSize.compare(ok(tyreSize, "195/65R15"), ok(tyreSize, "205/65R15")) < 0);
  no(tyreSize, "205/55"); no(tyreSize, "abc"); no(tyreSize, "905/55R16"); no(tyreSize, "205/05R16"); no(tyreSize, "205/55R60"); no(tyreSize, "");
  assert.deepEqual(tyreSize.plausible("tyre", "size", ok(tyreSize, "205/55R16")), { ok: true });
  assert.match(tyreSize.plausible("tyre", "size", ok(tyreSize, "207/55R16")).warn, /steps of 5/);
  assert.match(tyreSize.plausible("tyre", "size", ok(tyreSize, "205/57R16")).warn, /steps of 5/);
  assert.match(tyreSize.plausible("tyre", "size", ok(tyreSize, "115/55R16")).warn, /unusual/);
  assert.match(tyreSize.plausible("tyre", "size", ok(tyreSize, "205/55R28")).warn, /rim/);
});
test("paper-size: fixed list", () => {
  for (const id of ["A3", "A4", "A5", "A6", "DL", "C4", "C5"]) assert.equal(ok(paperSize, id.toLowerCase()).value, id);
  assert.equal(ok(paperSize, "A-4 paper").value, "A4");
  assert.equal(ok(paperSize, "a 4").value, "A4");
  assert.equal(ok(paperSize, "letter").system, "us");
  assert.equal(ok(paperSize, "A4").system, "iso");
  assert.equal(paperSize.format(ok(paperSize, "A4"), { dimensions: true }), "A4 (210 × 297 mm)");
  assert.equal(paperSize.sizeKey(ok(paperSize, "A4")), "paper-size:iso:A4");
  assert.equal(paperSize.toBase(ok(paperSize, "A4")), 210 * 297);
  assert.deepEqual(["A5", "A3", "A4"].map((x) => ok(paperSize, x)).sort(paperSize.compare).map((v) => v.value), ["A5", "A4", "A3"]);
  assert.equal(new Set(PAPER_SIZES.map((p) => p.id)).size, PAPER_SIZES.length);
  no(paperSize, "A9"); no(paperSize, ""); no(paperSize, "4A");
  assert.equal(paperSize.plausible("printing", "paper", ok(paperSize, "A4")).warn, undefined);
  assert.match(paperSize.plausible("printing", "paper", ok(paperSize, "A0")).warn, /large-format/);
  assert.equal(paperSize.plausible("banner", "paper", ok(paperSize, "A0")).warn, undefined);
});
test("print-size: inches, cm, lab names", () => {
  assert.deepEqual(ok(printSize, "4x6"), { scale: "print-size", value: "4x6", unit: "in", width: 4 });
  assert.equal(ok(printSize, "8 x 10 in").value, "8x10");
  assert.deepEqual(ok(printSize, "10 x 15 cm"), { scale: "print-size", value: "10x15", unit: "cm", width: 10 });
  assert.equal(ok(printSize, "6x4").value, "4x6");
  assert.equal(ok(printSize, "4R").value, "4x6");
  assert.equal(ok(printSize, "8r").value, "8x10");
  assert.equal(ok(printSize, "12R").value, "12x18");
  assert.equal(ok(printSize, "20x30", { unit: "cm" }).unit, "cm");
  assert.equal(printSize.format(ok(printSize, "4R")), "4 x 6 in");
  assert.equal(printSize.sizeKey(ok(printSize, "4x6")), "print-size:-:4x6:in");
  assert.notEqual(printSize.sizeKey(ok(printSize, "4x6 in")), printSize.sizeKey(ok(printSize, "4x6 cm")));
  assert.ok(printSize.compare(ok(printSize, "4x6"), ok(printSize, "8x10")) < 0);
  assert.equal(printSize.compare(ok(printSize, "10 x 15 cm"), ok(printSize, "3.937 x 5.906 in")) <= 0, true);
  no(printSize, "4"); no(printSize, "0 x 6"); no(printSize, "4 x 6 ft"); no(printSize, "9R"); no(printSize, "500 x 600");
  assert.equal(printSize.plausible("photo", "print", ok(printSize, "4x6")).warn, undefined);
  assert.match(printSize.plausible("photo", "print", ok(printSize, "2 x 3 cm")).warn, /unusual/);
  assert.match(printSize.plausible("photo", "print", ok(printSize, "40 x 60 in")).warn, /unusual/);
});
test("frame-size: eye-bridge-temple", () => {
  assert.deepEqual(ok(frameSize, "52-18-140"), { scale: "frame-size", value: "52-18-140", unit: "mm", width: 52 });
  for (const t of ["52/18/140", "52□18-140", "52 18 140", "52-18-140mm", " 52-18-140 "]) assert.equal(ok(frameSize, t).value, "52-18-140", t);
  assert.equal(frameSize.format(ok(frameSize, "52-18-140")), "52-18-140");
  assert.equal(frameSize.format(ok(frameSize, "52-18-140"), { labels: true }), "Eye 52 · Bridge 18 · Temple 140 mm");
  assert.equal(frameSize.sizeKey(ok(frameSize, "52-18-140")), "frame-size:-:52-18-140:mm");
  assert.equal(frameSize.toBase(ok(frameSize, "52-18-140")), 52);
  assert.ok(frameSize.compare(ok(frameSize, "50-18-140"), ok(frameSize, "52-18-140")) < 0);
  assert.ok(frameSize.compare(ok(frameSize, "52-16-140"), ok(frameSize, "52-18-140")) < 0);
  no(frameSize, "52-18"); no(frameSize, "90-18-140"); no(frameSize, "52-40-140"); no(frameSize, "52-18-200"); no(frameSize, "abc"); no(frameSize, "");
  assert.deepEqual(frameSize.plausible("glasses", "frame", ok(frameSize, "52-18-140")), { ok: true });
  assert.match(frameSize.plausible("glasses", "frame", ok(frameSize, "35-18-140")).warn, /Eye size 35/);
  assert.match(frameSize.plausible("glasses", "frame", ok(frameSize, "52-10-140")).warn, /Bridge 10/);
  assert.match(frameSize.plausible("glasses", "frame", ok(frameSize, "52-18-105")).warn, /Temple 105/);
});
test("sizes: stored values parse back to themselves", () => {
  for (const [s, raw, ctx] of [[bedSize, "4x6"], [crossSection, "2x4 in"], [crossSection, "2.5 mm2"], [tyreSize, "205/55R16"], [paperSize, "A4"], [printSize, "4x6"], [frameSize, "52-18-140"]]) {
    const v = ok(s, raw, ctx);
    const again = s.parse(JSON.parse(JSON.stringify(v)), ctx);
    assert.equal(again.ok, true, `${s.id}: ${again.error}`);
    assert.deepEqual(again.value, v);
  }
});
