// CSV export for tables. Pure functions, plus one small download helper for the browser.
//
// Business names, owners and addresses come from sellers, so a cell can be written to look like a spreadsheet
// formula (=HYPERLINK(...), @SUM(...)). Excel and Sheets run those when the file is opened. toCsv defuses any text
// cell that starts with a formula character by putting a single quote in front, which both programs show as text.
// Numbers and phone-style values (+254 700 000 001, -5) are left alone.

const FORMULA_START = /^[=@\t\r]/;
const SIGNED = /^[+-]/;
const NUMBER_OR_PHONE = /^[+-][\d\s().-]*$/;

export function defuse(text) {
  if (FORMULA_START.test(text)) return `'${text}`;
  if (SIGNED.test(text) && !NUMBER_OR_PHONE.test(text)) return `'${text}`;
  return text;
}

/** One cell: null and undefined are empty, numbers are written as they are, everything else is text. */
export function cell(value) {
  if (value == null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  const text = defuse(value instanceof Date ? value.toISOString() : String(value));
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * columns: [{ key, label, csv?: (row) => value }]   the value defaults to row[key]
 * Rows end with CRLF (RFC 4180). `bom: true` adds a UTF-8 byte order mark so Excel reads accents and Swahili names right.
 */
export function toCsv(columns, rows, { bom = false } = {}) {
  const head = columns.map((c) => cell(c.label ?? c.key)).join(",");
  const body = rows.map((row) => columns.map((c) => cell(c.csv ? c.csv(row) : row?.[c.key])).join(","));
  return (bom ? "\uFEFF" : "") + [head, ...body].join("\r\n") + "\r\n";
}

/** "applications-2026-10-15.csv", in East Africa Time so the name matches the clock people see. */
export function csvFilename(base, now = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const safe = String(base).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "export";
  return `${safe}-${day}.csv`;
}

/** Browser only. Saves text as a file by clicking a temporary link. */
export function downloadText(filename, text, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
