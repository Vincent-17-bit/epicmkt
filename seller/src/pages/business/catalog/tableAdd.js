import { specIssues } from "@epicmkt/shared";
import { parseKes } from "./editor/fields.js";

export const MAX_ROWS = 50;

const FIXED = [
  { key: "name", label: "Name", kind: "name" },
  { key: "price", label: "Price (KES)", kind: "price" },
  { key: "stock", label: "Stock", kind: "stock" }
];

export const columnsFor = (type) => [
  ...FIXED,
  ...(type?.specRows ?? []).filter((r) => r.level === "required").map((r) => ({ key: `spec:${r.key}`, label: r.label, kind: "spec", rowKey: r.key })),
  { key: "photo", label: "Photo", kind: "photo" }
];

let seq = 0;
export const emptyRow = () => ({ id: `row-${++seq}`, cells: {}, photo: null });
export const isBlank = (row) => !row.photo && Object.values(row.cells).every((v) => !String(v ?? "").trim());

export const parsePaste = (text) => {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.map((l) => l.split("\t").map((c) => c.trim()));
};

export function applyPaste(rows, columns, r, c, matrix) {
  const text = columns.map((col, i) => (col.kind === "photo" ? -1 : i)).filter((i) => i >= 0 && i >= c);
  const next = rows.map((row) => ({ ...row, cells: { ...row.cells } }));
  let dropped = 0;
  matrix.forEach((line, dr) => {
    if (r + dr >= MAX_ROWS) { dropped += 1; return; }
    while (next.length <= r + dr) next.push(emptyRow());
    line.forEach((value, dc) => {
      const ci = text[dc];
      if (ci !== undefined) next[r + dr].cells[columns[ci].key] = value;
    });
  });
  return { rows: next, dropped };
}

const nameOk = (name) => name.length >= 2 && name.length <= 120;

export function rowItem(row, type, columns) {
  const cell = (k) => String(row.cells[k] ?? "").trim();
  const stock = cell("stock");
  const price = cell("price");
  return {
    name: cell("name"),
    priceType: "fixed",
    price: price === "" ? null : parseKes(price),
    availability: "available",
    trackStock: stock !== "",
    stockCount: stock === "" ? null : Number(stock),
    specs: columns.filter((c) => c.kind === "spec" && cell(c.key)).map((c) => ({ label: c.label, value: cell(c.key) })),
    productTypeId: type?.id ?? null
  };
}

export function rowProblems(row, type, columns) {
  const cell = (k) => String(row.cells[k] ?? "").trim();
  const hard = [];
  const missing = [];
  if (!nameOk(cell("name"))) hard.push({ key: "name", message: "Name must be 2 to 120 characters" });
  if (cell("price") !== "" && parseKes(cell("price")) === null) hard.push({ key: "price", message: "Price must be a number" });
  if (cell("stock") !== "" && !/^\d{1,6}$/.test(cell("stock"))) hard.push({ key: "stock", message: "Stock must be a whole number" });
  if (cell("price") === "") missing.push({ key: "price", message: "Price is missing" });
  if (!hard.length) {
    const item = rowItem(row, type, columns);
    for (const b of specIssues({ ...item, specs: item.specs }, type ?? undefined).blockers) {
      const col = columns.find((c) => c.rowKey === b.key);
      if (col) missing.push({ key: col.key, message: `${b.label} is missing` });
    }
  }
  return { hard, missing };
}

export const MOVES = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  Enter: [1, 0]
};

export function nextCell(key, { r, c }, { rows, cols }, edge = { start: true, end: true }) {
  if (MOVES[key]) {
    const nr = r + MOVES[key][0];
    return nr < 0 || nr >= rows ? null : { r: nr, c };
  }
  if (key === "ArrowLeft" && edge.start) return c > 0 ? { r, c: c - 1 } : null;
  if (key === "ArrowRight" && edge.end) return c < cols - 1 ? { r, c: c + 1 } : null;
  return null;
}
