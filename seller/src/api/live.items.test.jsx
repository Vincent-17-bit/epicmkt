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

describe("live reorderItemPhotos", () => {
  it("sends the item and the paths in order", async () => {
    rpc.mockResolvedValue({ data: 2, error: null });
    await expect(live.reorderItemPhotos("it-1", ["b", "a"])).resolves.toBe(2);
    expect(rpc).toHaveBeenCalledWith("seller_reorder_item_photos", { p_item: "it-1", p_paths: ["b", "a"] });
  });
});
