// A03: scales whose values are words, counts, codes or lists: count, portion, vehicle-class, compat-model, color-temperature,
// ip-rating, gauge and the label fallback.
import { badValue, cleanLabel, compareBase, fine, fmtNum, impossible, keyOf, okValue, parseNumber, round, slugKey, splitNumberUnit, unitKey } from "./kit.js";

const norm = (raw) => String(raw ?? "").toLowerCase().replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
const wrong = (raw, id, what) => raw && typeof raw === "object" && raw.scale && raw.scale !== id ? badValue(`That is not ${what}.`) : null;
const textOf = (raw) => (raw && typeof raw === "object" ? (raw.value == null ? "" : raw.value) : raw);

// ---- count: "set of 4", "pack of 6", "box of 12", "3-seater", "2 gang", "3 tiers", "12 copies", "12 pcs", "x12", or a bare number.
export const COUNT_SYSTEMS = ["pieces", "set", "pack", "box", "seater", "gang", "tier", "copies"];
const COUNT_FORMAT = {
  pieces: (n) => `${n} pcs`, set: (n) => `Set of ${n}`, pack: (n) => `Pack of ${n}`, box: (n) => `Box of ${n}`,
  seater: (n) => `${n}-seater`, gang: (n) => `${n}-gang`, tier: (n) => `${n} tier${n === 1 ? "" : "s"}`, copies: (n) => `${n} cop${n === 1 ? "y" : "ies"}`
};
const COUNT_WARN = { // [min, max] usual
  pieces: [1, 1000], set: [2, 100], pack: [2, 500], box: [2, 1000], seater: [1, 8], gang: [1, 6], tier: [1, 8], copies: [1, 10000]
};
const COUNT_HARD = { pieces: 100000, set: 1000, pack: 10000, box: 10000, seater: 20, gang: 12, tier: 20, copies: 1000000 };
const COUNT_PATTERNS = [
  [/^(set|pack|box)\s+of\s+(\d+)$/, (m) => [m[1], m[2]]],
  [/^(\d+)\s*[- ]?\s*(set|pack|box)$/, (m) => [m[2], m[1]]],
  [/^(\d+)\s*[- ]?\s*(?:seater|seaters|seat|seats)$/, (m) => ["seater", m[1]]],
  [/^(\d+)\s*[- ]?\s*(?:gang|gangs)$/, (m) => ["gang", m[1]]],
  [/^(\d+)\s*[- ]?\s*(?:tier|tiers)$/, (m) => ["tier", m[1]]],
  [/^(\d+)\s*(?:copies|copy)$/, (m) => ["copies", m[1]]],
  [/^(\d+)\s*(?:pcs|pc|pieces|piece|units?)$/, (m) => ["pieces", m[1]]],
  [/^[x×]\s*(\d+)$/, (m) => [null, m[1]]],
  [/^(\d+)$/, (m) => [null, m[1]]]
];
export const count = {
  id: "count", base: "count", units: [],
  parse(raw, ctx = {}) {
    const bad = wrong(raw, "count", "a count");
    if (bad) return bad;
    let system = null, n;
    if (raw && typeof raw === "object") { system = raw.system ?? null; n = parseNumber(raw.value); }
    else {
      const text = norm(raw);
      for (const [re, read] of COUNT_PATTERNS) {
        const m = text.match(re);
        if (m) { const [s, num] = read(m); system = s; n = Number(num); break; }
      }
      if (n === undefined) return badValue("Enter a count, like 4, set of 4, 3-seater or pack of 6.");
    }
    system = system ?? ctx.system ?? "pieces";
    if (!COUNT_SYSTEMS.includes(system)) return badValue(`Unknown count kind "${system}". Use ${COUNT_SYSTEMS.join(", ")}.`);
    if (!Number.isInteger(n) || n < 1) return badValue("A count must be a whole number, 1 or more.");
    if (n > COUNT_HARD[system]) return badValue(`${COUNT_FORMAT[system](n)} is not possible. Check the number.`);
    return okValue({ scale: "count", system, value: n });
  },
  format: (v) => (v && COUNT_FORMAT[v.system] ? COUNT_FORMAT[v.system](v.value) : ""),
  sizeKey: (v) => keyOf("count", v.system ?? "pieces", v.value, v.unit),
  toBase: (v) => (v ? Number(v.value) : null),
  compare: (a, b) => compareBase(Number(a.value), Number(b.value)),
  plausible(typeId, axisKey, v) {
    if (!v || !COUNT_SYSTEMS.includes(v.system ?? "pieces")) return impossible("count: not a valid value.");
    const s = v.system ?? "pieces", n = Number(v.value);
    if (!Number.isInteger(n) || n < 1 || n > COUNT_HARD[s]) return impossible(`${COUNT_FORMAT[s](n)} cannot be right.`);
    const [lo, hi] = COUNT_WARN[s];
    if (n < lo) return fine(`${COUNT_FORMAT[s](n)} is smaller than usual. Check the number.`);
    if (n > hi) return fine(`${COUNT_FORMAT[s](n)} is larger than usual. Check the number.`);
    return fine();
  }
};

// ---- portion: size words (small, regular, large, family) or plate fractions (quarter, half, full).
const PORTIONS = {
  size: { small: 1, regular: 2, large: 3, family: 4 },
  plate: { quarter: 0.25, half: 0.5, full: 1 }
};
const PORTION_WORDS = {
  small: ["size", "small"], s: ["size", "small"], mini: ["size", "small"], medium: ["size", "regular"], med: ["size", "regular"],
  regular: ["size", "regular"], standard: ["size", "regular"], normal: ["size", "regular"], large: ["size", "large"], l: ["size", "large"],
  big: ["size", "large"], family: ["size", "family"], "family size": ["size", "family"],
  quarter: ["plate", "quarter"], "quarter plate": ["plate", "quarter"], half: ["plate", "half"], "half plate": ["plate", "half"],
  "half portion": ["plate", "half"], full: ["plate", "full"], "full plate": ["plate", "full"], "full portion": ["plate", "full"]
};
const PORTION_LABEL = { small: "Small", regular: "Regular", large: "Large", family: "Family", quarter: "Quarter plate", half: "Half plate", full: "Full plate" };
const portionRank = (v) => PORTIONS[v?.system]?.[v?.value] ?? null;
export const portion = {
  id: "portion", base: "rank", units: [],
  parse(raw) {
    const bad = wrong(raw, "portion", "a portion");
    if (bad) return bad;
    if (raw && typeof raw === "object" && raw.system && PORTIONS[raw.system]?.[norm(raw.value)]) return okValue({ scale: "portion", system: raw.system, value: norm(raw.value) });
    const hit = PORTION_WORDS[norm(textOf(raw))];
    if (!hit) return badValue("Use small, regular, large, family, or quarter, half or full plate.");
    return okValue({ scale: "portion", system: hit[0], value: hit[1] });
  },
  format: (v) => PORTION_LABEL[v?.value] ?? "",
  sizeKey: (v) => keyOf("portion", v.system, v.value),
  /** Rank inside its system (size 1 to 4) or the fraction of a plate (0.25, 0.5, 1). Not comparable across the two systems. */
  toBase: portionRank,
  compare: (a, b) => (a.system !== b.system ? (a.system === "size" ? -1 : 1) : compareBase(portionRank(a), portionRank(b))),
  plausible: (typeId, axisKey, v) => (portionRank(v) == null ? impossible("portion: not a valid value.") : fine())
};

// ---- vehicle-class: smallest to largest.
const VEHICLES = ["motorbike", "tuktuk", "hatchback", "saloon", "suv", "pickup", "van", "minibus", "truck", "bus"];
const VEHICLE_LABEL = { motorbike: "Motorbike", tuktuk: "Tuk-tuk", hatchback: "Hatchback", saloon: "Saloon", suv: "SUV", pickup: "Pickup", van: "Van", minibus: "Minibus", truck: "Truck", bus: "Bus" };
const VEHICLE_WORDS = {
  motorbike: "motorbike", motorcycle: "motorbike", bike: "motorbike", "motor bike": "motorbike", boda: "motorbike", "boda boda": "motorbike",
  tuktuk: "tuktuk", "tuk tuk": "tuktuk", "tuk-tuk": "tuktuk", hatchback: "hatchback", hatch: "hatchback",
  saloon: "saloon", sedan: "saloon", car: "saloon", "saloon car": "saloon", suv: "suv", "4x4": "suv", crossover: "suv",
  pickup: "pickup", "pick up": "pickup", "pick-up": "pickup", van: "van", minibus: "minibus", matatu: "minibus",
  truck: "truck", lorry: "truck", bus: "bus", coach: "bus"
};
const vehicleRank = (v) => VEHICLES.indexOf(v?.value);
export const vehicleClass = {
  id: "vehicle-class", base: "rank", units: [],
  parse(raw) {
    const bad = wrong(raw, "vehicle-class", "a vehicle class");
    if (bad) return bad;
    const id = VEHICLE_WORDS[norm(textOf(raw))];
    if (!id) return badValue(`Use ${VEHICLES.map((v) => VEHICLE_LABEL[v]).join(", ")}.`);
    return okValue({ scale: "vehicle-class", system: "class", value: id });
  },
  format: (v) => VEHICLE_LABEL[v?.value] ?? "",
  sizeKey: (v) => keyOf("vehicle-class", v.system ?? "class", v.value),
  toBase: (v) => (vehicleRank(v) < 0 ? null : vehicleRank(v) + 1),
  compare: (a, b) => compareBase(vehicleRank(a), vehicleRank(b)),
  plausible: (typeId, axisKey, v) => (vehicleRank(v) < 0 ? impossible("vehicle-class: not a valid value.") : fine())
};

// ---- compat-model: which model a part fits. The list comes from the product type, passed as ctx.models
// (strings or {label}). With ctx.open true a model that is not in the list is accepted as typed.
// TODO(contract:A02): use normalizeValueKey from A02 in place of slugKey when it is merged.
const modelLabel = (m) => cleanLabel(typeof m === "string" ? m : m?.label ?? m?.name ?? m?.value ?? "");
export const compatModel = {
  id: "compat-model", base: "key", units: [],
  parse(raw, ctx = {}) {
    const bad = wrong(raw, "compat-model", "a compatible model");
    if (bad) return bad;
    const typed = cleanLabel(textOf(raw));
    if (!typed) return badValue("Enter a model.");
    if (typed.length > 60) return badValue("A model name can be up to 60 characters.");
    const key = slugKey(typed);
    if (!key) return badValue("Enter a model with letters or numbers.");
    const listed = (ctx.models ?? []).map(modelLabel).find((l) => slugKey(l) === key);
    if (listed) return okValue({ scale: "compat-model", value: listed });
    if (ctx.open) return okValue({ scale: "compat-model", value: typed });
    return badValue(ctx.models?.length ? `"${typed}" is not in the list of models for this product type.` : "This product type has no model list yet.");
  },
  format: (v) => (v ? String(v.value) : ""),
  sizeKey: (v) => keyOf("compat-model", v.system, slugKey(v.value)),
  toBase: () => null,
  compare: (a, b) => String(a.value).localeCompare(String(b.value), undefined, { numeric: true, sensitivity: "base" }),
  plausible: (typeId, axisKey, v) => (!v || !slugKey(v.value) ? impossible("compat-model: not a valid value.") : String(v.value).length > 40 ? fine("That model name is long. Check it is one model.") : fine())
};

// ---- color-temperature: 2700 K, or warm, neutral, cool, daylight (nominal 2700, 4000, 6000, 6500 K).
const TEMP_NAMES = { warm: 2700, neutral: 4000, cool: 6000, daylight: 6500 };
const TEMP_WORDS = {
  warm: "warm", "warm white": "warm", "soft white": "warm", neutral: "neutral", "neutral white": "neutral", natural: "neutral", "natural white": "neutral",
  "natural light": "neutral", cool: "cool", "cool white": "cool", "cold white": "cool", daylight: "daylight", "day light": "daylight", "daylight white": "daylight"
};
const TEMP_LABEL = { warm: "Warm white", neutral: "Neutral white", cool: "Cool white", daylight: "Daylight" };
const tempBase = (v) => (!v ? null : v.system === "name" ? TEMP_NAMES[v.value] ?? null : Number(v.value));
export const colorTemperature = {
  id: "color-temperature", base: "K", units: ["k"],
  parse(raw) {
    const bad = wrong(raw, "color-temperature", "a colour temperature");
    if (bad) return bad;
    if (raw && typeof raw === "object" && raw.system === "name" && TEMP_NAMES[raw.value]) return okValue({ scale: "color-temperature", system: "name", value: raw.value });
    const word = TEMP_WORDS[norm(textOf(raw))];
    if (word) return okValue({ scale: "color-temperature", system: "name", value: word });
    const s = splitNumberUnit(String(textOf(raw) ?? ""));
    if (!s || !Number.isFinite(s.num)) return badValue("Use a number in K, like 2700 K, or warm, neutral, cool or daylight.");
    if (s.unit && unitKey(s.unit) !== "k") return badValue(`Unknown unit "${s.unit}". Use K.`);
    if (s.num < 1000 || s.num > 20000) return badValue(`${fmtNum(s.num)} K is not a possible colour temperature (1000 to 20000).`);
    return okValue({ scale: "color-temperature", system: "kelvin", value: round(s.num), unit: "k" });
  },
  format: (v) => (!v ? "" : v.system === "name" ? TEMP_LABEL[v.value] ?? "" : `${fmtNum(v.value)} K`),
  sizeKey: (v) => keyOf("color-temperature", v.system ?? "kelvin", v.value, v.system === "name" ? undefined : v.unit),
  toBase: tempBase,
  compare: (a, b) => compareBase(tempBase(a), tempBase(b)),
  plausible(typeId, axisKey, v) {
    const k = tempBase(v);
    if (k == null) return impossible("color-temperature: not a valid value.");
    if (v.system === "kelvin" && (k < 1000 || k > 20000)) return impossible(`${fmtNum(k)} K cannot be right.`);
    return k < 1800 || k > 10000 ? fine(`${fmtNum(k)} K is outside the usual 1800 to 10000 K for lighting.`) : fine();
  }
};

// ---- ip-rating: IP65, IPX4, IP6X, IP69K.
const IP = /^ip\s*[-]?\s*([0-6x])\s*([0-9x])(k)?$/i;
const ipParts = (v) => { const m = String(v?.value ?? "").match(/^IP([0-6X])([0-9X])(K)?$/); return m ? { s: m[1], l: m[2], k: !!m[3] } : null; };
export const ipRating = {
  id: "ip-rating", base: "code", units: [],
  parse(raw) {
    const bad = wrong(raw, "ip-rating", "an IP rating");
    if (bad) return bad;
    const m = String(textOf(raw) ?? "").trim().match(IP);
    if (!m) return badValue("Enter an IP rating like IP65, IPX4 or IP68.");
    const s = m[1].toUpperCase(), l = m[2].toUpperCase();
    if (s === "X" && l === "X") return badValue("An IP rating needs at least one digit.");
    if (m[3] && l !== "9") return badValue("K only follows IP_9, as in IP69K.");
    return okValue({ scale: "ip-rating", system: "iec", value: `IP${s}${l}${m[3] ? "K" : ""}` });
  },
  format: (v) => (ipParts(v) ? String(v.value) : ""),
  sizeKey: (v) => keyOf("ip-rating", v.system ?? "iec", v.value),
  /** solid digit x 10 + liquid digit, X counts as 0, K adds 0.5. Only a rough order. */
  toBase(v) { const p = ipParts(v); return p ? (p.s === "X" ? 0 : +p.s) * 10 + (p.l === "X" ? 0 : +p.l) + (p.k ? 0.5 : 0) : null; },
  compare: (a, b) => compareBase(ipRating.toBase(a), ipRating.toBase(b)),
  plausible(typeId, axisKey, v) {
    const p = ipParts(v);
    if (!p) return impossible("ip-rating: not a valid value.");
    if (p.s !== "X" && +p.s < 4 && p.l !== "X" && +p.l >= 7) return fine(`${v.value} is unusual: strong water protection with weak dust protection. Check the digits.`);
    return fine();
  }
};

// ---- gauge: sheet or wire gauge. SWG numbers 8 to 36 (write 28, 28g, 28 gauge, gauge 28, 28 swg) or a thickness in mm.
const SWG_MM = { 8: 4.064, 9: 3.658, 10: 3.251, 11: 2.946, 12: 2.642, 13: 2.337, 14: 2.032, 15: 1.829, 16: 1.626, 17: 1.422, 18: 1.219, 19: 1.016, 20: 0.914, 21: 0.813, 22: 0.711, 23: 0.61, 24: 0.559, 25: 0.508, 26: 0.457, 27: 0.416, 28: 0.376, 29: 0.345, 30: 0.315, 31: 0.295, 32: 0.274, 33: 0.254, 34: 0.234, 35: 0.213, 36: 0.193 };
export const gauge = {
  id: "gauge", base: "mm", units: ["swg", "mm"],
  parse(raw, ctx = {}) {
    const bad = wrong(raw, "gauge", "a gauge");
    if (bad) return bad;
    if (raw && typeof raw === "object" && raw.system && raw.value != null) raw = `${raw.value}${raw.system === "mm" ? " mm" : " swg"}`;
    const text = norm(textOf(raw)).replace(/^gauge\s*/, "");
    const s = splitNumberUnit(text);
    if (!s || !Number.isFinite(s.num)) return badValue("Enter a gauge like 28, 28 gauge or 0.5 mm.");
    const u = unitKey(s.unit);
    if (u === "mm") {
      if (s.num < 0.05 || s.num > 25) return badValue(`${fmtNum(s.num)} mm is not a possible gauge thickness.`);
      return okValue({ scale: "gauge", system: "mm", value: round(s.num), unit: "mm" });
    }
    if (u !== "" && !["g", "ga", "gauge", "swg"].includes(u)) return badValue(`Unknown unit "${s.unit}". Use a gauge number or mm.`);
    if (ctx.system === "mm" && u === "") return okValue({ scale: "gauge", system: "mm", value: round(s.num), unit: "mm" });
    if (!Number.isInteger(s.num) || !SWG_MM[s.num]) return badValue("Gauge numbers run from 8 to 36 (SWG). For a thickness, write it in mm, like 0.5 mm.");
    return okValue({ scale: "gauge", system: "swg", value: s.num });
  },
  format: (v) => (!v ? "" : v.system === "mm" ? `${fmtNum(v.value)} mm` : `Gauge ${v.value}`),
  sizeKey: (v) => keyOf("gauge", v.system ?? "swg", String(round(v.value)), v.system === "mm" ? "mm" : undefined),
  /** Thickness in mm: sheets are compared by how thick they are, so gauge 28 sorts before gauge 26. */
  toBase: (v) => (!v ? null : v.system === "mm" ? Number(v.value) : SWG_MM[v.value] ?? null),
  compare: (a, b) => compareBase(gauge.toBase(a), gauge.toBase(b)),
  plausible(typeId, axisKey, v) {
    const t = gauge.toBase(v);
    if (t == null || !(t > 0)) return impossible("gauge: not a valid value.");
    if (t < 0.05 || t > 25) return impossible(`${gauge.format(v)} cannot be right.`);
    return t < 0.15 || t > 6 ? fine(`${gauge.format(v)} (${fmtNum(t)} mm) is outside the usual sheet and wire range.`) : fine();
  }
};

// ---- label: the fallback when nothing else fits. Free text, trimmed, up to 40 characters.
export const label = {
  id: "label", base: "text", units: [],
  parse(raw) {
    const bad = wrong(raw, "label", "a label");
    if (bad) return bad;
    const text = cleanLabel(typeof textOf(raw) === "number" ? String(textOf(raw)) : textOf(raw));
    if (!text) return badValue("Enter a name.");
    if (text.length > 40) return badValue("A name can be up to 40 characters.");
    if (!slugKey(text)) return badValue("Use letters or numbers in the name.");
    return okValue({ scale: "label", value: text });
  },
  format: (v) => (v ? String(v.value) : ""),
  sizeKey: (v) => keyOf("label", v.system, slugKey(v.value)),
  toBase: () => null,
  compare: (a, b) => String(a.value).localeCompare(String(b.value), undefined, { numeric: true, sensitivity: "base" }),
  plausible(typeId, axisKey, v) {
    const text = v ? String(v.value) : "";
    if (!slugKey(text)) return impossible("label: not a valid value.");
    if (/^[\d.,\s]+$/.test(text)) return fine("This looks like a number. If it is a measure, pick the matching scale so the unit is kept.");
    return text.length > 24 ? fine("This label is long. Short labels fit the option buttons.") : fine();
  }
};

export const ORDINAL_SCALES = [count, portion, vehicleClass, compatModel, colorTemperature, ipRating, gauge, label];
