import { LISTING_AVAILABILITY } from "../filters.js";

export const IMPORT_LIMITS = { maxBytes: 2 * 1024 * 1024, maxRows: 500 };
export const IMPORT_FIELDS = [
  { key: "name", label: "Name", required: true },
  { key: "price_type", label: "Price type" },
  { key: "price", label: "Price" },
  { key: "price_max", label: "Highest price" },
  { key: "unit", label: "Unit" },
  { key: "availability", label: "Availability" },
  { key: "section", label: "Section" },
  { key: "tags", label: "Tags" }
];

const SYNONYMS = {
  name: ["name", "item", "item name", "product", "product name", "title", "service"],
  price_type: ["price type", "pricing", "pricing type", "type of price"],
  price: ["price", "cost", "amount", "kes", "ksh", "price kes"],
  price_max: ["price max", "max price", "highest price", "price to", "maximum price", "upper price"],
  unit: ["unit", "per", "uom"],
  availability: ["availability", "status", "stock status", "available"],
  section: ["section", "category", "group", "department"],
  tags: ["tags", "keywords", "search tags", "labels"]
};

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const PRICE_TYPES = { fixed: "fixed", from: "from", "starting from": "from", range: "range", free: "free", contact: "contact", "contact for price": "contact", "ask": "contact", "call": "contact" };

const AVAILABILITY_WORDS = Object.fromEntries([
  ...LISTING_AVAILABILITY.map((a) => [norm(a), a]),
  ["in stock", "available"],
  ["limited", "limited_stock"],
  ["low stock", "limited_stock"],
  ["sold out", "out_of_stock"],
  ["appointment", "by_appointment"],
  ["soon", "coming_soon"]
]);

const FORMULA_START = /^[=+\-@\t\r]/;

export const hasFormulaStart = (value) => FORMULA_START.test(String(value ?? ""));

export function detectDelimiter(text) {
  const first = String(text).split(/\r?\n/, 1)[0] ?? "";
  const counts = { "\t": 0, ",": 0, ";": 0 };
  let quoted = false;
  for (const ch of first) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch in counts) counts[ch] += 1;
  }
  if (counts["\t"] > 0) return "\t";
  return counts[";"] > counts[","] ? ";" : ",";
}

export function parseDelimited(text, delimiter = detectDelimiter(text)) {
  const src = String(text).replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}

export function suggestMapping(headers) {
  const mapping = {};
  const used = new Set();
  for (const field of IMPORT_FIELDS) {
    const idx = headers.findIndex((h, i) => !used.has(i) && SYNONYMS[field.key].includes(norm(h)));
    if (idx >= 0) {
      mapping[field.key] = idx;
      used.add(idx);
    }
  }
  return mapping;
}

export function looksLikeHeader(row) {
  const cells = row.map(norm);
  return IMPORT_FIELDS.some((f) => cells.some((c) => SYNONYMS[f.key].includes(c)));
}

export function checkInput(text, bytes = new TextEncoder().encode(String(text)).length) {
  if (bytes > IMPORT_LIMITS.maxBytes) return { ok: false, error: "That file is larger than 2 MB. Split it into smaller files." };
  return { ok: true };
}

export function readTable(text) {
  const size = checkInput(text);
  if (!size.ok) return size;
  const all = parseDelimited(text);
  if (all.length === 0) return { ok: false, error: "No rows found. Paste your rows or choose a file with data." };
  const header = looksLikeHeader(all[0]);
  const headers = header ? all[0].map((h) => String(h).trim()) : all[0].map((_, i) => `Column ${i + 1}`);
  const body = header ? all.slice(1) : all;
  if (body.length === 0) return { ok: false, error: "The file has headers but no rows." };
  if (body.length > IMPORT_LIMITS.maxRows) return { ok: false, error: `The file has ${body.length} rows. The limit is ${IMPORT_LIMITS.maxRows} rows at a time.` };
  return { ok: true, headers, rows: body, hasHeader: header, mapping: suggestMapping(headers) };
}

const wholeKes = (raw) => {
  const cleaned = String(raw).trim().replace(/^(kes|ksh|kshs|ksh\.|\/=)\s*/i, "").replace(/(\/=|\/-)$/, "").replace(/,/g, "").trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return { error: "Price must be a number." };
  const n = Number(cleaned);
  if (!Number.isInteger(n)) return { error: "Price must be a whole number of shillings." };
  if (n > 100_000_000) return { error: "Price is too large." };
  return { value: n };
};

export function validateRow(cells, mapping) {
  const get = (key) => (mapping[key] === undefined || mapping[key] === null ? "" : String(cells[mapping[key]] ?? "").trim());
  const errors = [];
  const raw = Object.fromEntries(IMPORT_FIELDS.map((f) => [f.key, get(f.key)]));
  for (const f of IMPORT_FIELDS) {
    if (hasFormulaStart(raw[f.key])) errors.push(`${f.label}: starts with =, +, - or @, which is not allowed.`);
  }
  if (errors.length) return { ok: false, errors, raw };

  const name = raw.name.replace(/\s+/g, " ");
  if (name.length < 2) errors.push("Name: enter at least 2 characters.");
  else if (name.length > 80) errors.push("Name: use 80 characters or fewer.");

  let priceType = "fixed";
  if (raw.price_type) {
    priceType = PRICE_TYPES[norm(raw.price_type)];
    if (!priceType) errors.push("Price type: use fixed, from, range, free or contact.");
  }

  let price = null;
  let priceMax = null;
  if (priceType === "free" || priceType === "contact") {
    if (raw.price) errors.push(`Price: leave blank for ${priceType} items.`);
  } else if (priceType) {
    if (!raw.price) errors.push("Price: enter a price.");
    else {
      const p = wholeKes(raw.price);
      if (p.error) errors.push(`Price: ${p.error.replace(/^Price /, "")}`);
      else price = p.value;
    }
    if (priceType === "range") {
      if (!raw.price_max) errors.push("Highest price: enter it for range prices.");
      else {
        const p = wholeKes(raw.price_max);
        if (p.error) errors.push(`Highest price: ${p.error.replace(/^Price /, "")}`);
        else priceMax = p.value;
      }
      if (price !== null && priceMax !== null && priceMax <= price) errors.push("Highest price: must be above the price.");
    } else if (raw.price_max) errors.push("Highest price: only used with range prices.");
  }

  let availability = "available";
  if (raw.availability) {
    availability = AVAILABILITY_WORDS[norm(raw.availability)];
    if (!availability) errors.push(`Availability: use ${LISTING_AVAILABILITY.map((a) => a.replace(/_/g, " ")).join(", ")}.`);
  }

  const unit = raw.unit.replace(/\s+/g, " ");
  if (unit.length > 30) errors.push("Unit: use 30 characters or fewer.");

  const section = raw.section.replace(/\s+/g, " ");
  if (section.length > 40) errors.push("Section: use 40 characters or fewer.");

  const tags = raw.tags
    ? raw.tags
        .split(/[,;|]/)
        .map((t) => t.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .filter((t, i, all) => all.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i)
    : [];
  if (tags.length > 15) errors.push("Tags: use 15 tags or fewer.");
  if (tags.some((t) => t.length > 30)) errors.push("Tags: each tag must be 30 characters or fewer.");

  if (errors.length) return { ok: false, errors, raw };
  return { ok: true, raw, item: { name, price_type: priceType, price, price_max: priceMax, unit: unit || null, availability, section: section || null, search_tags: tags } };
}

export const canImport = (plan) => plan === "premium";

export function validateImport(rows, mapping, { capacity = Infinity } = {}) {
  const results = rows.map((cells, i) => ({ row: i + 1, cells, ...validateRow(cells, mapping) }));
  let room = capacity;
  for (const r of results) {
    if (!r.ok) continue;
    if (room <= 0) {
      r.ok = false;
      r.errors = ["Over your plan limit: this row was not imported."];
      delete r.item;
    } else room -= 1;
  }
  const valid = results.filter((r) => r.ok);
  const rejected = results.filter((r) => !r.ok);
  return { results, valid, rejected, items: valid.map((r) => r.item), overLimit: rejected.filter((r) => r.errors[0]?.startsWith("Over your plan limit")).length };
}

export function importProblem(mapping) {
  if (mapping.name === undefined || mapping.name === null) return "Choose which column holds the item name.";
  return null;
}

const csvCell = (value) => {
  let s = String(value ?? "");
  if (hasFormulaStart(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function errorReportCsv(rejected, headers) {
  const head = ["Row", ...headers, "Problems"];
  const lines = [head.map(csvCell).join(",")];
  for (const r of rejected) lines.push([r.row, ...headers.map((_, i) => r.cells[i] ?? ""), r.errors.join(" ")].map(csvCell).join(","));
  return lines.join("\r\n");
}
