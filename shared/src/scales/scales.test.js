import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  MAX_AXIS_VALUES, adoptScale, compare, defineScale, format, getScale, listScales, parse, plausible, registerScale, sizeKey, toBase, validateAxisValues
} from "./index.js";
import * as shared from "../index.js";

import { REMAINING_SCALE_IDS } from "./remaining/index.js";

const IDS = ["apparel-alpha", "apparel-numeric", "kids-age", "collar-inch", "shoe", "screen-inch", "storage", "body-measure", "ring-size"]; // A02
const ALL = [...IDS, ...REMAINING_SCALE_IDS]; // plus the 26 from A03

test("the registry holds the 9 A02 scales and the 26 A03 scales, once each", () => {
  const ids = listScales().map((s) => s.id).filter((id) => id !== "test-pack");
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual([...ids].sort(), [...ALL].sort());
  assert.equal(ids.length, 35);
});

for (const scale of listScales().filter((x) => IDS.includes(x.id))) {
  test(`${scale.id}: every documented valid example parses, and format -> parse is a round trip`, () => {
    for (const raw of scale.examples.valid) {
      const res = parse(scale.id, raw);
      assert.equal(res.ok, true, `${raw}: ${res.ok ? "" : res.error.message}`);
      assert.equal(res.value.scale, scale.id);
      assert.notEqual(typeof res.value, "string", "never bare text");
      const text = format(res.value);
      const again = parse(scale.id, text);
      assert.equal(again.ok, true, `${raw} -> ${text}: ${again.ok ? "" : again.error.message}`);
      assert.deepEqual(again.value, res.value, `${raw} -> ${text}`);
      assert.deepEqual(parse(scale.id, res.value).value, res.value, "a stored value re-validates to itself");
      assert.equal(sizeKey(again.value), sizeKey(res.value));
      assert.equal(Number.isFinite(toBase(res.value)), true);
    }
  });
  test(`${scale.id}: every documented invalid example is rejected with a code and a message`, () => {
    for (const raw of scale.examples.invalid) {
      const res = parse(scale.id, raw);
      assert.equal(res.ok, false, `${JSON.stringify(raw)} should fail`);
      assert.equal(typeof res.error.code, "string");
      assert.ok(res.error.message);
    }
  });
  test(`${scale.id}: non-string input fails cleanly`, () => {
    for (const bad of [null, undefined, {}, [], true]) assert.equal(parse(scale.id, bad).ok, false);
  });
}

test("parse: unknown scale and a value from another scale", () => {
  assert.equal(parse("nope", "1").error.code, "unknown-scale");
  const kg = parse("weight", "5 kg").value;
  assert.equal(parse("volume", kg).error.code, "scale-mismatch");
  assert.throws(() => sizeKey({ scale: "nope", value: 1 }), TypeError);
  assert.throws(() => format("42"), TypeError);
});

test("rule: shoe 42 (EU) never equals dress 42 or a 42-inch TV", () => {
  const shoe = parse("shoe", "EU 42").value;
  const tv = parse("screen-inch", "42").value;
  const dress = { scale: "apparel-numeric", system: "eu", value: 42 }; // a hand-made EU dress size; the US-only scale cannot parse it
  const keys = [shoe, tv, dress, parse("storage", "42 GB").value, parse("weight", "42 kg").value, parse("volume", "42 L").value, parse("collar-inch", "15").value, parse("ring-size", "EU 54").value].map(sizeKey);
  assert.equal(new Set(keys).size, keys.length, keys.join(" | "));
  assert.equal(sizeKey(shoe), "shoe:eu:42");
  assert.equal(sizeKey(tv), "screen-inch:-:42:in");
  assert.equal(sizeKey(dress), "apparel-numeric:eu:42");
});

test("rule: the same number under different scales or systems never shares a key (collision sweep)", () => {
  const seen = new Map();
  for (const scale of listScales()) {
    for (const raw of scale.examples.valid) {
      const v = parse(scale.id, raw).value;
      const key = sizeKey(v);
      const sig = JSON.stringify([v.scale, v.system ?? null, v.value, v.unit ?? null]);
      if (seen.has(key)) assert.equal(seen.get(key), sig, `${key} is shared by different values`);
      seen.set(key, sig);
      assert.ok(key.startsWith(`${scale.id}:`));
    }
  }
});

test('rule: "20" with no unit asks for one where a unit is needed, "20 litres" parses as 20 L', () => {
  for (const id of ["volume", "weight", "storage", "body-measure", "length"]) {
    const res = parse(id, "20");
    assert.equal(res.ok, false, id);
    assert.equal(res.error.code, "unit-required", id);
    assert.equal(res.error.needs, "unit", id);
  }
  assert.ok(parse("storage", "20").error.options.length >= 2);
  assert.equal(parse("volume", "20", { defaultUnit: "L" }).ok, true);
  const litres = parse("volume", "20 litres").value;
  assert.deepEqual([litres.scale, litres.value], ["volume", 20]);
  assert.equal(format(litres), "20 L");
  assert.equal(parse("shoe", "20").error.needs, "system");
});

test("rule: duplicates merge by sizeKey (1 TB = 1024 GB, 20 litres = 20 L, 2xl = XXL)", () => {
  assert.equal(sizeKey(parse("storage", "1 TB").value), sizeKey(parse("storage", "1024 GB").value));
  assert.equal(sizeKey(parse("volume", "20 litres").value), sizeKey(parse("volume", "20 L").value));
  assert.equal(sizeKey(parse("apparel-alpha", "2xl").value), sizeKey(parse("apparel-alpha", "XXL").value));
  assert.equal(sizeKey(parse("kids-age", "24 months").value), sizeKey(parse("kids-age", "2 years").value));
});

test("compare: a total order even across scales (scale id first)", () => {
  const list = [parse("weight", "5 kg").value, parse("shoe", "EU 42").value, parse("apparel-alpha", "M").value, parse("shoe", "EU 38").value];
  const sorted = [...list].sort(compare).map((v) => v.scale);
  assert.deepEqual(sorted, ["apparel-alpha", "shoe", "shoe", "weight"]);
});

test("plausible: wrong scale and out-of-range are refused, unusual is a warning, unknown axes pass", () => {
  const gb = parse("storage", "128 GB").value;
  assert.deepEqual(plausible("phone", "storage", gb), { ok: true });
  assert.equal(plausible("phone", "storage", parse("weight", "5 kg").value).ok, false);
  assert.equal(plausible("phone", "storage", parse("storage", "16 TB").value).ok, false);
  assert.equal(plausible("phone", "storage", parse("storage", "4 GB").value).warn.length > 0, true);
  assert.deepEqual(plausible("table", "finish", gb), { ok: true });
  assert.equal(plausible("phone", "storage", "128 GB").ok, false);
});

const axis = (scale, key = scale) => ({ key, label: key, scale, role: "button", open: false, optional: false, affectsPrice: "auto" });

test("validateAxisValues: parses, merges duplicates, orders, and reports each problem by index", () => {
  const res = validateAxisValues(axis("storage"), ["1 TB", "256 GB", "1024 GB", "128gb", "huge", "64"]);
  assert.equal(res.ok, false);
  assert.deepEqual(res.values.map((v) => format(v)), ["128 GB", "256 GB", "1 TB"]);
  assert.deepEqual(res.errors.map((e) => [e.index, e.error.code]), [[4, "not-a-number"], [5, "unit-required"]]);
  assert.deepEqual(res.warnings.map((w) => [w.index, w.code]), [[2, "duplicate"]]);
  const clean = validateAxisValues(axis("storage"), ["128 GB", "1 TB"]);
  assert.equal(clean.ok, true);
  assert.deepEqual(clean.errors, []);
});
test("validateAxisValues: accepts stored values, passes ctx, and warns about mixed systems", () => {
  const stored = parse("weight", "400 g").value;
  assert.equal(validateAxisValues(axis("weight"), [stored, "800 g"]).ok, true);
  assert.equal(validateAxisValues(axis("weight"), [parse("volume", "5 L").value]).errors[0].error.code, "scale-mismatch");
  assert.equal(validateAxisValues(axis("volume"), ["5", "10"], { defaultUnit: "L" }).ok, true);
  const mixed = validateAxisValues(axis("shoe"), ["EU 40", "UK 8"]);
  assert.equal(mixed.ok, true);
  assert.ok(mixed.warnings.some((w) => w.code === "mixed-systems"));
  const widths = validateAxisValues(axis("shoe"), ["EU 40 narrow", "EU 40 wide", "EU 40 wide"]);
  assert.equal(widths.values.length, 2);
});
test("validateAxisValues: the same size typed in two units merges (1000 g = 1 kg), different systems and labels do not", () => {
  const w = validateAxisValues(axis("weight"), ["1000 g", "1 kg", "500 g"]);
  assert.deepEqual(w.values.map((v) => format(v)), ["500 g", "1000 g"]);
  assert.deepEqual(w.warnings.map((x) => [x.index, x.code]), [[1, "duplicate"]]);
  assert.equal(validateAxisValues(axis("shoe"), ["EU 42", "UK 8"]).values.length, 2);
  assert.equal(validateAxisValues(axis("label"), ["Heavy duty", "Light", "Medium"]).values.length, 3);
  assert.equal(validateAxisValues(axis("dimensions"), ["120 x 60 x 75 cm", "1.2 x 0.6 x 0.75 m"], { typeId: undefined }).values.length >= 1, true);
});
test("validateAxisValues: type plausibility, 40-value limit, unknown scale, empty input", () => {
  const bad = validateAxisValues(axis("storage", "storage"), ["128 GB", "16 TB"], { typeId: "phone" });
  assert.equal(bad.errors[0].error.code, "implausible");
  const unusual = validateAxisValues(axis("storage", "storage"), ["4 GB"], { typeId: "phone" });
  assert.equal(unusual.ok, true);
  assert.equal(unusual.warnings[0].code, "unusual");
  const many = Array.from({ length: MAX_AXIS_VALUES + 1 }, (_, i) => `${i + 1} GB`);
  assert.equal(validateAxisValues(axis("storage"), many).errors.at(-1).error.code, "too-many-values");
  assert.equal(validateAxisValues(axis("storage"), many.slice(0, MAX_AXIS_VALUES)).ok, true);
  assert.equal(validateAxisValues(axis("nope"), ["1"]).errors[0].error.code, "unknown-scale");
  assert.equal(validateAxisValues(null, ["1"]).ok, false);
  assert.deepEqual(validateAxisValues(axis("storage"), []).values, []);
  assert.equal(validateAxisValues(axis("storage"), undefined).ok, true);
});

test("plug-in interface: a scale is one defineScale() call; bad definitions and duplicate ids are refused", () => {
  const good = defineScale({
    id: "test-pack", label: "Test pack", accepts: "n", display: "n", examples: { valid: ["3"], invalid: ["x"] },
    parse: (raw) => (/^\d+$/.test(raw) ? { ok: true, value: { value: Number(raw) } } : { ok: false, error: { code: "bad", message: "no" } }),
    format: (v) => String(v.value), toBase: (v) => v.value
  });
  registerScale(good);
  assert.equal(getScale("test-pack"), good);
  assert.deepEqual(parse("test-pack", "3").value, { scale: "test-pack", value: 3 });
  assert.equal(sizeKey(parse("test-pack", "3").value), "test-pack:-:3");
  assert.ok(compare(parse("test-pack", "2").value, parse("test-pack", "3").value) < 0);
  assert.throws(() => registerScale(good), /already registered/);
  assert.throws(() => defineScale({ id: "Bad Id" }), TypeError);
  assert.throws(() => defineScale({ id: "x-y", label: "l", accepts: "a", display: "d", examples: { valid: [], invalid: [] }, parse() {}, format() {} }), /toBase/);
  assert.throws(() => defineScale(null), TypeError);
  assert.throws(() => registerScale({}), TypeError);
});

const MODELS = ["iPhone 13", "Galaxy S21"];
const A03_SAMPLES = {
  length: ["5 m"], thickness: ["8 mm"], diameter: ["0.75 in"], gauge: ["28"], "bed-size": ["4x6"], "cross-section": ["2x4 in"], "tyre-size": ["205/55R16"],
  "paper-size": ["A4"], "print-size": ["4x6"], count: ["set of 4"], volume: ["5 L"], weight: ["5 kg"], duration: ["3 months"], portion: ["small"],
  "vehicle-class": ["saloon"], "compat-model": ["iPhone 13", { models: MODELS }], voltage: ["12 V"], power: ["9 W"], current: ["13 A"],
  "battery-capacity": ["5000 mAh"], "color-temperature": ["2700K"], "ip-rating": ["IP65"], gsm: ["80 gsm"], "frame-size": ["52-18-140"],
  dimensions: ["120 x 60 x 75 cm", { typeId: "table" }], label: ["Heavy duty"]
};
test("A03 scales work through the registry: parse adds scale, a stored value re-parses to itself, keys start with the scale id", () => {
  assert.deepEqual(Object.keys(A03_SAMPLES).sort(), [...REMAINING_SCALE_IDS].sort());
  for (const [id, [raw, ctx]] of Object.entries(A03_SAMPLES)) {
    const res = parse(id, raw, ctx ?? {});
    assert.equal(res.ok, true, `${id}: ${res.ok ? "" : res.error.message}`);
    assert.equal(res.value.scale, id);
    assert.deepEqual(parse(id, res.value, ctx ?? {}).value, res.value, `${id}: stored value`);
    assert.ok(sizeKey(res.value).startsWith(`${id}:`), `${id}: ${sizeKey(res.value)}`);
    assert.equal(typeof format(res.value), "string");
    assert.equal(compare(res.value, res.value), 0, id);
    assert.deepEqual(plausible("table", "size", res.value).ok, true, `${id}: plausible`);
  }
});
test("A03 scales: failures come back as { code, message } objects, never bare strings", () => {
  for (const id of REMAINING_SCALE_IDS.filter((x) => !["label", "count", "compat-model", "gsm", "power", "voltage", "current", "battery-capacity"].includes(x))) {
    const res = parse(id, "zzz not a size");
    assert.equal(res.ok, false, id);
    assert.equal(typeof res.error, "object", id);
    assert.equal(typeof res.error.code, "string", id);
    assert.ok(res.error.message.length > 0, id);
  }
});
test("the same text in every scale never produces the same key (the scale id is always first)", () => {
  const keys = new Map();
  for (const id of ALL) {
    for (const raw of ["5", "5 kg", "4x6", "A4"]) {
      const res = parse(id, raw, { unit: undefined, system: undefined });
      if (!res.ok) continue;
      const key = sizeKey(res.value);
      assert.ok(!keys.has(key) || keys.get(key) === id, `${key} from ${keys.get(key)} and ${id}`);
      keys.set(key, id);
    }
  }
});

test("adoptScale: refuses objects without parse, format and toBase; fits string errors", () => {
  assert.throws(() => adoptScale({ id: "x" }), TypeError);
  const a = adoptScale({ id: "adopted-test", parse: (r) => (r === "ok" ? { ok: true, value: { value: 1 } } : { ok: false, error: "Add a unit: a, b." }), format: () => "1", toBase: () => 1 });
  assert.equal(a.parse("no").error.code, "unit-required");
  assert.equal(adoptScale({ id: "y", parse: () => ({ ok: false, error: "nope" }), format() {}, toBase() {} }).parse("q").error.code, "invalid");
});

test("exports: reachable from @epicmkt/shared without clashing with existing names", () => {
  assert.equal(typeof shared.scales.parse, "function");
  assert.equal(typeof shared.sizeKey, "function");
  assert.equal(typeof shared.validateAxisValues, "function");
  assert.equal(shared.scales.parse("volume", "20 litres").ok, true);
  assert.equal(typeof shared.parse, "undefined");
  assert.equal(typeof shared.CONTRACT_VERSION, "number");
});

test("docs/contracts/scales.md lists every scale id, its accepted input and display format", () => {
  const doc = readFileSync(fileURLToPath(new URL("../../../docs/contracts/scales.md", import.meta.url)), "utf8");
  for (const s of listScales().filter((x) => IDS.includes(x.id))) {
    const row = doc.split("\n").find((l) => l.startsWith(`| \`${s.id}\``));
    assert.ok(row, `${s.id} has a row`);
    assert.ok(row.includes(s.accepts.replaceAll("|", "\\|")), `${s.id} accepted input matches the code`);
    assert.ok(row.includes(s.display.replaceAll("|", "\\|")), `${s.id} display format matches the code`);
  }
});
