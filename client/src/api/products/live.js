// Home products grid for the live site: a thin client over the cached /api/products endpoint.
//
// The browser asks for one page (24 products), the filter options, or the live option counts. It never downloads the
// catalogue. If the endpoint cannot be reached (local dev has no Vercel functions, or an outage) it falls back to the old path:
// load the full list once (flash/live.js getAllProducts) and answer with the same pure functions the endpoint runs, so a problem
// with the endpoint makes the site slower, never broken.
import { mediaUrl } from "../flash/shape.js";
import * as flashApi from "../flash/index.js";
import { EMPTY_FILTERS } from "../../lib/productFilters.js";
import { countsSummary, facetsSummary, pageOf } from "../../lib/productQuery.js";
import { canonicalQuery } from "../../../api/_lib/productParams.js";

const ENDPOINT = "/api/products";
const TIMEOUT_MS = 8000;
const MEMO_MS = 10_000;
// After the endpoint fails, go straight to the fallback for a while instead of making every call wait for a timeout.
const COOLDOWN_MS = 60_000;
const LIST_MS = 60_000;

const memo = new Map();
const inflight = new Map();
let downUntil = 0;
let list = null;

const unreachable = (reason) => Object.assign(new Error(reason), { name: "ProductsEndpointError" });

async function fetchJson(query) {
  const res = await fetch(`${ENDPOINT}?${query}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const type = res.headers.get("content-type") ?? "";
  // A 404 page or the SPA's index.html is not an answer: treat it as "endpoint not here".
  if (!res.ok || !type.includes("application/json")) throw unreachable(`products_${res.status}`);
  return res.json();
}

// Same question twice in a row (a re-render, two components) is one request. Answers are also kept for a few seconds.
function ask(query) {
  const hit = memo.get(query);
  if (hit && Date.now() - hit.at < MEMO_MS) return Promise.resolve(hit.value);
  if (inflight.has(query)) return inflight.get(query);
  const promise = fetchJson(query)
    .then((value) => {
      memo.set(query, { at: Date.now(), value });
      if (memo.size > 100) memo.delete(memo.keys().next().value);
      return value;
    })
    .finally(() => inflight.delete(query));
  inflight.set(query, promise);
  return promise;
}

async function viaEndpoint(query, fallback) {
  if (Date.now() < downUntil) return fallback();
  try {
    return await ask(query);
  } catch {
    downUntil = Date.now() + COOLDOWN_MS;
    return fallback();
  }
}

// The old path: the whole list, once a minute at most, shared by every call that needs it.
async function fullList() {
  if (list && Date.now() - list.at < LIST_MS) return list.promise;
  const promise = flashApi.getAllProducts();
  list = { at: Date.now(), promise };
  promise.catch(() => {
    if (list?.promise === promise) list = null;
  });
  return promise;
}

// The endpoint returns raw storage paths for pictures; media-host sharding stays in the browser. The fallback path already
// returns full urls, so a product that already has an imageUrl is left alone.
const shaped = (p) => {
  if (p.images || p.imageUrl === undefined) return p;
  const url = p.imagePath ? mediaUrl(p.imagePath) : null;
  return { ...p, description: p.description ?? p.shortDescription ?? "", imageUrl: url, images: url ? [{ id: "i1", url, caption: p.name }] : [], videos: [] };
};

export function invalidateProducts() {
  memo.clear();
  inflight.clear();
  downUntil = 0;
  list = null;
}

export async function getProductsPage(filters = EMPTY_FILTERS, { page = 1, pageSize } = {}) {
  const opts = { page, ...(pageSize ? { pageSize } : {}) };
  const result = await viaEndpoint(canonicalQuery("page", filters, opts), async () => pageOf(await fullList(), filters, opts));
  return { ...result, items: result.items.map(shaped) };
}

export const getProductFacets = () => viaEndpoint(canonicalQuery("facets"), async () => facetsSummary(await fullList()));

export const getProductCounts = (filters = EMPTY_FILTERS) =>
  viaEndpoint(canonicalQuery("counts", filters), async () => countsSummary(await fullList(), filters));
