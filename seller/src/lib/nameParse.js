import { scales, similarKey } from "@epicmkt/shared";

const { parse, format } = scales;

const UNITS = [
  { scale: "storage", re: /^(?:gb|tb|mb)$/i, hints: ["storage", "memory", "capacity"] },
  { scale: "power", re: /^(?:w|kw)$/i, hints: ["power", "wattage", "watt"] },
  { scale: "volume", re: /^(?:l|ml|ltr|ltrs|litre|litres|liter|liters)$/i, hints: ["volume", "size", "capacity"] },
  { scale: "weight", re: /^(?:g|kg|gram|grams)$/i, hints: ["weight", "size"] },
  { scale: "voltage", re: /^v$/i, hints: ["voltage"] },
  { scale: "battery-capacity", re: /^mah$/i, hints: ["battery", "capacity"] },
  { scale: "color-temperature", re: /^k$/i, hints: ["colour temperature", "color temperature", "temperature"] },
  { scale: "screen-inch", re: /^(?:in|inch|inches)$/i, hints: ["screen"] }
];
const BASES = /^(?:E(?:12|14|27|40)|B22|B15|GU(?:5\.3|10)|MR16|G9)$/i;
const PAPER = /^A(?:[0-9]|10)$/i;

const NUMBER_UNIT = /(?<![\w.])(\d+(?:\.\d+)?)\s?([a-zA-Z]{1,8})(?![\w])/g;
const WORD_CODE = /(?<![\w.])([A-Za-z]{1,2}\d{1,2}(?:\.\d)?)(?![\w])/g;

export function readName(name) {
  const text = String(name ?? "");
  const out = [];
  const seen = new Set();
  const add = (chip) => {
    const key = `${chip.scale}:${chip.label.toLowerCase()}`;
    if (!seen.has(key)) { seen.add(key); out.push(chip); }
  };
  for (const m of text.matchAll(NUMBER_UNIT)) {
    const unit = UNITS.find((u) => u.re.test(m[2]));
    if (!unit) continue;
    const r = parse(unit.scale, m[0].replace(/\s+/g, ""), {});
    if (r.ok) add({ scale: unit.scale, raw: m[0], value: r.value, label: format(r.value), hints: unit.hints });
  }
  for (const m of text.matchAll(WORD_CODE)) {
    if (BASES.test(m[1])) add({ scale: "lamp-base", raw: m[1], value: null, label: m[1].toUpperCase(), hints: ["base", "socket", "cap"] });
    else if (PAPER.test(m[1])) {
      const r = parse("paper-size", m[1].toUpperCase(), {});
      if (r.ok) add({ scale: "paper-size", raw: m[1], value: r.value, label: format(r.value), hints: ["paper size", "size"] });
    }
  }
  return out;
}

const norm = (s) => String(s ?? "").toLowerCase();

export function rowFor(chip, rows) {
  for (const hint of chip.hints) {
    const hit = rows.find((r) => norm(r.label).includes(hint));
    if (hit) return hit;
  }
  return null;
}

export function duplicateOf(name, items) {
  const key = similarKey(name);
  if (!key) return null;
  const hits = items.filter((i) => !i.removedByAdmin && similarKey(i.name) === key);
  return hits.find((i) => norm(i.name).trim() === norm(name).trim()) ?? hits[0] ?? null;
}
