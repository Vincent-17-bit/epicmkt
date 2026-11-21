import { OTHER_TYPE_ID, SPEC_DEFAULT_GROUP, specIssues } from "@epicmkt/shared";
import { rowsOf } from "./editor/typedRows.js";

export const MAX_ROWS = 200;
export const FIXED_COLUMNS = [
  { key: "name", label: "Name", kind: "text" },
  { key: "price", label: "Price (KES)", kind: "number" },
  { key: "stock", label: "Stock", kind: "number" }
];

/** The table's columns for a type: name, price, stock, then the type's required rows. */
export const columnsFor = (type) => [
  ...FIXED_COLUMNS,
  ...rowsOf({ specs: [] }, type).required.map((r) => ({ key: `spec:${r.key}`, label: r.label, kind: "spec", row: r }))
];

export const blankRow = () => ({ name: "", price: "", stock: "", specs: {}, photos: [] });

// Photos of a row: pasted from the clipboard or chosen, sent after the item is saved.
export const ROW_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_ROW_PHOTOS = 5;
/** Adds picture files to a row. Returns the new row and what was left out: { notPictures, tooMany }. Nothing is read or uploaded here. */
export function addRowPhotos(row, files, makeUrl = (f) => URL.createObjectURL(f)) {
  const list = [...files];
  const pictures = list.filter((f) => ROW_PHOTO_TYPES.includes(f?.type));
  const room = Math.max(0, MAX_ROW_PHOTOS - (row.photos ?? []).length);
  const taken = pictures.slice(0, room);
  return {
    row: { ...row, photos: [...(row.photos ?? []), ...taken.map((file) => ({ file, url: makeUrl(file) }))] },
    notPictures: list.length - pictures.length,
    tooMany: pictures.length - taken.length
  };
}
export const isBlank = (r) => !r.name.trim() && !r.price.trim() && !r.stock.trim() && Object.values(r.specs).every((v) => !String(v).trim());

const cellOf = (r, col) => (col.kind === "spec" ? r.specs[col.row.key] ?? "" : r[col.key]);
export const withCell = (r, col, value) => (col.kind === "spec" ? { ...r, specs: { ...r.specs, [col.row.key]: value } } : { ...r, [col.key]: value });
export { cellOf };

/** Spreadsheet text (tabs between cells, a line per row) -> a grid of strings. Quotes and a trailing blank line are dropped. */
export function parsePaste(text) {
  const lines = String(text ?? "").replace(/\r/g, "").split("\n");
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.map((line) => line.split("\t").map((c) => c.trim().replace(/^"(.*)"$/s, "$1")));
}

/** Put a pasted grid into the rows starting at (row, col); rows are added as needed, up to MAX_ROWS. Returns the new rows and how many were cut off. */
export function pasteInto(rows, columns, at, grid) {
  const next = rows.map((r) => ({ ...r, specs: { ...r.specs } }));
  let cut = 0;
  grid.forEach((cells, i) => {
    const r = at.row + i;
    if (r >= MAX_ROWS) { cut += 1; return; }
    while (next.length <= r) next.push(blankRow());
    cells.forEach((value, j) => {
      const col = columns[at.col + j];
      if (col) next[r] = withCell(next[r], col, value);
    });
  });
  return { rows: next, cut };
}

const numberOf = (text) => {
  const t = String(text).replace(/[,\s]/g, "");
  return t === "" ? null : Number(t);
};

/** What is wrong with a row, in words. Empty when the row can be published. */
export function rowProblems(r, type) {
  const out = [];
  const name = r.name.trim();
  if (name.length < 2 || name.length > 120) out.push("Name must be 2 to 120 characters");
  const price = numberOf(r.price);
  if (price === null) out.push("Add a price");
  else if (!Number.isFinite(price) || price < 0) out.push("Price must be a number");
  const stock = numberOf(r.stock);
  if (stock !== null && (!Number.isInteger(stock) || stock < 0)) out.push("Stock must be a whole number");
  const specs = specList(r, type);
  const missing = type?.specRows ? specIssues({ specs, brand: "", packSize: "", includes: [], axes: [] }, type).blockers : [];
  for (const b of missing) out.push(`${b.label} is required`);
  return out;
}

export const specList = (r, type) =>
  columnsFor(type).filter((c) => c.kind === "spec" && String(r.specs[c.row.key] ?? "").trim()).map((c) => ({ group: SPEC_DEFAULT_GROUP, label: c.row.label, value: String(r.specs[c.row.key]).trim() }));

/** The save body for a row. */
export function rowFields(r, type) {
  const price = numberOf(r.price);
  const stock = numberOf(r.stock);
  const fields = {
    name: r.name.trim(), description: "", priceType: price === null ? "contact" : "fixed", price: price ?? null, availability: "in_stock",
    trackStock: stock !== null && Number.isInteger(stock) && stock >= 0, stockCount: stock !== null && Number.isInteger(stock) && stock >= 0 ? stock : null,
    productTypeId: type?.id ?? OTHER_TYPE_ID, specs: specList(r, type)
  };
  if (!fields.trackStock) delete fields.stockCount;
  return fields;
}
