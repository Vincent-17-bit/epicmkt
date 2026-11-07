import { describe, expect, it } from "vitest";
import { SEED_SIZE_CHARTS, shoeChartFrom, shoeChartRows } from "@epicmkt/shared";
import {
  addColumn, addRow, addShoeRow, blankChart, cleanDraft, cleanShoeDraft, isDirty, parseTypeIds, removeColumn, removeRow, removeShoeRow, setCell,
  setShoeCell, shoeFromDraft, shoePreview, shoeToDraft, sizeError, toDraft,
} from "./sizeCharts.js";

const SHOE_CHART = shoeChartFrom(null);
const dressRow = () => ({ id: "sc-1", ...SEED_SIZE_CHARTS[0], product_type_ids: ["dress"], items_using: 3 });

describe("chart draft", () => {
  it("round trips a stored chart", () => {
    const d = toDraft(dressRow());
    expect(d.productTypeIds).toEqual(["dress"]);
    expect(d.itemsUsing).toBe(3);
    const r = cleanDraft(d);
    expect(r.ok).toBe(true);
    expect(r.fields).toMatchObject({ name: "Dresses and tops (cm)", unit: "cm", product_type_ids: ["dress"] });
    expect(r.fields.rows).toEqual(SEED_SIZE_CHARTS[0].rows);
  });
  it("a blank chart is not valid until it has a name and cells", () => {
    const r = cleanDraft(blankChart());
    expect(r.ok).toBe(false);
    expect(r.errors.name).toBeTruthy();
  });
  it("rejects a row that is not as wide as the columns", () => {
    const d = toDraft(dressRow());
    d.rows[0] = ["XS", "80"];
    expect(cleanDraft(d).ok).toBe(false);
  });
  it("rejects duplicate or empty column names", () => {
    const d = toDraft(dressRow());
    d.columns = ["Size", "Bust", "bust", "Hip"];
    expect(cleanDraft(d).errors.columns).toBeTruthy();
  });
  it("adds and removes rows and columns, keeping rows as wide as the columns", () => {
    let d = toDraft(dressRow());
    d = addColumn(d);
    expect(d.columns).toHaveLength(5);
    expect(d.rows.every((r) => r.length === 5)).toBe(true);
    d = removeColumn(d, 4);
    d = addRow(d);
    expect(d.rows.at(-1)).toEqual(["", "", "", ""]);
    d = removeRow(d, d.rows.length - 1);
    expect(d.rows).toHaveLength(5);
    expect(removeColumn({ ...d, columns: ["Size"], rows: [["XS"]] }, 0).columns).toEqual(["Size"]);
  });
  it("setCell changes one cell only", () => {
    const d = setCell(toDraft(dressRow()), 1, 2, "70");
    expect(d.rows[1][2]).toBe("70");
    expect(d.rows[0][2]).toBe("62");
  });
  it("knows when a draft differs from what is saved", () => {
    const saved = toDraft(dressRow());
    expect(isDirty(saved, saved)).toBe(false);
    expect(isDirty(setCell(saved, 0, 1, "81"), saved)).toBe(true);
  });
});

describe("product type ids", () => {
  it("splits on commas and spaces, lowercases, de-duplicates and reports the bad ones", () => {
    expect(parseTypeIds("Dress, shirt  dress")).toEqual({ ids: ["dress", "shirt"], bad: [] });
    expect(parseTypeIds("dress, bad id!")).toEqual({ ids: ["dress", "bad"], bad: ["id!"] });
    expect(parseTypeIds("").ids).toEqual([]);
  });
  it("flags an id that is not a valid slug", () => {
    expect(parseTypeIds("ok, no_way!").bad).toEqual(["no_way!"]);
  });
});

describe("shoe conversion draft", () => {
  const stored = shoeChartRows(SHOE_CHART);
  it("the shipped chart is valid and round trips through text", () => {
    const d = shoeToDraft(stored);
    expect(cleanShoeDraft(d).ok).toBe(true);
    expect(shoeFromDraft(d).adult[0]).toEqual(stored.adult[0]);
    expect(shoeFromDraft(d).kids.length).toBe(stored.kids.length);
  });
  it("a kids row may leave UK and US empty", () => {
    const d = shoeToDraft(stored);
    expect(d.kids[0].uk).toBe("");
    expect(cleanShoeDraft(d).ok).toBe(true);
  });
  it("a column that does not rise is an error with a readable message", () => {
    const d = setShoeCell(shoeToDraft(stored), "adult", 1, "eu", "1");
    const r = cleanShoeDraft(d);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/larger than the row above|EU must be/);
  });
  it("an adult row with a missing size is an error", () => {
    const d = setShoeCell(shoeToDraft(stored), "adult", 0, "uk", "");
    expect(cleanShoeDraft(d).ok).toBe(false);
  });
  it("kids that do not end below adult are refused", () => {
    const d = setShoeCell(shoeToDraft(stored), "kids", shoeToDraft(stored).kids.length - 1, "cm", "40");
    expect(cleanShoeDraft(d).ok).toBe(false);
  });
  it("adds and removes rows", () => {
    let d = addShoeRow(shoeToDraft(stored), "kids");
    expect(d.kids.at(-1)).toEqual({ eu: "", uk: "", usM: "", usW: "", cm: "" });
    d = removeShoeRow(d, "kids", d.kids.length - 1);
    expect(d.kids).toHaveLength(stored.kids.length);
  });
  it("previews what the buyer sees per audience, and nothing while invalid", () => {
    const p = shoePreview(shoeToDraft(stored));
    expect(p.ok).toBe(true);
    expect(p.men[0]).toEqual({ eu: stored.adult[0].eu, uk: stored.adult[0].uk, us: stored.adult[0].usM, cm: stored.adult[0].cm });
    expect(p.women[0].us).toBe(stored.adult[0].usW);
    expect(p.kids[0]).toEqual({ eu: stored.kids[0].eu, cm: stored.kids[0].cm });
    const broken = shoePreview(setShoeCell(shoeToDraft(stored), "adult", 0, "cm", ""));
    expect(broken).toEqual({ ok: false, men: [], women: [], kids: [] });
  });
});

describe("error text", () => {
  it("names the database errors and falls back politely", () => {
    expect(sizeError({ code: "size_chart_in_use" })).toMatch(/still use this chart/);
    expect(sizeError({ message: "forbidden" })).toMatch(/Owners/);
    expect(sizeError(new Error("boom"))).toBe("Could not save. Try again.");
  });
});
