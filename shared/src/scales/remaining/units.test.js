import { test } from "node:test";
import assert from "node:assert/strict";
import { length, thickness, diameter, volume, weight, duration, power, voltage, current, batteryCapacity, gsm } from "./units.js";

const ok = (s, raw, ctx) => { const r = s.parse(raw, ctx); assert.equal(r.ok, true, `${s.id} ${JSON.stringify(raw)}: ${r.error}`); return r.value; };
const no = (s, raw, ctx) => { const r = s.parse(raw, ctx); assert.equal(r.ok, false, `${s.id} ${JSON.stringify(raw)} should be rejected`); assert.ok(r.error); return r.error; };

test("length: units, aliases, fractions, conversion", () => {
  assert.deepEqual(ok(length, "5 m"), { scale: "length", value: 5, unit: "m" });
  assert.equal(ok(length, "250cm").unit, "cm");
  assert.equal(ok(length, '6"').unit, "in");
  assert.equal(ok(length, "6 feet").unit, "ft");
  assert.equal(ok(length, "2,5 m").value, 2.5);
  assert.equal(ok(length, "1 1/2 in").value, 1.5);
  assert.equal(ok(length, 30, { unit: "cm" }).unit, "cm");
  assert.equal(length.toBase(ok(length, "1 m")), 1000);
  assert.equal(length.toBase(ok(length, "1 ft")), 304.8);
  assert.equal(length.compare(ok(length, "100 cm"), ok(length, "1 m")), 0);
  assert.ok(length.compare(ok(length, "90 cm"), ok(length, "1 m")) < 0);
  assert.equal(length.format(ok(length, "1000 mm"), { unit: "m" }), "1 m");
  no(length, "5"); no(length, "0 cm"); no(length, "-3 cm"); no(length, "5 parsec"); no(length, "abc"); no(length, ""); no(length, "5000 km");
});
test("length: plausibility", () => {
  assert.deepEqual(length.plausible("led-strip", "length", ok(length, "5 m")), { ok: true });
  assert.match(length.plausible("led-strip", "length", ok(length, "500 m")).warn, /very large/);
  assert.match(length.plausible("gold-necklace", "length", ok(length, "5 cm")).warn, /very small/);
  assert.equal(length.plausible("gold-necklace", "length", ok(length, "45 cm")).warn, undefined);
  assert.equal(length.plausible("x", "y", { scale: "length", value: 5e6, unit: "m" }).ok, false);
});
test("thickness and diameter", () => {
  assert.equal(ok(thickness, "8 in").unit, "in");
  assert.equal(thickness.toBase(ok(thickness, "1 in")), 25.4);
  assert.equal(thickness.plausible("mattress", "thickness", ok(thickness, "8 in")).warn, undefined);
  assert.match(thickness.plausible("mattress", "thickness", ok(thickness, "1 mm")).warn, /small/);
  no(thickness, "5 m"); no(thickness, "3000 cm");
  assert.equal(ok(diameter, "3/4 in").value, 0.75);
  assert.equal(ok(diameter, "110 mm").unit, "mm");
  assert.equal(diameter.plausible("pipe", "diameter", ok(diameter, "20 cm")).warn, undefined);
  assert.match(diameter.plausible("pipe", "diameter", ok(diameter, "1 mm")).warn, /small/);
  assert.match(diameter.plausible("x", "y", ok(diameter, "400 cm")).warn, /large/);
});
test("volume: ml and L", () => {
  assert.deepEqual(ok(volume, "20 L"), { scale: "volume", value: 20, unit: "l" });
  assert.equal(ok(volume, "1.5 litres").unit, "l");
  assert.equal(ok(volume, "1,500 ml").value, 1500);
  assert.equal(ok(volume, "20", { unit: "L" }).unit, "l");
  assert.equal(volume.format(ok(volume, "20 l")), "20 L");
  assert.equal(volume.format(ok(volume, "1500 ml"), { unit: "L" }), "1.5 L");
  assert.equal(volume.compare(ok(volume, "1 L"), ok(volume, "1000 ml")), 0);
  no(volume, "20"); no(volume, "20 gallons"); no(volume, "0 ml");
  assert.equal(volume.plausible("drinking-water", "size", ok(volume, "20 L")).warn, undefined);
  assert.match(volume.plausible("drinking-water", "size", ok(volume, "20 ml")).warn, /small/);
  assert.match(volume.plausible("fragrance", "volume", ok(volume, "5 L")).warn, /large/);
});
test("weight: g and kg", () => {
  assert.deepEqual(ok(weight, "22.5kg"), { scale: "weight", value: 22.5, unit: "kg" });
  assert.equal(ok(weight, "400 grams").unit, "g");
  assert.equal(weight.toBase(ok(weight, "13 kg")), 13000);
  assert.ok(weight.compare(ok(weight, "6 kg"), ok(weight, "13 kg")) < 0);
  assert.equal(weight.format(ok(weight, "400 g")), "400 g");
  no(weight, "6"); no(weight, "6 lb");
  assert.equal(weight.plausible("bread", "weight", ok(weight, "400 g")).warn, undefined);
  assert.match(weight.plausible("bread", "weight", ok(weight, "40 kg")).warn, /large/);
});
test("duration: minutes to years, words and compound", () => {
  assert.deepEqual(ok(duration, "90 min"), { scale: "duration", value: 90, unit: "min" });
  assert.equal(ok(duration, "2 hours").unit, "h");
  assert.deepEqual(ok(duration, "3 months"), { scale: "duration", value: 3, unit: "month" });
  assert.deepEqual(ok(duration, "Quarterly"), { scale: "duration", value: 3, unit: "month" });
  assert.deepEqual(ok(duration, "Annual"), { scale: "duration", value: 1, unit: "year" });
  assert.deepEqual(ok(duration, "daily"), { scale: "duration", value: 1, unit: "day" });
  assert.deepEqual(ok(duration, "1h 30min"), { scale: "duration", value: 90, unit: "min" });
  assert.deepEqual(ok(duration, "1h30"), { scale: "duration", value: 90, unit: "min" });
  assert.equal(duration.format(ok(duration, "1 month")), "1 month");
  assert.equal(duration.format(ok(duration, "3 months")), "3 months");
  assert.equal(duration.format(ok(duration, "30 min")), "30 min");
  assert.ok(duration.compare(ok(duration, "1 week"), ok(duration, "1 month")) < 0);
  assert.ok(duration.compare(ok(duration, "7 days"), ok(duration, "1 week")) === 0);
  no(duration, "30"); no(duration, "0 min"); no(duration, "400 years"); no(duration, "3 fortnights");
  assert.equal(duration.plausible("spa", "duration", ok(duration, "60 min")).warn, undefined);
  assert.match(duration.plausible("spa", "duration", ok(duration, "3 days")).warn, /large/);
});
test("power, voltage, current, battery, gsm assume their only sensible unit", () => {
  assert.deepEqual(ok(power, "9"), { scale: "power", value: 9, unit: "w" });
  assert.equal(ok(power, "1.5 kW").unit, "kw");
  assert.equal(power.toBase(ok(power, "2 kW")), 2000);
  assert.equal(power.format(ok(power, "9w")), "9 W");
  assert.equal(power.plausible("led-bulb", "wattage", ok(power, "9 W")).warn, undefined);
  assert.match(power.plausible("led-bulb", "wattage", ok(power, "2 kW")).warn, /large/);
  no(power, "9 horsepower"); no(power, "0");
  assert.equal(ok(voltage, "220").unit, "v");
  assert.equal(voltage.format(ok(voltage, "12v")), "12 V");
  assert.match(voltage.plausible("x", "y", ok(voltage, "5000 V")).warn, /large/);
  no(voltage, "-5"); no(voltage, "12 amps");
  assert.equal(ok(current, "13A").unit, "a");
  assert.equal(current.toBase(ok(current, "500 mA")), 0.5);
  assert.equal(current.format(ok(current, "500 mA")), "500 mA");
  assert.match(current.plausible("x", "y", ok(current, "5000 A")).warn, /large/);
  assert.equal(ok(batteryCapacity, "5000").unit, "mah");
  assert.equal(batteryCapacity.toBase(ok(batteryCapacity, "2 Ah")), 2000);
  assert.equal(batteryCapacity.format(ok(batteryCapacity, "60Ah")), "60 Ah");
  assert.equal(batteryCapacity.plausible("car-battery", "capacity", ok(batteryCapacity, "60 Ah")).warn, undefined);
  assert.match(batteryCapacity.plausible("car-battery", "capacity", ok(batteryCapacity, "5 Ah")).warn, /small/);
  assert.match(batteryCapacity.plausible("phone", "battery", ok(batteryCapacity, "60 Ah")).warn, /large/);
  assert.equal(ok(gsm, "80gsm").value, 80);
  assert.equal(ok(gsm, "250 g/m2").value, 250);
  assert.equal(gsm.format(ok(gsm, "300")), "300 gsm");
  assert.match(gsm.plausible("x", "y", ok(gsm, "2000")).warn, /large/);
  assert.match(gsm.plausible("x", "y", ok(gsm, "5")).warn, /small/);
  no(gsm, "9000");
});
test("sizeKey is scale:system:value:unit, distinct per value and unit", () => {
  assert.equal(volume.sizeKey(ok(volume, "20 L")), "volume:-:20:l");
  assert.equal(weight.sizeKey(ok(weight, "22.5 kg")), "weight:-:22.5:kg");
  assert.notEqual(weight.sizeKey(ok(weight, "1 kg")), weight.sizeKey(ok(weight, "1 g")));
  assert.notEqual(length.sizeKey(ok(length, "0.0004 m")), length.sizeKey(ok(length, "0.0005 m")));
  assert.equal(length.sizeKey(ok(length, "20.0 cm")), length.sizeKey(ok(length, "20 cm")));
});
test("a stored value parses back to itself", () => {
  for (const [s, raw] of [[volume, "5 L"], [weight, "6 kg"], [duration, "3 months"], [power, "9 W"], [length, "2 m"]]) {
    const v = ok(s, raw);
    assert.deepEqual(ok(s, JSON.parse(JSON.stringify(v))), v);
  }
  no(volume, { scale: "weight", value: 5, unit: "kg" });
});
