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
