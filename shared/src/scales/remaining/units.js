// A03: scales measured in a family of units. Base units: length, thickness, diameter in mm; volume in ml; weight in g;
// duration in minutes (a month counts as 30 days and a year as 365, for comparing only); power W; voltage V; current A;
// battery capacity mAh; gsm in g/m2.
import { unitScale } from "./kit.js";

const L = {
  mm: { to: 1, aliases: ["millimetre", "millimetres", "millimeter", "millimeters"] },
  cm: { to: 10, aliases: ["centimetre", "centimetres", "centimeter", "centimeters"] },
  m: { to: 1000, aliases: ["metre", "metres", "meter", "meters", "mtr", "mtrs"] },
  ft: { to: 304.8, aliases: ["foot", "feet", "'", "′"] },
  in: { to: 25.4, aliases: ["inch", "inches", '"', "″"] }
};
const pick = (keys, src = L) => Object.fromEntries(keys.map((k) => [k, { ...src[k] }]));

// Warn ranges are in base units (mm). Keys are "typeId/axisKey" or "typeId" for the product types in Contract v1.
export const length = unitScale({
  id: "length", base: "mm", units: pick(["m", "cm", "mm", "ft", "in"]), what: "a length",
  hard: [0.1, 1e6], warn: [1, 1e5],
  ranges: { "led-strip/length": [200, 50000], "gold-necklace/length": [300, 1200], "wiper/length": [200, 900] }
});

export const thickness = unitScale({
  id: "thickness", base: "mm", units: pick(["mm", "cm", "in"]), what: "a thickness",
  hard: [0.01, 2000], warn: [0.1, 500],
  ranges: { "mattress/thickness": [25, 500] }
});

export const diameter = unitScale({
  id: "diameter", base: "mm", units: pick(["mm", "cm", "in"]), what: "a diameter",
  hard: [0.1, 20000], warn: [1, 3000],
  ranges: { "pipe/diameter": [6, 1000] }
});

export const volume = unitScale({
  id: "volume", base: "ml",
  units: {
    ml: { to: 1, aliases: ["millilitre", "millilitres", "milliliter", "milliliters", "mls"] },
    l: { to: 1000, label: "L", aliases: ["litre", "litres", "liter", "liters", "ltr", "ltrs", "lt"] }
  },
  what: "a volume", hard: [0.1, 1e7], warn: [1, 1e6],
  ranges: { "drinking-water/size": [500, 1e6], "fragrance/volume": [2, 1000], "paint/volume": [100, 50000] }
});

export const weight = unitScale({
  id: "weight", base: "g",
  units: {
    g: { to: 1, aliases: ["gram", "grams", "gm", "gms", "grammes"] },
    kg: { to: 1000, aliases: ["kilo", "kilos", "kilogram", "kilograms", "kgs"] }
  },
  what: "a weight", hard: [0.01, 1e8], warn: [0.1, 1e6],
  ranges: { "bread/weight": [100, 3000], "gold-necklace/weight": [0.5, 500], "meat-by-weight/weight": [50, 100000] }
});

const D = { min: 1, h: 60, day: 1440, week: 10080, month: 43200, year: 525600 };
export const duration = unitScale({
  id: "duration", base: "min",
  units: {
    min: { to: D.min, aliases: ["mins", "minute", "minutes"] },
    h: { to: D.h, aliases: ["hr", "hrs", "hour", "hours"] },
    day: { to: D.day, plural: "days", aliases: ["days", "d"] },
    week: { to: D.week, plural: "weeks", aliases: ["weeks", "wk", "wks", "w"] },
    month: { to: D.month, plural: "months", aliases: ["months", "mo", "mos"] },
    year: { to: D.year, plural: "years", aliases: ["years", "yr", "yrs", "y"] }
  },
  what: "a duration", hard: [1, D.year * 10], warn: [5, D.year * 3],
  words: {
    daily: { value: 1, unit: "day" }, weekly: { value: 1, unit: "week" }, monthly: { value: 1, unit: "month" },
    quarterly: { value: 3, unit: "month" }, annual: { value: 1, unit: "year" }, annually: { value: 1, unit: "year" },
    yearly: { value: 1, unit: "year" }
  },
  ranges: { "spa/duration": [15, 480], "salon/duration": [10, 720] }
});

// "1 h 30 min" and "1h30" add up to minutes. One quantity falls through to the plain parser.
const plainDuration = duration.parse;
duration.parse = (raw, ctx = {}) => {
  if (typeof raw === "string") {
    const text = raw.trim().toLowerCase();
    const hm = text.match(/^(\d+)\s*h\s*(\d{1,2})$/);
    if (hm) return plainDuration(`${Number(hm[1]) * 60 + Number(hm[2])} min`, ctx);
    const pairs = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|days?|weeks?)(?=\s|\d|$)/g)];
    if (pairs.length > 1 && pairs.map((p) => p[0]).join("").replace(/\s+/g, "") === text.replace(/[\s,]+|and|&/g, "")) {
      let total = 0;
      for (const [, n, u] of pairs) {
        const one = plainDuration(`${n} ${u}`, ctx);
        if (!one.ok) return one;
        total += duration.toBase(one.value);
      }
      return plainDuration(`${total} min`, ctx);
    }
  }
  return plainDuration(raw, ctx);
};

export const power = unitScale({
  id: "power", base: "W",
  units: { w: { to: 1, label: "W", aliases: ["watt", "watts"] }, kw: { to: 1000, label: "kW", aliases: ["kilowatt", "kilowatts"] } },
  what: "a power in watts", assumeDefault: true, defaultUnit: "w", hard: [0.001, 1e7], warn: [0.1, 1e5],
  ranges: { "led-bulb/wattage": [0.5, 200] }
});

export const voltage = unitScale({
  id: "voltage", base: "V",
  units: { v: { to: 1, label: "V", aliases: ["volt", "volts"] } },
  what: "a voltage", assumeDefault: true, defaultUnit: "v", hard: [0.1, 1e6], warn: [1, 1000]
});

export const current = unitScale({
  id: "current", base: "A",
  units: { a: { to: 1, label: "A", aliases: ["amp", "amps", "ampere", "amperes"] }, ma: { to: 0.001, label: "mA", aliases: ["milliamp", "milliamps"] } },
  what: "a current in amps", assumeDefault: true, defaultUnit: "a", hard: [0.0001, 1e4], warn: [0.001, 1000]
});

export const batteryCapacity = unitScale({
  id: "battery-capacity", base: "mAh",
  units: { mah: { to: 1, label: "mAh" }, ah: { to: 1000, label: "Ah", aliases: ["amphour", "amphours", "amp-hour", "amp-hours"] } },
  what: "a battery capacity", assumeDefault: true, defaultUnit: "mah", hard: [1, 1e7], warn: [50, 1e6],
  ranges: { "phone/battery": [800, 12000], "car-battery/capacity": [20000, 300000] }
});

export const gsm = unitScale({
  id: "gsm", base: "g/m2",
  units: { gsm: { to: 1, label: "gsm", aliases: ["g/m2", "g/m²", "gm2", "grams/m2"] } },
  what: "a paper or fabric weight in gsm", assumeDefault: true, defaultUnit: "gsm", hard: [1, 5000], warn: [20, 600]
});

export const UNIT_SCALES = [length, thickness, diameter, volume, weight, duration, power, voltage, current, batteryCapacity, gsm];
