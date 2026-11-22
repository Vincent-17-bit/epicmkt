const VOLUME = { ml: 1, millilitre: 1, millilitres: 1, milliliter: 1, milliliters: 1, cl: 10, dl: 100, l: 1000, lt: 1000, ltr: 1000, ltrs: 1000, litre: 1000, litres: 1000, liter: 1000, liters: 1000 };
const WEIGHT = { mg: 0.001, g: 1, gm: 1, gms: 1, gram: 1, grams: 1, kg: 1000, kgs: 1000, kilo: 1000, kilos: 1000, kilogram: 1000, kilograms: 1000 };
const COUNT = "packs?|pk|pks|pcs?|pieces?|pce|ct|count|units?";

const unitWords = [...Object.keys(VOLUME), ...Object.keys(WEIGHT)].sort((a, b) => b.length - a.length).join("|");
const AMOUNT = new RegExp(`(?<![\\w.])(\\d+(?:[.,]\\d+)?)\\s*(${unitWords})(?![a-z])`, "g");
const PACK = new RegExp(`(?<![\\w.])(\\d+)\\s*[- ]?\\s*(?:${COUNT})(?![a-z])`, "g");
const PACK_OF = /(?<![a-z])(?:pack|packs|box|set|carton|bundle|case|dozen)\s+of\s+(\d+)(?!\d)/g;
const SINGLE = /(?<![a-z])(?:single|individual|each)(?![a-z])/g;

const clean = (n) => String(Math.round(n * 1000) / 1000);

const spans = (text) => {
  const lower = String(text ?? "").toLowerCase().replace(/(\d),(\d{3})(?!\d)/g, "$1$2");
  const found = [];
  for (const m of lower.matchAll(AMOUNT)) {
    const n = Number(m[1].replace(",", "."));
    const unit = m[2];
    if (!Number.isFinite(n) || n <= 0) continue;
    const token = unit in VOLUME ? `${clean(n * VOLUME[unit])}ml` : `${clean(n * WEIGHT[unit])}g`;
    found.push({ token, start: m.index, end: m.index + m[0].length });
  }
  for (const m of lower.matchAll(PACK)) found.push({ token: `${Number(m[1])}pc`, start: m.index, end: m.index + m[0].length });
  for (const m of lower.matchAll(PACK_OF)) found.push({ token: `${Number(m[1])}pc`, start: m.index, end: m.index + m[0].length });
  for (const m of lower.matchAll(SINGLE)) found.push({ token: "1pc", start: m.index, end: m.index + m[0].length });
  return { lower, found };
};

export const measureTokens = (text) => [...new Set(spans(text).found.map((f) => f.token))];

export function splitMeasures(text) {
  const { lower, found } = spans(text);
  let rest = "";
  let at = 0;
  for (const f of [...found].sort((a, b) => a.start - b.start)) {
    if (f.start < at) continue;
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
