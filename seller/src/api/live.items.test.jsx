import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateItemForm, emptyItemForm, storedItemDetails } from "@epicmkt/shared";

const rpc = vi.fn();
vi.mock("./client.js", () => ({ supabase: { rpc: (...a) => rpc(...a), from: vi.fn() } }));

const live = await import("./live.js");
const mock = await import("./mock.js");

const base = { name: "Fade cut", priceType: "fixed", price: 500, priceMax: null, salePrice: null, unit: "", availability: "available", trackStock: false, stockCount: null, lowStockThreshold: 3, showStockCount: false };
const sent = () => rpc.mock.calls.at(-1)[1].p_fields;
const NEW_KEYS = ["brand", "short_description", "terms", "pack_size", "highlights", "includes", "specs"];

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: "it-1", error: null });
});

describe("live saveItem and the product type", () => {
  it("sends productTypeId (camelCase, as seller_save_item reads it), null for Other goods, and nothing when absent", async () => {
    await live.saveItem("it-9", { ...base, productTypeId: "shoes" });
    expect(sent().productTypeId).toBe("shoes");
    await live.saveItem("it-9", { ...base, productTypeId: null });
    expect(sent()).toHaveProperty("productTypeId", null);
    await live.saveItem("it-9", base);
    expect(sent()).not.toHaveProperty("productTypeId");
  });
});

describe("live saveItem with the new fields", () => {
  it("sends only the old columns when the form has none of the new fields", async () => {
    await live.saveItem(null, base);
    expect(rpc).toHaveBeenCalledWith("seller_save_item", { p_id: null, p_fields: expect.any(Object) });
    for (const key of NEW_KEYS) expect(sent()).not.toHaveProperty(key);
  });

  it("sends the validated form as database columns, with empty text as null", async () => {
    const form = { ...emptyItemForm(), name: "Sofa", price: "9000", brand: " Ikea ", terms: "", highlights: [{ title: " Soft ", text: "Cotton" }, { title: "", text: "" }], includes: [" Cushions "], specs: [{ group: "Measurements", label: "Size", value: "M" }] };
    const check = validateItemForm(form);
    await live.saveItem("it-9", check.value);
    expect(rpc.mock.calls[0][1].p_id).toBe("it-9");
    expect(sent()).toMatchObject({ brand: "Ikea", short_description: null, terms: null, pack_size: null, highlights: [{ title: "Soft", text: "Cotton" }], includes: ["Cushions"], specs: [{ group: "Measurements", label: "Size", value: "M" }] });
  });

  it("sends empty lists and null so a save can clear a field, and leaves out a key that is undefined", async () => {
    await live.saveItem("it-9", { ...base, highlights: [], includes: [], specs: [], brand: undefined, terms: null });
    expect(sent()).toMatchObject({ highlights: [], includes: [], specs: [] });
    expect(sent()).not.toHaveProperty("brand");
    expect(sent()).toHaveProperty("terms", null);
  });

  it("sends what the mock would keep, for the same validated form", async () => {
    const check = validateItemForm({ ...emptyItemForm(), name: "Sofa", price: "9000", brand: " Ikea ", shortDescription: "S", terms: " T ", packSize: "6", highlights: [{ title: "", text: " Soft " }], includes: [" A ", ""], specs: [{ label: "Size", value: "M" }] });
    await live.saveItem(null, check.value);
    const kept = storedItemDetails(check.value).value;
    expect(sent()).toMatchObject({ brand: kept.brand, short_description: kept.shortDescription, terms: kept.terms, pack_size: kept.packSize, highlights: kept.highlights, includes: kept.includes });
    expect(sent().specs).toEqual(kept.specs.map((s) => (check.value.specs.find((r) => r.label === s.label) ?? s)));
  });

  it("turns the database's invalid_details into a seller error with that code, like the mock", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "invalid_details" } });
    await expect(live.saveItem(null, { ...base, brand: "b".repeat(61) })).rejects.toMatchObject({ code: "invalid_details" });
    mock.resetMock();
    await mock.login("es100001", "Demo-Passw0rd");
    await expect(mock.saveItem(null, { ...base, brand: "b".repeat(61) })).rejects.toMatchObject({ code: "invalid_details" });
  });
});

describe("live options, variants and size charts (migration 0084)", () => {
  const OPTION_KEYS = ["options", "size_chart_id", "size_chart_override"];
  const options = { axes: [{ key: "size", label: "Size", display: "button", values: [{ id: "s", label: "S" }] }], variants: [{ choice: { size: "s" }, price: 1200 }] };

  it("sends nothing new for an item without options, so its save is exactly what it was", async () => {
    await live.saveItem("it-1", base);
    for (const key of OPTION_KEYS) expect(sent()).not.toHaveProperty(key);
  });

  it("passes options, the size chart and its override through as database columns", async () => {
    await live.saveItem("it-1", { ...base, options, sizeChartId: "c-1", sizeChartOverride: { rows: [["S", "90"]] } });
    expect(sent()).toMatchObject({ options, size_chart_id: "c-1", size_chart_override: { rows: [["S", "90"]] } });
  });

  it("sends null so a save can clear them, and leaves out a key that is undefined", async () => {
    await live.saveItem("it-1", { ...base, options: null, sizeChartId: null, sizeChartOverride: undefined });
    expect(sent()).toHaveProperty("options", null);
    expect(sent()).toHaveProperty("size_chart_id", null);
    expect(sent()).not.toHaveProperty("size_chart_override");
  });

  it("reads an item's options with seller_item_options", async () => {
    const payload = { axes: [], variants: [], optionAvailability: { axes: [], missing: "unavailable", cells: [], values: {} }, sizeChartId: null, sizeChartOverride: null };
    rpc.mockResolvedValue({ data: payload, error: null });
    expect(await live.getItemOptions("it-1")).toEqual(payload);
    expect(rpc).toHaveBeenCalledWith("seller_item_options", { p_id: "it-1" });
  });

  it("turns each database error into a seller error with that code, the same codes the mock raises", async () => {
    mock.resetMock();
    await mock.login("es100001", "Demo-Passw0rd");
    const bad = {
      invalid_options: { axes: [{ ...options.axes[0], display: "grid" }], variants: [] },
      invalid_variant: { axes: options.axes, variants: [{ choice: { size: "xl" } }] },
      duplicate_variant: { axes: options.axes, variants: [{ choice: { size: "s" } }, { choice: { size: "s" } }] },
      duplicate_sku: { axes: [{ ...options.axes[0], values: [{ id: "s", label: "S" }, { id: "m", label: "M" }] }], variants: [{ choice: { size: "s" }, sku: "A" }, { choice: { size: "m" }, sku: "a" }] },
    };
    for (const [code, opts] of Object.entries(bad)) {
      rpc.mockResolvedValue({ data: null, error: { message: code } });
      await expect(live.saveItem("it-1", { ...base, options: opts }), `live ${code}`).rejects.toMatchObject({ code });
      await expect(mock.saveItem("it-fade", { ...base, options: opts }), `mock ${code}`).rejects.toMatchObject({ code });
    }
    for (const code of ["too_many_variants", "invalid_size_chart"]) {
      rpc.mockResolvedValue({ data: null, error: { message: code } });
      await expect(live.saveItem("it-1", { ...base, options })).rejects.toMatchObject({ code });
    }
  });

  it("every new error code has its own readable message for the seller", async () => {
    const { errorText } = await import("../lib/errors.js");
    const codes = ["invalid_options", "invalid_variant", "duplicate_variant", "duplicate_sku", "too_many_variants", "invalid_size_chart"];
    const texts = codes.map((code) => errorText({ code }));
    for (const [n, text] of texts.entries()) {
      expect(text, codes[n]).not.toMatch(/something went wrong/i);
      expect(text.length, codes[n]).toBeGreaterThan(20);
    }
    expect(new Set(texts).size).toBe(codes.length);
  });
});

describe("live reorderItemPhotos", () => {
  it("sends the item and the paths in order", async () => {
    rpc.mockResolvedValue({ data: 2, error: null });
    await expect(live.reorderItemPhotos("it-1", ["b", "a"])).resolves.toBe(2);
    expect(rpc).toHaveBeenCalledWith("seller_reorder_item_photos", { p_item: "it-1", p_paths: ["b", "a"] });
  });
});
