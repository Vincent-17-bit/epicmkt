import * as backend from "@epicmkt/backend";
import { isLive } from "./mode.js";

const adapter = () => (isLive() ? import("./live.js") : import("./mock.js"));
const liveAdapter = () => import("./live.js");

const isNotFound = (error) => error?.name === "NotFoundError";

const withFallback = async (primary, fallback) => {
  try {
    return await primary();
  } catch (error) {
    if (!isLive() || !isNotFound(error)) throw error;
    return fallback();
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
    () => backend.getBusiness(ref, origin),
    async () => (await liveAdapter()).getBusiness(ref, origin)
  );

export const resolveShortcode = (code) =>
  withFallback(
    () => backend.resolveShortcode(code),
    async () => (await liveAdapter()).resolveShortcode(code)
  );

export const getItemDetail = (itemId, opts) =>
  withFallback(
    () => backend.getItemDetail(itemId, opts),
    async () => (await liveAdapter()).getItemDetail(itemId, opts)
  );

export const getStoreSelective = async (businessId, opts) => {
  const rows = await backend.getStoreSelective(businessId, opts);
  if (rows.length || !isLive()) return rows;
  return (await liveAdapter()).getStoreSelective(businessId, opts);
};

