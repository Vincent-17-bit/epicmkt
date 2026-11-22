const UNITS = {
  ml: ["ml", 1], millilitre: ["ml", 1], millilitres: ["ml", 1], milliliter: ["ml", 1], milliliters: ["ml", 1], cl: ["ml", 10], dl: ["ml", 100],
  l: ["ml", 1000], lt: ["ml", 1000], ltr: ["ml", 1000], ltrs: ["ml", 1000], lita: ["ml", 1000], litre: ["ml", 1000], litres: ["ml", 1000], liter: ["ml", 1000], liters: ["ml", 1000],
  mg: ["g", 0.001], g: ["g", 1], gm: ["g", 1], gms: ["g", 1], gram: ["g", 1], grams: ["g", 1], kg: ["g", 1000], kgs: ["g", 1000], kilo: ["g", 1000], kilos: ["g", 1000], kilogram: ["g", 1000], kilograms: ["g", 1000],
  mm: ["mm", 1], cm: ["mm", 10], metre: ["mm", 1000], metres: ["mm", 1000], meter: ["mm", 1000], meters: ["mm", 1000], inch: ["mm", 25.4], inches: ["mm", 25.4], ft: ["mm", 304.8], feet: ["mm", 304.8],
  mb: ["gb", 1 / 1024], gb: ["gb", 1], tb: ["gb", 1024],
  kw: ["w", 1000], watt: ["w", 1], watts: ["w", 1], volt: ["v", 1], volts: ["v", 1], ah: ["ah", 1], mah: ["ah", 0.001]
};
const ATTACHED = { m: ["mm", 1000], w: ["w", 1], v: ["v", 1] };
const FRACTION_WORDS = { half: 0.5, nusu: 0.5, quarter: 0.25, robo: 0.25 };
const COUNT = "packs?|pk|pks|pcs?|pieces?|pce|ct|count|units?";

const unitWords = Object.keys(UNITS).sort((a, b) => b.length - a.length).join("|");
const FRACTION = new RegExp(`(?<![\\w./])(\\d+)\\s*/\\s*(\\d+)\\s*(?:(${unitWords})|(")|(?=\\s|$))(?![a-z])`, "g");
const WORD_FRACTION = new RegExp(`(?<![a-z])(${Object.keys(FRACTION_WORDS).join("|")})\\s+(?:a\\s+|of\\s+a\\s+)?(${unitWords})(?![a-z])`, "g");
const AMOUNT = new RegExp(`(?<![\\w./])(\\d+(?:[.,]\\d+)?)\\s*(${unitWords})(?![a-z])`, "g");
const ATTACHED_AMOUNT = new RegExp(`(?<![\\w./])(\\d+(?:[.,]\\d+)?)(${Object.keys(ATTACHED).join("|")})(?![a-z0-9])`, "g");
const INCH_MARK = /(?<![\w./])(\d+(?:\.\d+)?)\s*"/g;
const PACK = new RegExp(`(?<![\\w.])(\\d+)\\s*[- ]?\\s*(?:${COUNT})(?![a-z])`, "g");
const PACK_OF = /(?<![a-z])(?:pack|packs|box|set|carton|bundle|case|dozen)\s+of\s+(\d+)(?!\d)/g;
const BEDS = /(?<![\w.])(\d+)\s*[- ]?\s*(?:bedrooms?|bedroom|bdrms?|beds?|br)(?![a-z])/g;
const SINGLE = /(?<![a-z])(?:single|individual|each)(?![a-z])/g;
const MZINGA = /(?<![a-z])mzinga(?![a-z])/g;

const clean = (n) => String(Math.round(n * 1000) / 1000);
const amount = (n, [suffix, factor]) => `${clean(n * factor)}${suffix}`;

function spans(text) {
  const lower = String(text ?? "").toLowerCase().replace(/(\d),(\d{3})(?!\d)/g, "$1$2");
  const found = [];
  const add = (token, m) => {
    const start = m.index;
    const end = m.index + m[0].length;
    if (found.some((f) => start < f.end && end > f.start)) return;
    found.push({ token, start, end });
  };
  for (const m of lower.matchAll(FRACTION)) {
    const n = Number(m[1]) / Number(m[2]);
    const unit = m[3] ? UNITS[m[3]] : m[4] ? UNITS.inch : null;
    if (unit && Number.isFinite(n) && n > 0 && Number(m[2]) > 0) add(amount(n, unit), m);
  }
  for (const m of lower.matchAll(WORD_FRACTION)) add(amount(FRACTION_WORDS[m[1]], UNITS[m[2]]), m);
  for (const m of lower.matchAll(AMOUNT)) {
    const n = Number(m[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) add(amount(n, UNITS[m[2]]), m);
  }
  for (const m of lower.matchAll(ATTACHED_AMOUNT)) {
    const n = Number(m[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) add(amount(n, ATTACHED[m[2]]), m);
  }
  for (const m of lower.matchAll(INCH_MARK)) add(amount(Number(m[1]), UNITS.inch), m);
  for (const m of lower.matchAll(BEDS)) add(`${Number(m[1])}bed`, m);
  for (const m of lower.matchAll(PACK)) add(`${Number(m[1])}pc`, m);
  for (const m of lower.matchAll(PACK_OF)) add(`${Number(m[1])}pc`, m);
  for (const m of lower.matchAll(SINGLE)) add("1pc", m);
  for (const m of lower.matchAll(MZINGA)) add("750ml", m);
  return { lower, found };
}

export const measureTokens = (text) => [...new Set(spans(text).found.map((f) => f.token))];

export function splitMeasures(text) {
  const { lower, found } = spans(text);
  let rest = "";
  let at = 0;
  for (const f of [...found].sort((a, b) => a.start - b.start)) {
    rest += `${lower.slice(at, f.start)} `;
    at = f.end;
  }
  rest += lower.slice(at);
  return { rest: rest.replace(/\s+/g, " ").trim(), measures: [...new Set(found.map((f) => f.token))] };
}

export const canonicalMeasureKey = (text) => {
  const { rest, measures } = splitMeasures(text);
  return [rest, ...measures].filter(Boolean).join(" ");
};
