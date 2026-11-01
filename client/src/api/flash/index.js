import * as backend from "@epicmkt/backend";
import { isLive } from "./mode.js";

const adapter = () => (isLive() ? import("./live.js") : import("./mock.js"));
const liveAdapter = () => import("./live.js");

const isNotFound = (error) => error?.name === "NotFoundError";

// With Supabase configured, real (seller-published) data is authoritative: it is asked first, and the bundled demo
// backend is only a fallback for demo ids/slugs that do not exist live. The demo backend must never answer first, or a
// real shop whose slug matches a demo shop (slugs come from the name) would show the demo page, not the seller's items.
// Without Supabase (local dev, tests) only the demo backend is used.
const withFallback = async (live, demo) => {
  if (!isLive()) return demo();
  try {
    return await live();
  } catch (error) {
    if (!isNotFound(error)) throw error;
    return demo();
  }
};

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

export const getStoreSelective = async (businessId, opts) => {
  if (!isLive()) return backend.getStoreSelective(businessId, opts);
  const rows = await (await liveAdapter()).getStoreSelective(businessId, opts);
  if (rows.length) return rows;
  return backend.getStoreSelective(businessId, opts);
};

// Similar items are a nicety: any failure, or an item that is not known, is simply an empty row. A real (live) item is
// only ever matched against live data; the demo backend answers for demo ids, which live never knows.
export const getSimilarItems = async (itemId, opts) => {
  try {
    if (!isLive()) return await backend.getSimilarItems(itemId, opts);
    const live = await liveAdapter();
    const rows = live.isLiveId(itemId) ? await live.getSimilarItems(itemId, opts) : await backend.getSimilarItems(itemId, opts);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    // A cancelled read (the visitor moved on) is expected. Any other failure is still an empty row for the visitor, but visible in
    // the browser console instead of silent.
    if (error?.name === "AbortError" || /abort/i.test(String(error?.message))) return [];
    console.warn("[similar-items] could not load:", error?.message ?? error);
    return [];
  }
};

// Live data is authoritative: with Supabase configured an empty marketplace shows no products, never demo ones.
export const getAllProducts = async () => (isLive() ? (await liveAdapter()).getAllProducts() : backend.getAllProducts());

// A random window of each store's products for the featured cards: { [businessId]: { items, total } }.
export const getShowcaseProducts = async (businessIds, opts) =>
  isLive() ? (await liveAdapter()).getShowcaseProducts(businessIds, opts) : backend.getStoreShowcase(businessIds, opts);
