import * as backend from "@epicmkt/backend";
import { isLive } from "./mode.js";

const adapter = () => (isLive() ? import("./live.js") : import("./mock.js"));
const liveAdapter = () => import("./live.js");


// With Supabase configured, only real (seller-published) data is shown: a shop or item that does not exist live is "not found",
// never a demo one. Without Supabase (local dev, tests) only the demo backend is used.
const withFallback = async (live, demo) => (isLive() ? live() : demo());

export const getServerTime = async () => (await adapter()).getServerTime();

export const flash = {
  getForItem: async (itemId, businessId) => (await adapter()).getForItem(itemId, businessId),
  list: async (params) => (await adapter()).list(params),
  facets: async () => (await adapter()).facets()
};

export const getBusiness = (ref, origin) =>
  withFallback(
    async () => (await liveAdapter()).getBusiness(ref, origin),
    () => backend.getBusiness(ref, origin)
  );

export const resolveShortcode = (code) =>
  withFallback(
    async () => (await liveAdapter()).resolveShortcode(code),
    () => backend.resolveShortcode(code)
  );

export const getItemDetail = (itemId, opts) =>
  withFallback(
    async () => (await liveAdapter()).getItemDetail(itemId, opts),
    () => backend.getItemDetail(itemId, opts)
  );

// Only the live data has 3D views; the demo backend has none.
export const getItemView3d = async (itemId) => {
  if (!isLive()) return null;
  try { return await (await liveAdapter()).getItemView3d(itemId); } catch { return null; }
};

// Only the live data knows about combined items; the demo backend has none.
export const getItemRedirect = async (itemId) => {
  if (!isLive()) return null;
  try { return await (await liveAdapter()).getItemRedirect(itemId); } catch { return null; }
};

export const getStoreSelective = async (businessId, opts) => {
  if (!isLive()) return backend.getStoreSelective(businessId, opts);
  return (await liveAdapter()).getStoreSelective(businessId, opts);
};

// Similar items are a nicety: any failure, or an item that is not known, is simply an empty row. A real (live) item is
// only ever matched against live data.
export const getSimilarItems = async (itemId, opts) => {
  try {
    if (!isLive()) return await backend.getSimilarItems(itemId, opts);
    const live = await liveAdapter();
    const rows = live.isLiveId(itemId) ? await live.getSimilarItems(itemId, opts) : [];
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    // A cancelled read (the visitor moved on) is expected. Any other failure is still an empty row for the visitor, but visible in
    // the browser console instead of silent.
    if (error?.name === "AbortError" || /abort/i.test(String(error?.message))) return [];
    console.warn("[similar-items] could not load:", error?.message ?? error);
    return [];
  }
};

// "Recommended" items (C19): a page of items from any shop that go with this one. Like Similar items, any failure is an empty
// page, so the section simply does not show.
export const getRelatedPage = async (itemId, opts = {}) => {
  const empty = { items: [], page: opts.page ?? 1, pageSize: opts.pageSize ?? 10, hasMore: false, total: 0 };
  try {
    if (!isLive()) return await backend.getRelatedPage(itemId, opts);
    const live = await liveAdapter();
    return live.isLiveId(itemId) ? await live.getRelatedPage(itemId, opts) : empty;
  } catch (error) {
    if (error?.name === "AbortError" || /abort/i.test(String(error?.message))) return empty;
    console.warn("[related-items] could not load:", error?.message ?? error);
    return empty;
  }
};

// Live data is authoritative: with Supabase configured an empty marketplace shows no products, never demo ones.
export const getAllProducts = async () => (isLive() ? (await liveAdapter()).getAllProducts() : backend.getAllProducts());

// A random window of each store's products for the featured cards: { [businessId]: { items, total } }.
export const getShowcaseProducts = async (businessIds, opts) =>
  isLive() ? (await liveAdapter()).getShowcaseProducts(businessIds, opts) : backend.getStoreShowcase(businessIds, opts);
