import { DB_AVAILABILITY } from "./filters.js";

export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 500;
export const IMPORT_FIELDS = ["name", "price_type", "price", "unit", "availability", "section", "tags", "brand", "short_description", "pack_size", "terms", "includes"];
export const IMPORT_LABELS = {
  name: "Name", price_type: "Price type", price: "Price", unit: "Unit", availability: "Availability", section: "Section", tags: "Tags",
  brand: "Brand", short_description: "Short description", pack_size: "Pack size", terms: "Terms", includes: "Includes",
};
export const IMPORT_TEMPLATE = "name\tprice type\tprice\tunit\tavailability\tsection\ttags\tbrand\tshort description\tpack size\tterms\tincludes";

const HEADERS = {
  name: ["name", "item", "item name", "product", "product name", "title", "service"],
  price_type: ["price type", "price_type", "pricing", "pricing type", "type"],
  price: ["price", "cost", "amount", "kes", "ksh", "price kes", "price (kes)"],
  unit: ["unit", "per", "uom"],
  availability: ["availability", "status", "stock status", "available"],
  section: ["section", "category", "group", "menu section"],
  tags: ["tags", "tag", "keywords"],
  brand: ["brand", "make", "manufacturer"],
  short_description: ["short description", "short_description", "summary", "tagline"],
  pack_size: ["pack size", "pack_size", "pack", "package size"],
  terms: ["terms", "conditions", "terms and conditions"],
  includes: ["includes", "included", "what's included", "whats included", "in the box", "in the pack"],
};

const PRICE_TYPES = {
  fixed: "fixed", price: "fixed",
  from: "from", "starting at": "from", "starts at": "from", "from price": "from",
  range: "range",
  free: "free",
  contact: "contact", "contact for price": "contact", "call for price": "contact", quote: "contact",
};

const AVAILABILITY = {
  available: "available", "in stock": "available", yes: "available",
  limited: "limited_stock", "limited stock": "limited_stock", "low stock": "limited_stock", limited_stock: "limited_stock",
  "out of stock": "out_of_stock", "sold out": "out_of_stock", out_of_stock: "out_of_stock",
  unavailable: "unavailable", no: "unavailable",
  "by appointment": "by_appointment", appointment: "by_appointment", by_appointment: "by_appointment",
};

const FORMULA = /^[\s\u0000-\u001f​﻿]*[=+\-@]/;
export const startsWithFormula = (cell) => typeof cell === "string" && FORMULA.test(cell);

export const safeCell = (cell) => {
  const value = String(cell ?? "");
  return startsWithFormula(value) ? `'${value}` : value;
};

export const checkImportFile = (file) => {
  if (!file) return { ok: false, message: "Choose a file." };
  if (file.size > IMPORT_MAX_BYTES) return { ok: false, message: "That file is over 2 MB. Split it into smaller files." };
  const name = (file.name ?? "").toLowerCase();
  const type = file.type ?? "";
  if (!(name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt") || type === "text/csv" || type === "text/tab-separated-values" || type === "text/plain")) {
    return { ok: false, message: "Upload a .csv file." };
  }
  return { ok: true };
};

export const parseDelimited = (input) => {
  let text = String(input ?? "").replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return { delimiter, rows: rows.filter((r) => r.some((c) => c.trim() !== "")) };
};

const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export const detectMapping = (firstRow) => {
  const mapping = Object.fromEntries(IMPORT_FIELDS.map((f) => [f, null]));
  const used = new Set();
  firstRow.forEach((cell, index) => {
    const key = norm(cell);
    for (const field of IMPORT_FIELDS) {
      if (mapping[field] === null && !used.has(index) && HEADERS[field].includes(key)) {
        mapping[field] = index;
        used.add(index);
      }
    }
  });
  const matched = Object.values(mapping).filter((v) => v !== null).length;
  return { mapping, hasHeader: mapping.name !== null && matched >= 2 };
};

export const positionalMapping = (columns) =>
  Object.fromEntries(IMPORT_FIELDS.map((f, i) => [f, i < columns ? i : null]));

const parsePrice = (raw) => {
  const cleaned = raw.replace(/\s*(kes|ksh|kshs|\/=)\s*/gi, "").replace(/,/g, "").trim();
  if (cleaned === "") return { empty: true };
  const rangeMatch = cleaned.match(/^(\d+(?:\.\d{1,2})?)\s*(?:-|to)\s*(\d+(?:\.\d{1,2})?)$/i);
  if (rangeMatch) return { value: Number(rangeMatch[1]), max: Number(rangeMatch[2]) };
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return { error: "Price must be a number such as 1500." };
  return { value: Number(cleaned) };
};

const TAG_LIMIT = 10;
export const DETAIL_LIMITS = { brand: 60, short_description: 140, pack_size: 40, terms: 500, includes: 10, include: 80 };

export const validateRow = (cells, mapping) => {
  const get = (field) => (mapping[field] === null || mapping[field] === undefined ? "" : String(cells[mapping[field]] ?? "").trim());
  const errors = [];
  for (const field of IMPORT_FIELDS) {
    const index = mapping[field];
    if (index !== null && index !== undefined && startsWithFormula(String(cells[index] ?? ""))) {
      errors.push(`${IMPORT_LABELS[field]} starts with = + - or @ (spreadsheet formula). Remove that character.`);
    }
  }
  if (errors.length) return { errors };

  const name = get("name");
  if (name.length < 2) errors.push("Name needs at least 2 characters.");
  else if (name.length > 120) errors.push("Name is over 120 characters.");

  const typeRaw = norm(get("price_type"));
  let priceType = null;
  if (typeRaw) {
    priceType = PRICE_TYPES[typeRaw] ?? null;
    if (!priceType) errors.push(`Price type "${get("price_type")}" is not fixed, from, range, free or contact.`);
  }

  const price = parsePrice(get("price"));
  if (price.error) errors.push(price.error);
  if (!priceType && !price.error) priceType = price.empty ? "contact" : price.max !== undefined ? "range" : "fixed";

  let priceValue = null;
  let priceMax = null;
  if (priceType && !price.error) {
    if (priceType === "free") {
      if (!price.empty && price.value !== 0) errors.push("A free item cannot have a price.");
    } else if (priceType === "contact") {
      priceValue = null;
    } else if (price.empty) {
      errors.push("Price is required for this price type.");
    } else if (priceType === "range") {
      if (price.max === undefined) errors.push("A range needs two prices such as 1000-2000.");
      else if (price.max < price.value) errors.push("Range maximum is below the minimum.");
      else {
        priceValue = price.value;
        priceMax = price.max;
      }
    } else if (price.max !== undefined) {
      errors.push("Use the range price type for two prices.");
    } else priceValue = price.value;
    if (priceValue !== null && priceValue > 9999999999.99) errors.push("Price is too large.");
  }

  const unit = get("unit");
  if (unit.length > 30) errors.push("Unit is over 30 characters.");

  const availRaw = norm(get("availability"));
  let availability = "available";
  if (availRaw) {
    availability = AVAILABILITY[availRaw] ?? null;
    if (!availability || !DB_AVAILABILITY.includes(availability)) errors.push(`Availability "${get("availability")}" is not recognised.`);
  }

  const section = get("section");
  if (section.length > 60) errors.push("Section is over 60 characters.");

  const tags = [];
  for (const part of get("tags").split(/[,;|]/)) {
    const tag = part.trim();
    if (tag && !tags.some((t) => t.toLowerCase() === tag.toLowerCase())) tags.push(tag);
  }
  if (tags.length > TAG_LIMIT) errors.push(`Use at most ${TAG_LIMIT} tags.`);
  if (tags.some((t) => t.length > 30)) errors.push("A tag is over 30 characters.");

  const details = {};
  for (const field of ["brand", "short_description", "pack_size", "terms"]) {
    const text = get(field);
    if (text.length > DETAIL_LIMITS[field]) errors.push(`${IMPORT_LABELS[field]} is over ${DETAIL_LIMITS[field]} characters.`);
    else if (text) details[field] = text;
  }
  const includes = [];
  for (const part of get("includes").split(/[,;|]/)) {
    const entry = part.trim();
    if (entry && !includes.some((t) => t.toLowerCase() === entry.toLowerCase())) includes.push(entry);
  }
  if (includes.length > DETAIL_LIMITS.includes) errors.push(`Use at most ${DETAIL_LIMITS.includes} included items.`);
  if (includes.some((t) => t.length > DETAIL_LIMITS.include)) errors.push(`An included item is over ${DETAIL_LIMITS.include} characters.`);
  if (includes.length) details.includes = includes;

  if (errors.length) return { errors };
  return {
    errors: [],
    value: { name, price_type: priceType, price: priceValue, price_max: priceMax, unit: unit || null, availability, section: section || null, tags, ...details },
  };
};

export const validateImport = (rows, mapping, { hasHeader = true, premium = false, remaining = 0 } = {}) => {
  if (!premium) return { locked: true, message: "Paste and CSV import is part of the Premium plan.", valid: [], rejected: [], total: 0 };
  const body = hasHeader ? rows.slice(1) : rows;
  if (body.length === 0) return { locked: false, tooMany: false, message: "No rows found.", valid: [], rejected: [], total: 0 };
  if (body.length > IMPORT_MAX_ROWS) {
    return { locked: false, tooMany: true, message: `That is ${body.length} rows. Import at most ${IMPORT_MAX_ROWS} rows at a time.`, valid: [], rejected: [], total: body.length };
  }
  if (mapping.name === null || mapping.name === undefined) {
    return { locked: false, tooMany: false, message: "Choose which column holds the item name.", valid: [], rejected: [], total: body.length };
  }
  const valid = [];
  const rejected = [];
  body.forEach((cells, i) => {
    const rowNumber = i + 1 + (hasHeader ? 1 : 0);
    const result = validateRow(cells, mapping);
    if (result.errors.length) rejected.push({ row: rowNumber, cells, errors: result.errors });
    else valid.push({ row: rowNumber, cells, value: result.value });
  });
  const room = Math.max(0, remaining);
  const accepted = valid.slice(0, room);
  for (const over of valid.slice(room)) {
    rejected.push({ row: over.row, cells: over.cells, errors: [`Over your plan limit. You can add ${room} more ${room === 1 ? "item" : "items"}.`] });
  }
  rejected.sort((a, b) => a.row - b.row);
  return { locked: false, tooMany: false, message: null, valid: accepted, rejected, total: body.length, overLimit: valid.length - accepted.length };
};

const csvCell = (value) => {
  const text = safeCell(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const errorReportCsv = (rejected, headers = []) => {
  const width = Math.max(0, ...rejected.map((r) => r.cells.length), headers.length);
  const head = ["Row", "Problems", ...Array.from({ length: width }, (_, i) => headers[i] ?? `Column ${i + 1}`)];
  const lines = rejected.map((r) => [String(r.row), r.errors.join(" "), ...r.cells].map(csvCell).join(","));
  return [head.map(csvCell).join(","), ...lines].join("\r\n");
};

export const toImportPayload = (valid) => valid.map((v) => v.value);
