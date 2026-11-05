// A03: scales with a fixed written format: bed-size, cross-section, tyre-size, paper-size, print-size, frame-size.
import { badValue, compareBase, fine, fmtNum, impossible, keyOf, okValue, parseNumber, round, slugKey, splitNumberUnit, unitKey } from "./kit.js";

const SPLIT = /\s*(?:[x×*]|\bby\b)\s*/i;
const MM = { mm: 1, cm: 10, in: 25.4, ft: 304.8 };
const unitFrom = (text, allowed) => {
  const k = unitKey(text);
  const table = { mm: "mm", millimetre: "mm", millimetres: "mm", cm: "cm", centimetre: "cm", centimetres: "cm", in: "in", inch: "in", inches: "in", '"': "in", "″": "in", ft: "ft", foot: "ft", feet: "ft", "'": "ft", "′": "ft" };
  const u = table[k] ?? null;
  return u && allowed.includes(u) ? u : null;
};

/** Reads "4 x 6", "4ft by 6ft", "50 x 100 mm" into {nums, unit}. unit is null when none was written. */
function readPair(raw, allowed, want = 2) {
  const pieces = String(raw).trim().split(SPLIT);
  if (pieces.length !== want) return { error: `Enter ${want === 2 ? "two numbers, like 4 x 6" : want + " numbers"}.` };
  const nums = [], units = new Set();
  for (const piece of pieces) {
    const s = splitNumberUnit(piece);
    if (!s || !Number.isFinite(s.num)) return { error: `"${piece}" is not a size.` };
    nums.push(s.num);
    if (s.unit) {
      const u = unitFrom(s.unit, allowed);
      if (!u) return { error: `Unknown unit "${s.unit}". Use ${allowed.join(", ")}.` };
      units.add(u);
    }
  }
  if (nums.some((n) => n <= 0)) return { error: "Every size must be more than zero." };
  if (units.size > 1) return { error: "Use one unit for the whole size." };
  return { nums, unit: [...units][0] ?? null };
}
const pairValue = (nums) => nums.map((n) => String(round(n))).join("x");
const pairNums = (v) => String(v.value).split("x").map(Number);
const sorted = (nums) => [...nums].sort((a, b) => a - b);

// ---- bed-size: ft by ft, width first ("4 x 6"). A wider-than-long entry is turned round so 6 x 4 is stored as 4x6.
export const bedSize = {
  id: "bed-size", base: "mm2", units: ["ft"],
  parse(raw, ctx = {}) {
    if (raw && typeof raw === "object") {
      if (raw.scale && raw.scale !== "bed-size") return badValue("That is not a bed size.");
      if (typeof raw.value !== "string") return badValue("Enter the bed size, like 4 x 6.");
      raw = `${raw.value} ft`;
    }
    const r = readPair(raw ?? "", ["ft"]);
    if (r.error) return badValue(r.error);
    const [w, l] = sorted(r.nums);
    if (w < 1 || l > 15) return badValue(`${fmtNum(w)} x ${fmtNum(l)} ft is not a bed size.`);
    return okValue({ scale: "bed-size", value: pairValue([w, l]), unit: "ft", width: round(w) });
  },
  format: (v, opts = {}) => (v ? `${v.value.replace("x", " x ")} ft${opts.long ? " bed" : ""}` : ""),
  sizeKey: (v) => keyOf("bed-size", v.system, v.value, v.unit),
  toBase: (v) => (v ? round(pairNums(v).reduce((a, n) => a * n * MM.ft, 1), 3) : null),
  compare(a, b) { return compareBase(pairNums(a), pairNums(b)); },
  plausible(typeId, _axis, v) {
    if (!v) return impossible("bed-size: not a valid value.");
    const [w, l] = pairNums(v);
    if (w < 1 || l > 15 || !(w > 0)) return impossible(`${v.value} ft cannot be a bed size.`);
    if (w < 2.5 || w > 7.5) return fine(`A bed ${fmtNum(w)} ft wide is unusual (2.5 to 7.5 ft). Check the numbers.`);
    if (l < 5 || l > 8) return fine(`A bed ${fmtNum(l)} ft long is unusual (5 to 8 ft). Check the numbers.`);
    return fine();
  }
};

// ---- cross-section: timber "2x4" in or "50x100" mm (shape rect, smaller side first) and wire "2.5 mm2" (shape area).
const AREA = /^(\d+(?:[.,]\d+)?)\s*(?:sq\.?\s*mm|mm\s*(?:\^2|²|2)|mm2|square\s*mm)$/i;
export const crossSection = {
  id: "cross-section", base: "mm2", units: ["mm", "cm", "in", "mm2"],
  parse(raw, ctx = {}) {
    if (raw && typeof raw === "object") {
      if (raw.scale && raw.scale !== "cross-section") return badValue("That is not a cross-section value.");
      raw = raw.shape === "area" || raw.unit === "mm2" ? `${raw.value} mm2` : `${raw.value}${raw.unit ? " " + raw.unit : ""}`;
    }
    const text = String(raw ?? "").trim();
    if (!text) return badValue("Enter a size, like 50 x 100 mm, 2 x 4 in or 2.5 mm2.");
    const area = text.match(AREA);
    if (area || ctx.shape === "area") {
      const n = area ? parseNumber(area[1]) : parseNumber(text.replace(/mm2?|²/gi, ""));
      if (!Number.isFinite(n) || n <= 0) return badValue("Enter the wire size in mm2, like 2.5 mm2.");
      if (n < 0.01 || n > 10000) return badValue(`${fmtNum(n)} mm2 is not a possible cross-section.`);
      return okValue({ scale: "cross-section", system: "area", shape: "area", value: round(n), unit: "mm2" });
    }
    const r = readPair(text, ["mm", "cm", "in"]);
    if (r.error) return badValue(r.error);
    const unit = r.unit ?? unitFrom(ctx.unit ?? "", ["mm", "cm", "in"]);
    if (!unit) return badValue("Add a unit: mm, cm or in (timber is often 2 x 4 in).");
    const [a, b] = sorted(r.nums);
    if (b * MM[unit] > 3000 || a * MM[unit] < 1) return badValue(`${fmtNum(a)} x ${fmtNum(b)} ${unit} is not a possible cross-section.`);
    return okValue({ scale: "cross-section", system: "rect", shape: "rect", value: pairValue([a, b]), unit, width: round(a) });
  },
  format(v, opts = {}) {
    if (!v) return "";
    if (v.shape === "area") return `${fmtNum(v.value)} mm²`;
    return `${v.value.replace("x", " x ")} ${v.unit}`;
  },
  sizeKey: (v) => keyOf("cross-section", v.system ?? v.shape, v.value, v.unit),
  /** Area in mm2 for both shapes. */
  toBase: (v) => (!v ? null : v.shape === "area" ? Number(v.value) : round(pairNums(v).reduce((a, n) => a * n * MM[v.unit], 1), 3)),
  compare(a, b) {
    if (a.shape !== b.shape) return a.shape === "area" ? 1 : -1;
    return compareBase(crossSection.toBase(a), crossSection.toBase(b));
  },
  plausible(typeId, _axis, v) {
    if (!v) return impossible("cross-section: not a valid value.");
    if (v.shape === "area") {
      const n = Number(v.value);
      if (!(n >= 0.01 && n <= 10000)) return impossible(`${fmtNum(n)} mm² cannot be right.`);
      return n < 0.5 || n > 630 ? fine(`${fmtNum(n)} mm² is outside the usual wire sizes (0.5 to 630 mm²).`) : fine();
    }
    const [a, b] = pairNums(v).map((n) => n * MM[v.unit]);
    if (!(a >= 1 && b <= 3000)) return impossible(`${v.value} ${v.unit} cannot be right for timber.`);
    return a < 10 || b > 600 ? fine(`${crossSection.format(v)} is outside the usual timber sizes (10 to 600 mm). Check the unit.`) : fine();
  }
};

// ---- tyre-size: 205/55 R16, also 195R15 and 195/70R15C. Stored value is written 205/55R16. width = section width in mm.
const TYRE = /^(\d{3})\s*(?:\/\s*(\d{2})\s*)?(?:z?r|-|\s)\s*(\d{2})\s*(c)?$/i;
const tyreParts = (v) => { const m = String(v.value).match(/^(\d+)(?:\/(\d+))?R(\d+)(C)?$/); return m ? { w: +m[1], a: m[2] ? +m[2] : null, r: +m[3], c: !!m[4] } : null; };
export const tyreSize = {
  id: "tyre-size", base: "mm", units: [],
  parse(raw) {
    if (raw && typeof raw === "object") {
      if (raw.scale && raw.scale !== "tyre-size") return badValue("That is not a tyre size.");
      raw = raw.value;
    }
    const text = String(raw ?? "").trim().replace(/\s+/g, " ");
    const m = text.match(TYRE);
    if (!m) return badValue("Enter a tyre size like 205/55 R16.");
    const w = +m[1], a = m[2] ? +m[2] : null, r = +m[3];
    if (w < 100 || w > 450) return badValue(`Section width ${w} is not possible (100 to 450 mm).`);
    if (a != null && (a < 25 || a > 95)) return badValue(`Aspect ratio ${a} is not possible (25 to 95).`);
    if (r < 10 || r > 30) return badValue(`Rim size ${r} is not possible (10 to 30 inches).`);
    return okValue({ scale: "tyre-size", system: "metric", value: `${w}${a != null ? "/" + a : ""}R${r}${m[4] ? "C" : ""}`, width: w });
  },
  format: (v) => { const t = v && tyreParts(v); return t ? `${t.w}${t.a != null ? "/" + t.a : ""} R${t.r}${t.c ? "C" : ""}` : ""; },
  sizeKey: (v) => keyOf("tyre-size", v.system ?? "metric", v.value),
  /** Overall diameter in mm; a size without an aspect ratio counts as 80. */
  toBase(v) { const t = v && tyreParts(v); return t ? round(t.r * 25.4 + 2 * t.w * ((t.a ?? 80) / 100), 3) : null; },
  compare(a, b) {
    const x = tyreParts(a), y = tyreParts(b);
    return compareBase([x.r, x.w, x.a ?? 0], [y.r, y.w, y.a ?? 0]);
  },
  plausible(typeId, _axis, v) {
    const t = v && tyreParts(v);
    if (!t) return impossible("tyre-size: not a valid value.");
    if (t.w < 100 || t.w > 450 || (t.a != null && (t.a < 25 || t.a > 95)) || t.r < 10 || t.r > 30) return impossible(`${tyreSize.format(v)} cannot be a tyre size.`);
    if (t.w % 5) return fine(`Tyre widths go up in steps of 5 mm; ${t.w} is unusual.`);
    if (t.a != null && t.a % 5) return fine(`Aspect ratios go up in steps of 5; ${t.a} is unusual.`);
    if (t.w < 135 || t.w > 325) return fine(`A ${t.w} mm wide tyre is unusual for road vehicles.`);
    if (t.r < 12 || t.r > 24) return fine(`A ${t.r} inch rim is unusual for cars and vans.`);
    return fine();
  }
};

// ---- paper-size: a fixed list. Dimensions in mm (width x height).
const PAPER = {
  a0: [841, 1189], a1: [594, 841], a2: [420, 594], a3: [297, 420], a4: [210, 297], a5: [148, 210], a6: [105, 148], a7: [74, 105],
  b4: [250, 353], b5: [176, 250], b6: [125, 176], c3: [324, 458], c4: [229, 324], c5: [162, 229], c6: [114, 162], dl: [110, 220],
  letter: [216, 279], legal: [216, 356]
};
const PAPER_LABEL = (id) => (id === "letter" || id === "legal" ? id[0].toUpperCase() + id.slice(1) : id.toUpperCase());
export const PAPER_SIZES = Object.keys(PAPER).map((id) => ({ id, label: PAPER_LABEL(id), widthMm: PAPER[id][0], heightMm: PAPER[id][1] }));
export const paperSize = {
  id: "paper-size", base: "mm2", units: [],
  parse(raw) {
    if (raw && typeof raw === "object") {
      if (raw.scale && raw.scale !== "paper-size") return badValue("That is not a paper size.");
      raw = raw.value;
    }
    const id = String(raw ?? "").toLowerCase().replace(/\b(paper|size|sheet)\b/g, "").replace(/[\s\-_.]/g, "");
    if (!PAPER[id]) return badValue(`Unknown paper size. Use ${PAPER_SIZES.map((p) => p.label).join(", ")}.`);
    return okValue({ scale: "paper-size", system: id === "letter" || id === "legal" ? "us" : "iso", value: PAPER_LABEL(id) });
  },
  format(v, opts = {}) {
    const p = v && PAPER[String(v.value).toLowerCase()];
    return !p ? "" : opts.dimensions ? `${v.value} (${p[0]} × ${p[1]} mm)` : String(v.value);
  },
  sizeKey: (v) => keyOf("paper-size", v.system, v.value),
  toBase: (v) => { const p = v && PAPER[String(v.value).toLowerCase()]; return p ? p[0] * p[1] : null; },
  compare(a, b) { return compareBase(paperSize.toBase(a), paperSize.toBase(b)); },
  plausible(typeId, axisKey, v) {
    if (!v || !PAPER[String(v.value).toLowerCase()]) return impossible("paper-size: unknown size.");
    const id = String(v.value).toLowerCase();
    if (typeId === "printing" && (id === "a0" || id === "a1")) return fine(`${v.value} is a large-format size. Check you can print it.`);
    return fine();
  }
};

// ---- print-size: photo prints "4x6", "8 x 10 in", "10 x 15 cm", or the lab names 4R 5R 6R 8R 10R 12R (inches).
const R_SIZES = { "4r": [4, 6], "5r": [5, 7], "6r": [6, 8], "8r": [8, 10], "10r": [10, 12], "12r": [12, 18] };
export const printSize = {
  id: "print-size", base: "mm2", units: ["in", "cm"],
  parse(raw, ctx = {}) {
    if (raw && typeof raw === "object") {
      if (raw.scale && raw.scale !== "print-size") return badValue("That is not a print size.");
      raw = `${raw.value}${raw.unit ? " " + raw.unit : ""}`;
    }
    const text = String(raw ?? "").trim();
    const lab = R_SIZES[text.toLowerCase().replace(/\s+/g, "")];
    if (lab) return okValue({ scale: "print-size", value: pairValue(lab), unit: "in", width: lab[0] });
    const r = readPair(text, ["in", "cm"]);
    if (r.error) return badValue(r.error);
    const unit = r.unit ?? unitFrom(ctx.unit ?? "", ["in", "cm"]) ?? "in";
    const [a, b] = sorted(r.nums);
    if (a * MM[unit] < 12 || b * MM[unit] > 5100) return badValue(`${fmtNum(a)} x ${fmtNum(b)} ${unit} is not a print size.`);
    return okValue({ scale: "print-size", value: pairValue([a, b]), unit, width: round(a) });
  },
  format: (v) => (v ? `${v.value.replace("x", " x ")} ${v.unit}` : ""),
  sizeKey: (v) => keyOf("print-size", v.system, v.value, v.unit),
  toBase: (v) => (v ? round(pairNums(v).reduce((a, n) => a * n * MM[v.unit], 1), 3) : null),
  compare(a, b) { return compareBase(printSize.toBase(a), printSize.toBase(b)); },
  plausible(typeId, _axis, v) {
    if (!v || !MM[v.unit]) return impossible("print-size: not a valid value.");
    const [a, b] = pairNums(v).map((n) => n * MM[v.unit]);
    if (!(a >= 12 && b <= 5100)) return impossible(`${printSize.format(v)} cannot be a print size.`);
    return a < 50 || b > 1000 ? fine(`${printSize.format(v)} is unusual for a print (50 mm to 1 m). Check the unit.`) : fine();
  }
};

// ---- frame-size: eye-bridge-temple in mm, written 52-18-140 (also 52/18/140 and 52□18-140). width = eye size.
const FRAME = /^(\d{2,3})\s*[-/□ ]\s*(\d{1,2})\s*[-/ ]\s*(\d{3})$/;
const frameParts = (v) => String(v.value).split("-").map(Number);
export const frameSize = {
  id: "frame-size", base: "mm", units: ["mm"],
  parse(raw) {
    if (raw && typeof raw === "object") {
      if (raw.scale && raw.scale !== "frame-size") return badValue("That is not a frame size.");
      raw = raw.value;
    }
    const m = String(raw ?? "").trim().replace(/mm$/i, "").trim().match(FRAME);
    if (!m) return badValue("Enter eye, bridge and temple in mm, like 52-18-140.");
    const [eye, bridge, temple] = [+m[1], +m[2], +m[3]];
    if (eye < 30 || eye > 70) return badValue(`Eye size ${eye} is not possible (30 to 70 mm).`);
    if (bridge < 8 || bridge > 30) return badValue(`Bridge ${bridge} is not possible (8 to 30 mm).`);
    if (temple < 100 || temple > 160) return badValue(`Temple ${temple} is not possible (100 to 160 mm).`);
    return okValue({ scale: "frame-size", value: `${eye}-${bridge}-${temple}`, unit: "mm", width: eye });
  },
  format: (v, opts = {}) => {
    if (!v) return "";
    const [e, b, t] = frameParts(v);
    return opts.labels ? `Eye ${e} · Bridge ${b} · Temple ${t} mm` : `${e}-${b}-${t}`;
  },
  sizeKey: (v) => keyOf("frame-size", v.system, v.value, v.unit),
  toBase: (v) => (v ? frameParts(v)[0] : null),
  compare: (a, b) => compareBase(frameParts(a), frameParts(b)),
  plausible(typeId, _axis, v) {
    if (!v) return impossible("frame-size: not a valid value.");
    const [e, b, t] = frameParts(v);
    if (e < 30 || e > 70 || b < 8 || b > 30 || t < 100 || t > 160) return impossible(`${v.value} cannot be a frame size.`);
    if (e < 40 || e > 62) return fine(`Eye size ${e} is outside the usual 40 to 62 mm.`);
    if (b < 12 || b > 24) return fine(`Bridge ${b} is outside the usual 12 to 24 mm.`);
    if (t < 120 || t > 155) return fine(`Temple ${t} is outside the usual 120 to 155 mm.`);
    return fine();
  }
};

export const SIZE_SCALES = [bedSize, crossSection, tyreSize, paperSize, printSize, frameSize];
