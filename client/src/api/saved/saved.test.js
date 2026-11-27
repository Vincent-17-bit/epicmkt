import { describe, expect, it, vi } from "vitest";

vi.mock("../flash/mode.js", () => ({ isLive: () => false }));
const detail = { id: "d1", name: "Table", business: { id: "b1", slug: "shop", name: "Shop" }, pricing: null };
vi.mock("@epicmkt/backend", async (orig) => ({ ...(await orig()), getItemDetail: async (id) => { if (id === "d1") return detail; throw new Error("nf"); } }));

const { items } = await import("../index.js");

describe("items.getSaved in demo mode", () => {
  it("returns the live shape: items by id (null when unknown), redirects, shops, times", async () => {
    const out = await items.getSaved(["d1", "gone"]);
    expect(Object.keys(out).sort()).toEqual(["fetchedAt", "items", "now", "redirects", "shops"]);
    expect(out.items.d1.name).toBe("Table");
    expect(out.items.gone).toBeNull();
    expect(out.shops.b1.slug).toBe("shop");
    expect(out.redirects).toEqual({});
  });
});

describe("items.getSaved on a live site", () => {
  it("never reaches for demo data: an id that is not a database id is simply not listed", async () => {
    vi.resetModules();
    vi.doMock("../flash/mode.js", () => ({ isLive: () => true }));
    vi.doMock("./live.js", () => ({ isLiveId: (id) => /^[0-9a-f-]{36}$/.test(id), getSavedLive: async (ids) => ({ items: Object.fromEntries(ids.map((i) => [i, { id: i }])), redirects: {}, shops: {}, now: 1, fetchedAt: 1 }) }));
    const { getSaved } = await import("./index.js");
    const uuid = "11111111-1111-4111-8111-111111111111";
    const out = await getSaved([uuid, "b_041-demo-item"]);
    expect(out.items[uuid]).toEqual({ id: uuid });
    expect(out.items["b_041-demo-item"]).toBeNull();
    vi.doUnmock("./live.js");
    vi.doUnmock("../flash/mode.js");
  });
});
