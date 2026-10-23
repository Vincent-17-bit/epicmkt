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

// Live data is authoritative: with Supabase configured an empty marketplace shows no products, never demo ones.
// Returns { items, nextOffset }; nextOffset is null on the last page.
export const getHomeProducts = async ({ limit = 24, offset = 0 } = {}) =>
  isLive() ? (await liveAdapter()).getHomeProducts({ limit, offset }) : backend.getHomeProducts({ limit, offset });
