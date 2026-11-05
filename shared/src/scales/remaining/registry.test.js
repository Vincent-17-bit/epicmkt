import { test } from "node:test";
import assert from "node:assert/strict";
import { REMAINING_SCALES, REMAINING_SCALE_IDS, remainingScale, registerRemainingScales } from "./index.js";

const MODELS = ["iPhone 13", "Galaxy S21"];
// One good input (plus context) for every scale. Every id in REMAINING_SCALE_IDS must appear here.
const SAMPLES = {
  length: [["5 m"], ["5 cm"], ["5 mm"], ["5 ft"], ["5 in"]],
  thickness: [["5 mm"], ["5 in"]],
  diameter: [["5 mm"], ["5 in"]],
  gauge: [["28"], ["0.5 mm"]],
  "bed-size": [["4x6"], ["5x6"]],
  "cross-section": [["2x4 in"], ["2.5 mm2"]],
  "tyre-size": [["205/55R16"]],
  "paper-size": [["A4"]],
  "print-size": [["4x6"]],
  count: [["set of 4"], ["pack of 4"], ["4-seater"], ["4"]],
  volume: [["5 L"], ["5 ml"]],
  weight: [["5 kg"], ["5 g"]],
  duration: [["5 min"], ["5 h"], ["5 days"], ["5 weeks"], ["5 months"], ["5 years"]],
  portion: [["small"], ["half plate"]],
  "vehicle-class": [["saloon"]],
  "compat-model": [["iPhone 13", { models: MODELS }]],
  voltage: [["5 V"]], power: [["5 W"]], current: [["5 A"]], "battery-capacity": [["5000 mAh"]],
  "color-temperature": [["2700K"], ["warm"]], "ip-rating": [["IP65"]], gsm: [["80 gsm"]], "frame-size": [["52-18-140"]],
  dimensions: [["120 x 60 x 75 cm", { typeId: "table" }], ["Ø90 x 75 cm", { typeId: "table" }]],
  label: [["5"], ["Heavy duty"]]
};

// The same text through every scale: when two scales both accept it, their keys must still differ.
const SAME_TEXT = ["4x6", "5", "5 kg", "5 L", "A4", "52-18-140", "set of 4", "IP65", "2700K", "28", "iPhone 13"];

test("the 26 scales from the A03 brief are all here, once each", () => {
  const wanted = ["length", "dimensions", "bed-size", "thickness", "diameter", "gauge", "cross-section", "tyre-size", "paper-size", "print-size", "count", "volume", "weight", "duration", "portion", "vehicle-class", "compat-model", "voltage", "power", "current", "battery-capacity", "color-temperature", "ip-rating", "gsm", "frame-size", "label"];
  assert.deepEqual([...REMAINING_SCALE_IDS].sort(), [...wanted].sort());
  assert.equal(new Set(REMAINING_SCALE_IDS).size, REMAINING_SCALE_IDS.length);
  assert.equal(remainingScale("length").id, "length");
  assert.equal(remainingScale("nope"), null);
});
test("every scale exposes the Contract v1 functions", () => {
  for (const s of REMAINING_SCALES) {
    for (const fn of ["parse", "format", "sizeKey", "compare", "toBase", "plausible"]) assert.equal(typeof s[fn], "function", `${s.id}.${fn}`);
    assert.ok(SAMPLES[s.id], `${s.id} has samples`);
  }
});
test("stored values are never bare text: {scale, system?, value, unit?, width?, shape?}", () => {
  const allowed = new Set(["scale", "system", "value", "unit", "width", "shape"]);
  for (const s of REMAINING_SCALES) for (const [raw, ctx] of SAMPLES[s.id]) {
    const r = s.parse(raw, ctx);
    assert.equal(r.ok, true, `${s.id} ${raw}: ${r.error}`);
    assert.equal(typeof r.value, "object");
    assert.equal(r.value.scale, s.id);
    assert.notEqual(r.value.value, undefined);
    for (const k of Object.keys(r.value)) assert.ok(allowed.has(k), `${s.id} stores unknown key ${k}`);
  }
});
test("sizeKey is scale:system:value[:unit] and starts with the scale id", () => {
  for (const s of REMAINING_SCALES) for (const [raw, ctx] of SAMPLES[s.id]) {
    const v = s.parse(raw, ctx).value;
    const key = s.sizeKey(v);
    const segs = key.split(":");
    assert.equal(segs[0], s.id, key);
    assert.ok(segs.length === 3 || segs.length === 4, `${key} has ${segs.length} segments`);
    assert.ok(segs.every((x) => x.length > 0), key);
    assert.equal(key, s.sizeKey(JSON.parse(JSON.stringify(v))));
  }
});
test("no scale collides with another in sizeKey", () => {
  const seen = new Map();
  for (const s of REMAINING_SCALES) for (const [raw, ctx] of SAMPLES[s.id]) {
    const key = s.sizeKey(s.parse(raw, ctx).value);
    assert.equal(seen.has(key), false, `${key} from ${s.id} already used by ${seen.get(key)}`);
    seen.set(key, s.id);
  }
  for (const text of SAME_TEXT) {
    const keys = [];
    for (const s of REMAINING_SCALES) {
      for (const ctx of [{}, { typeId: "table", unit: "cm", models: MODELS }, { unit: "ft" }, { unit: "in" }]) {
        const r = s.parse(text, ctx);
        if (r.ok) keys.push([s.id, s.sizeKey(r.value)]);
      }
    }
    const byKey = new Map();
    for (const [id, key] of keys) {
      if (byKey.has(key)) assert.equal(byKey.get(key), id, `"${text}": ${key} from ${byKey.get(key)} and ${id}`);
      byKey.set(key, id);
    }
  }
});
test("distinct values in one scale give distinct keys; equal values give equal keys", () => {
  for (const s of REMAINING_SCALES) {
    const keys = SAMPLES[s.id].map(([raw, ctx]) => s.sizeKey(s.parse(raw, ctx).value));
    assert.equal(new Set(keys).size, keys.length, s.id);
  }
});
test("stored values parse back to themselves (idempotent)", () => {
  for (const s of REMAINING_SCALES) for (const [raw, ctx] of SAMPLES[s.id]) {
    const v = s.parse(raw, ctx).value;
    const again = s.parse(JSON.parse(JSON.stringify(v)), ctx);
    assert.equal(again.ok, true, `${s.id}: ${again.error}`);
    assert.deepEqual(again.value, v, s.id);
  }
});
test("a stored value from another scale is refused", () => {
  const foreign = { scale: "nope", value: 5, unit: "kg" };
  for (const s of REMAINING_SCALES) {
    const r = s.parse(foreign, { models: MODELS, open: false });
    assert.equal(r.ok, false, `${s.id} accepted a value of scale "nope"`);
  }
});
test("methods work when detached from the object (no hidden this)", () => {
  for (const s of REMAINING_SCALES) {
    const { parse, format, sizeKey, compare, toBase, plausible } = s;
    for (const [raw, ctx] of SAMPLES[s.id]) {
      const v = parse(raw, ctx).value;
      assert.equal(typeof format(v), "string");
      assert.equal(typeof sizeKey(v), "string");
      assert.equal(compare(v, v), 0);
      assert.ok(toBase(v) === null || typeof toBase(v) === "number" || Array.isArray(toBase(v)));
      assert.equal(plausible("some-type", "some-axis", v).ok, true, `${s.id} sample should be plausible`);
    }
  }
});
test("compare is a consistent order (antisymmetric and sortable)", () => {
  for (const s of REMAINING_SCALES) {
    const vs = SAMPLES[s.id].map(([raw, ctx]) => s.parse(raw, ctx).value);
    for (const a of vs) for (const b of vs) assert.equal((Math.sign(s.compare(a, b)) || 0), (-Math.sign(s.compare(b, a)) || 0), `${s.id} ${s.sizeKey(a)} vs ${s.sizeKey(b)}`);
    assert.doesNotThrow(() => [...vs].sort(s.compare));
  }
});
test("parse never throws on junk and always answers {ok}", () => {
  const junk = [undefined, null, "", "   ", "💥", {}, [], NaN, Infinity, -1, 0, true, "1e999", "9".repeat(400), { scale: "x" }, "'; DROP TABLE;--", "a:b:c"];
  for (const s of REMAINING_SCALES) for (const j of junk) {
    let r;
    assert.doesNotThrow(() => { r = s.parse(j, {}); }, `${s.id} ${String(j).slice(0, 20)}`);
    assert.equal(typeof r.ok, "boolean");
    if (!r.ok) assert.equal(typeof r.error, "string");
    else assert.equal(r.value.scale, s.id);
  }
});
test("keys never contain a colon inside a segment, even for hostile labels", () => {
  for (const id of ["label", "compat-model"]) {
    const s = remainingScale(id);
    const v = s.parse("Size: A:B:C", { open: true }).value;
    assert.equal(s.sizeKey(v).split(":").length, 3);
  }
});
test("registerRemainingScales hands every scale to the registry callback", () => {
  const got = new Map();
  registerRemainingScales((id, scale) => got.set(id, scale));
  assert.equal(got.size, REMAINING_SCALES.length);
  for (const s of REMAINING_SCALES) assert.equal(got.get(s.id), s);
});
