import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const live = vi.hoisted(() => ({
  getBusiness: vi.fn(),
  getItemDetail: vi.fn(),
  getStoreSelective: vi.fn(),
  getSimilarItems: vi.fn(),
  isLiveId: vi.fn(),
  resolveShortcode: vi.fn()
}));
const demo = vi.hoisted(() => ({
  getBusiness: vi.fn(),
  getItemDetail: vi.fn(),
  getStoreSelective: vi.fn(),
  getSimilarItems: vi.fn(),
  resolveShortcode: vi.fn()
}));

vi.mock("./live.js", () => live);
vi.mock("@epicmkt/backend", () => demo);

import { getBusiness, getItemDetail, getSimilarItems, getStoreSelective, resolveShortcode } from "./index.js";

const notFound = () => Object.assign(new Error("nf"), { name: "NotFoundError" });

beforeEach(() => {
  for (const fn of [...Object.values(live), ...Object.values(demo)]) fn.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe("with Supabase configured, seller data wins over the demo backend", () => {
  beforeEach(() => vi.stubEnv("VITE_SUPABASE_URL", "https://x.supabase.co"));

  it("shows the live shop (with its items) even when a demo shop has the same slug", async () => {
    live.getBusiness.mockResolvedValue({ slug: "bakery", services: [{ name: "White Bread Loaf" }] });
    demo.getBusiness.mockResolvedValue({ slug: "bakery", services: [{ name: "Demo item" }] });
    const business = await getBusiness("bakery");
    expect(business.services[0].name).toBe("White Bread Loaf");
    expect(demo.getBusiness).not.toHaveBeenCalled();
  });

  it("falls back to the demo shop only when the shop does not exist live", async () => {
    live.getBusiness.mockRejectedValue(notFound());
    demo.getBusiness.mockResolvedValue({ slug: "demo" });
    expect(await getBusiness("demo")).toEqual({ slug: "demo" });
  });

  it("does not hide real errors behind the demo backend", async () => {
    live.getBusiness.mockRejectedValue(Object.assign(new Error("boom"), { name: "FlashApiError" }));
    await expect(getBusiness("x")).rejects.toThrow("boom");
    expect(demo.getBusiness).not.toHaveBeenCalled();
  });

  it("applies the same order to short codes, item details and more-from-this-store", async () => {
    live.resolveShortcode.mockResolvedValue({ slug: "live" });
    live.getItemDetail.mockResolvedValue({ id: "live" });
    live.getStoreSelective.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    expect(await resolveShortcode("c")).toEqual({ slug: "live" });
    expect(await getItemDetail("i")).toEqual({ id: "live" });
    expect(await getStoreSelective("b")).toHaveLength(2);
    expect(demo.resolveShortcode).not.toHaveBeenCalled();
    expect(demo.getItemDetail).not.toHaveBeenCalled();
    expect(demo.getStoreSelective).not.toHaveBeenCalled();
  });
});

describe("without Supabase the demo backend is used alone", () => {
  it("never calls the live adapter", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    demo.getBusiness.mockResolvedValue({ slug: "demo" });
    expect(await getBusiness("demo")).toEqual({ slug: "demo" });
    expect(live.getBusiness).not.toHaveBeenCalled();
  });
});

describe("getSimilarItems", () => {
  it("without Supabase only the demo backend answers", async () => {
    demo.getSimilarItems.mockResolvedValue([{ id: "d1" }]);
    expect(await getSimilarItems("d0", { limit: 5 })).toEqual([{ id: "d1" }]);
    expect(demo.getSimilarItems).toHaveBeenCalledWith("d0", { limit: 5 });
    expect(live.getSimilarItems).not.toHaveBeenCalled();
  });

  describe("with Supabase configured", () => {
    beforeEach(() => vi.stubEnv("VITE_SUPABASE_URL", "https://x.supabase.co"));

    it("asks live for a real item and never mixes in demo items, even when live has none", async () => {
      live.isLiveId.mockReturnValue(true);
      live.getSimilarItems.mockResolvedValue([]);
      expect(await getSimilarItems("20000000-0000-0000-0000-000000000101")).toEqual([]);
      expect(demo.getSimilarItems).not.toHaveBeenCalled();
    });

    it("asks the demo backend for a demo id", async () => {
      live.isLiveId.mockReturnValue(false);
      demo.getSimilarItems.mockResolvedValue([{ id: "d1" }]);
      expect(await getSimilarItems("demo-item")).toEqual([{ id: "d1" }]);
      expect(live.getSimilarItems).not.toHaveBeenCalled();
    });

    it("is an empty row on any failure or odd answer, never an error", async () => {
      live.isLiveId.mockReturnValue(true);
      live.getSimilarItems.mockRejectedValue(new Error("boom"));
      expect(await getSimilarItems("20000000-0000-0000-0000-000000000101")).toEqual([]);
      live.getSimilarItems.mockResolvedValue(null);
      expect(await getSimilarItems("20000000-0000-0000-0000-000000000101")).toEqual([]);
    });
  });
});
