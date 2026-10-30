import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateItemForm, emptyItemForm, storedItemDetails } from "@epicmkt/shared";

const rpc = vi.fn();
const from = vi.fn();
const invoke = vi.fn();
vi.mock("./client.js", () => ({ supabase: { rpc: (...a) => rpc(...a), from: (...a) => from(...a), functions: { invoke: (...a) => invoke(...a) } } }));

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

const table = (data) => {
  const q = { select: () => q, eq: () => q, order: () => q, limit: () => q, maybeSingle: () => q, then: (ok, bad) => Promise.resolve({ data, error: null }).then(ok, bad) };
  return q;
};

describe("live item media", () => {
  it("lists one ordered sequence of photos and videos", async () => {
    rpc.mockResolvedValue({ data: [{ path: "b/v.mp4", kind: "video", durationSec: "9.25", width: 640, height: 360 }, { path: "b/p", kind: "image", durationSec: null }], error: null });
    const list = await live.listItemMedia("it-1");
    expect(rpc).toHaveBeenCalledWith("seller_list_item_media", { p_item: "it-1" });
    expect(list.map((m) => [m.kind, m.path, m.durationSec])).toEqual([["video", "b/v.mp4", 9.25], ["image", "b/p", null]]);
  });

  it("sends the mixed order in one call", async () => {
    rpc.mockResolvedValue({ data: 3, error: null });
    await expect(live.reorderItemMedia("it-1", ["v", "p1", "p2"])).resolves.toBe(3);
    expect(rpc).toHaveBeenCalledWith("seller_reorder_item_media", { p_item: "it-1", p_paths: ["v", "p1", "p2"] });
  });

  it("turns a database error into a seller error code", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "item_not_found" } });
    await expect(live.reorderItemMedia("x", ["a"])).rejects.toMatchObject({ code: "item_not_found" });
  });

  it("reads the per-item limits for the shop's plan from the same limits the server enforces", async () => {
    const data = {
      businesses: { id: "b", plan_key: "premium", category_id: "barber" },
      categories: { id: "barber", name: "Barber" },
      plans: [],
      global_limits: { id: 1, standard: { photosPerItem: 7, videosPerItem: 1 }, premium: { photosPerItem: 15, videosPerItem: 3 } },
    };
    from.mockImplementation((name) => table(data[name]));
    rpc.mockResolvedValue({ data: 1, error: null });
    await expect(live.getMediaLimits()).resolves.toEqual({ photos: 15, videos: 3 });
    data.businesses.plan_key = "standard";
    await expect(live.getMediaLimits()).resolves.toEqual({ photos: 7, videos: 1 });
  });
});

describe("live uploads with progress and cancel", () => {
  const photo = () => new File([new Uint8Array(10)], "a.png", { type: "image/png" });

  it("stops before asking the server for anything when it is already cancelled", async () => {
    invoke.mockReset();
    const controller = new AbortController();
    controller.abort();
    await expect(live.uploadItemPhoto("it-1", photo(), { signal: controller.signal })).rejects.toMatchObject({ code: "upload_cancelled" });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("reports real byte progress for a photo and finishes by attaching it", async () => {
    invoke.mockReset();
    invoke.mockImplementation(async (name) => (name === "seller-media-sign"
      ? { data: { uploadUrl: "https://up.test/x", fields: { a: "1" }, publicId: "b/it-1/x" }, error: null }
      : { data: { ok: true }, error: null }));
    const sent = [];
    class FakeXhr {
      constructor() { this.upload = {}; }
      open() {}
      abort() { this.onabort?.(); }
      send(form) {
        sent.push(form);
        setTimeout(() => {
          this.upload.onprogress({ lengthComputable: true, loaded: 5, total: 10 });
          this.upload.onprogress({ lengthComputable: true, loaded: 10, total: 10 });
          this.status = 200;
          this.responseText = JSON.stringify({ public_id: "b/it-1/x", version: 1, signature: "s", width: 300, height: 300, bytes: 10, format: "png" });
          this.onload();
        }, 0);
      }
    }
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const seen = [];
    const out = await live.uploadItemPhoto("it-1", photo(), { onProgress: (f, stage) => seen.push([f, stage]) });
    vi.unstubAllGlobals();
    expect(out).toEqual({ path: "b/it-1/x", kind: "image" });
    expect(seen[0]).toEqual([null, "preparing"]);
    expect(seen).toContainEqual([0.5, "uploading"]);
    expect(seen).toContainEqual([1, "uploading"]);
    expect(seen.at(-1)).toEqual([1, "finishing"]);
    expect(invoke.mock.calls.map((c) => c[0])).toEqual(["seller-media-sign", "seller-media-finalize"]);
  });

  it("cancels a photo that is on its way up and never attaches it", async () => {
    invoke.mockReset();
    invoke.mockResolvedValue({ data: { uploadUrl: "https://up.test/x", fields: {}, publicId: "b/it-1/x" }, error: null });
    class HangingXhr {
      constructor() { this.upload = {}; }
      open() {}
      send() {}
      abort() { this.onabort(); }
    }
    vi.stubGlobal("XMLHttpRequest", HangingXhr);
    const controller = new AbortController();
    const pending = live.uploadItemPhoto("it-1", photo(), { signal: controller.signal, onProgress: () => {} });
    await new Promise((r) => setTimeout(r, 10));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "upload_cancelled" });
    vi.unstubAllGlobals();
    expect(invoke.mock.calls.map((c) => c[0])).toEqual(["seller-media-sign"]);
  });
});
