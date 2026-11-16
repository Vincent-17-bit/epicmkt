import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { coverUrl } from "@epicmkt/ui";

let search;
let fetchMock;
const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

beforeEach(async () => {
  vi.resetModules();
  vi.doMock("../flash/mode.js", () => ({ isLive: () => true }));
  vi.doMock("../flash/index.js", () => ({ getAllProducts: vi.fn(async () => []) }));
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  search = await import("./search.js");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock("../flash/mode.js");
  vi.doUnmock("../flash/index.js");
});

describe("product search results", () => {
  it("turn the endpoint's picture paths into urls, so cards show the photo and not the placeholder", async () => {
    fetchMock.mockResolvedValue(
      json({
        items: [
          { id: "i1", name: "White Bread Loaf", imagePath: "b1/i1/p.webp", imageUrl: "b1/i1/p.webp", videoPaths: [] },
          { id: "i2", name: "No photo yet", imagePath: null, imageUrl: null, videoPaths: [] }
        ],
        total: 2,
        page: 1,
        pageSize: 16,
        pages: 1,
        corrected: "bread"
      })
    );
    const result = await search.searchCatalog({ q: "brread", page: 1 });
    expect(String(fetchMock.mock.calls[0][0])).toContain("op=search");
    const [withPhoto, without] = result.items;
    // A full address that ends with the stored path, never the bare path itself (which the browser cannot load).
    expect(coverUrl(withPhoto)).toMatch(/\/b1\/i1\/p\.webp$/);
    expect(coverUrl(withPhoto)).not.toBe("b1/i1/p.webp");
    expect(withPhoto.media[0]).toMatchObject({ kind: "image" });
    expect(coverUrl(without)).toBeNull();
    expect(result.corrected).toBe("bread");
  });
});
