import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const row = (n, over = {}) => ({
  id: `i${n}`,
  businessId: "b1",
  name: `Product ${n}`,
  description: "",
  availability: "available",
  createdAt: `2026-01-${String(n).padStart(2, "0")}T00:00:00Z`,
  imageUrl: null,
  flash: null,
  pricing: { regularPrice: n * 100, salePrice: n * 100, savings: 0, discountPercent: 0 },
  business: { id: "b1", name: "Shop", categoryId: "bakery", town: "Maseno", verified: false, featured: false, isOpen: true },
  ...over
});

let live;
let fetchMock;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(async () => {
  vi.resetModules();
  vi.doMock("../flash/index.js", () => ({ getAllProducts: vi.fn(async () => [row(1), row(2), row(3)]) }));
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  live = await import("./live.js");
  live.invalidateProducts();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock("../flash/index.js");
});

describe("products live client", () => {
  it("keeps a card's videos and builds media with the cover first", async () => {
    fetchMock.mockResolvedValue(json({ items: [{ id: "i1", name: "Loaf", imagePath: "b1/a.webp", imageUrl: "b1/a.webp", videoPaths: ["b1/i1/v.mp4"] }, { id: "i2", name: "Bun", imagePath: null, imageUrl: null, videoPaths: [] }], total: 2, catalogTotal: 2, page: 1, pageSize: 24, hasMore: false }));
    const { items } = await live.getProductsPage({ q: "", sort: "newest", min: "", max: "", categories: [], towns: [], onSale: false });
    expect(items[0].videos).toHaveLength(1);
    expect(items[0].videos[0].url).toContain("b1/i1/v.mp4");
    expect(items[0].media.map((m) => m.kind)).toEqual(["image", "video"]);
    expect(items[0].images).toHaveLength(1);
    expect(items[1]).toMatchObject({ images: [], videos: [], media: [] });
  });

  it("asks the endpoint for one canonical question and turns picture paths into urls", async () => {
    fetchMock.mockResolvedValue(json({ items: [{ id: "i1", name: "Loaf", imagePath: "b1/a.webp", imageUrl: "b1/a.webp" }], total: 1, catalogTotal: 9, page: 1, pageSize: 24, hasMore: false }));
    const page = await live.getProductsPage({ q: "", sort: "newest", min: "", max: "", categories: [], towns: [], onSale: true });
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/products?op=page&sale=1");
    expect(page.items[0].imageUrl).toContain("b1/a.webp");
    expect(page.items[0].images).toHaveLength(1);
  });

  it("shares one request between identical simultaneous questions", async () => {
    fetchMock.mockResolvedValue(json({ total: 0, categories: [], towns: [], price: null }));
    await Promise.all([live.getProductFacets(), live.getProductFacets()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the full list when the endpoint is not there, and stops asking for a while", async () => {
    fetchMock.mockResolvedValue(new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }));
    const page = await live.getProductsPage({ q: "", sort: "price_desc", min: "", max: "", categories: [], towns: [] });
    expect(page.items.map((p) => p.name)).toEqual(["Product 3", "Product 2", "Product 1"]);
    expect(page.total).toBe(3);
    const facets = await live.getProductFacets();
    expect(facets.total).toBe(3);
    const counts = await live.getProductCounts({ q: "", sort: "newest", min: "", max: "", categories: [], towns: [] });
    expect(counts.categories).toEqual([["bakery", 3]]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
