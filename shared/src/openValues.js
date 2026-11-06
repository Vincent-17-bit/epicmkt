// A18: the open values dictionary (typed material, colour, brand, finish, flavour).
//
// A seller may type a value that is not in the shared list. It is usable at once, shown to buyers exactly as typed, and queued for
// admin review. What makes "Samsung", "SAMSUNG" and " samsung " one filter choice is the canonical KEY below. The database has the same
// function (public.normalize_value_key, migration 0089); supabase/tests/open-values.test.mjs checks that the two agree on a shared table,
// so change both together.
//
// normalizeValueKey(raw) rules, in this order:
//   1. text only; anything else (null, numbers, objects) gives "".
//   2. Unicode NFKD, accents removed ("Crème" -> "creme"), then recomposed (NFC) so other scripts keep their shape.
//   3. lower case.
//   4. apostrophes and backticks dropped ("Levi's" -> "levis"); "&" read as "and" ("Black & Decker" == "Black and Decker").
//   5. every run of spaces, punctuation and symbols becomes ONE space ("Wine-red", "wine  red", "Wine/Red" -> "wine red").
//   6. trimmed. A value with no letters or digits left gives "" and is not a valid value.
// Letters outside a-z (Swahili, Arabic, CJK ...) pass through unchanged.

export const VALUE_KINDS = Object.freeze(["material", "color", "brand", "finish", "flavour"]);
export const VALUE_STATUSES = Object.freeze(["pending", "approved", "merged"]);
export const MAX_LABEL = 60;
export const MAX_TAGS = 8;
export const MAX_TAG = 30;

const MARKS = /[̀-ͯ]/g;
const DROPPED = /['‘’ʼ`´]/g;
// ASCII punctuation and whitespace, plus the common typographic dashes, dots and symbols. Same set as the SQL function.
const SEPARATORS = /[\s!"#$%()*+,\-./:;<=>?@[\\\]^_{|}~‐-―…·• 　]+/g;

export function normalizeValueKey(raw) {
  if (typeof raw !== "string") return "";
  return raw
    .normalize("NFKD")
    .replace(MARKS, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(DROPPED, "")
    .replace(/&/g, " and ")
    .replace(SEPARATORS, " ")
    .trim();
}

// The label as the seller typed it, tidied: trimmed, inner whitespace folded to single spaces. Case and punctuation are kept.
export function cleanValueLabel(raw) {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\s 　]+/g, " ").trim();
}

export const isHexColor = (v) => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);

// -> { ok: true, value: { kind, label, key, hex, tags } } or { ok: false, error: { code, message } }
export function validateOpenValue(input) {
  const fail = (code, message) => ({ ok: false, error: { code, message } });
  const kind = input?.kind;
  if (!VALUE_KINDS.includes(kind)) return fail("invalid_kind", `Kind must be one of: ${VALUE_KINDS.join(", ")}.`);
  const label = cleanValueLabel(input?.label);
  const key = normalizeValueKey(label);
  if (!key) return fail("invalid_label", "Enter a value with letters or numbers.");
  if (label.length > MAX_LABEL) return fail("label_too_long", `A value can be up to ${MAX_LABEL} characters.`);
  let hex = null;
  if (input?.hex !== undefined && input.hex !== null && input.hex !== "") {
    if (kind !== "color") return fail("hex_not_allowed", "Only colours have a shade.");
    if (!isHexColor(input.hex)) return fail("invalid_hex", "A shade looks like #A1B2C3.");
    hex = input.hex.toLowerCase();
  }
  const tags = [];
  for (const t of input?.tags ?? []) {
    const tag = normalizeValueKey(String(t ?? "")).replace(/ /g, "-");
    if (!tag || tag.length > MAX_TAG) return fail("invalid_tag", `A tag is 1 to ${MAX_TAG} letters or numbers.`);
    if (!tags.includes(tag)) tags.push(tag);
  }
  if (tags.length > MAX_TAGS) return fail("too_many_tags", `At most ${MAX_TAGS} tags.`);
  return { ok: true, value: { kind, label, key, hex, tags } };
}

// Ranking used by seller_option_values and by offline pickers: 0 exact, 1 key starts with the query, 2 a word starts with it, else -1.
export function matchRank(key, queryKey) {
  if (!queryKey || !key) return -1;
  if (key === queryKey) return 0;
  if (key.startsWith(queryKey)) return 1;
  if (key.includes(" " + queryKey)) return 2;
  return -1;
}

// Same order as the database: rank, approved before pending, more used first, then A to Z. Merged values are never offered.
// values: [{ id, kind, label, key?, status, use_count? }]
export function matchOpenValues(values, kind, query, { limit = 8 } = {}) {
  const q = normalizeValueKey(query);
  return (values ?? [])
    .filter((v) => v && v.kind === kind && v.status !== "merged")
    .map((v) => ({ v, rank: matchRank(v.key ?? normalizeValueKey(v.label), q) }))
    .filter((x) => x.rank >= 0)
    .sort((a, b) =>
      a.rank - b.rank
      || (b.v.status === "approved") - (a.v.status === "approved")
      || (b.v.use_count ?? 0) - (a.v.use_count ?? 0)
      || a.v.label.localeCompare(b.v.label))
    .slice(0, limit)
    .map((x) => x.v);
}

// Cases the SQL function must answer the same way (the db test runs this table against Postgres).
export const KEY_CASES = Object.freeze([
  ["Samsung", "samsung"], ["SAMSUNG", "samsung"], ["  samsung  ", "samsung"],
  ["Wine red", "wine red"], ["Wine-red", "wine red"], ["wine   RED", "wine red"], ["Wine/Red", "wine red"],
  ["Black & Decker", "black and decker"], ["Black&Decker", "black and decker"], ["Black and Decker", "black and decker"],
  ["Levi's", "levis"], ["Levi’s", "levis"], ["Mahogany veneer", "mahogany veneer"],
  ["Crème brûlée", "creme brulee"], ["Maïzena", "maizena"], ["Ｓａｍ", "sam"],
  ["Coca-Cola", "coca cola"], ["Dr. Pepper", "dr pepper"], ["3.5 mm", "3 5 mm"], ["Rose gold (18k)", "rose gold 18k"],
  ["Kiswahili – Nyekundu", "kiswahili nyekundu"], [" padded ", "padded"],
  ["---", ""], ["  ", ""], ["", ""], ["'", ""]
]);
