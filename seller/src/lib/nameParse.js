// Reads sizes out of what the seller typed ("128GB", "9W", "E27", "A4", "20L") and offers them as chips to accept.
// It never saves anything itself: a chip only fills a row of the chosen type when the seller taps it (B19).
import { normalizeValueKey, rowChoices, scales } from "@epicmkt/shared";

const parse = scales.parse;

const KINDS = [
  { kind: "storage", scale: "storage", find: /\b(\d{1,4})\s?(gb|tb)\b/i, text: (m) => `${m[1]} ${m[2].toUpperCase()}`, row: /storage|memory|rom|capacity/ },
  { kind: "power", scale: "power", find: /\b(\d{1,4}(?:\.\d)?)\s?w\b/i, text: (m) => `${m[1]} W`, row: /watt|power/ },
  { kind: "base", find: /\b(e27|e14|e12|b22|gu10|gu5\.3|mr16)\b/i, text: (m) => m[1].toUpperCase(), row: /base|socket|fitting|cap\b/ },
  { kind: "paper", scale: "paper-size", find: /\b(A[0-6])\b/, text: (m) => m[1], row: /paper/ },
  { kind: "volume", scale: "volume", find: /\b(\d{1,4}(?:\.\d)?)\s?(l|ml|litres?|liters?)\b/i, text: (m) => `${m[1]} ${/^m/i.test(m[2]) ? "ml" : "L"}`, row: /volume|litre|capacity/ }
];

/** What a name mentions: [{ kind, text }], in the order the name mentions them. Only values the matching scale accepts. */
export function parseName(name) {
  const source = String(name ?? "");
  const found = [];
  for (const k of KINDS) {
    const m = k.find.exec(source);
    if (!m) continue;
    const text = k.text(m);
    if (k.scale && !parse(k.scale, text.replace(/\s/g, "")).ok) continue;
    found.push({ kind: k.kind, text, at: m.index });
  }
  return found.sort((a, b) => a.at - b.at).map(({ kind, text }) => ({ kind, text }));
}

const rowText = (row) => `${row.key ?? ""} ${normalizeValueKey(row.label ?? "")}`.toLowerCase();

/**
 * The chips worth showing: each needs a row of the item's type to land in, an empty answer there, and, for a row with a fixed list,
 * a value from that list. `has(row)` says whether the row already has an answer. Returns [{ kind, text, row, value }].
 */
export function nameChips(name, rows, has = () => false) {
  const chips = [];
  const used = new Set();
  for (const hit of parseName(name)) {
    const kind = KINDS.find((k) => k.kind === hit.kind);
    const row = (rows ?? []).find((r) => !used.has(r.key) && kind.row.test(rowText(r)) && !has(r));
    if (!row) continue;
    let value = hit.text;
    const choices = rowChoices(row);
    if (choices) {
      const match = choices.find((c) => normalizeValueKey(c) === normalizeValueKey(hit.text));
      if (!match) continue;
      value = match;
    }
    used.add(row.key);
    chips.push({ ...hit, row, value });
  }
  return chips;
}
