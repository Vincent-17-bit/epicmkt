// Home products grid for the live site: a thin client over the cached /api/products endpoint.
//
// The browser asks for one page (24 products), the filter options, or the live option counts. It never downloads the
// catalogue. If the endpoint cannot be reached (local dev has no Vercel functions, or an outage) it falls back to the old path:
// load the full list once (flash/live.js getAllProducts) and answer with the same pure functions the endpoint runs, so a problem
// with the endpoint makes the site slower, never broken.
import { mediaUrl } from "../flash/shape.js";
import { shapeProduct } from "./shape.js";
import * as flashApi from "../flash/index.js";
import { EMPTY_FILTERS } from "../../lib/productFilters.js";
import { countsSummary, facetsSummary, pageOf } from "../../lib/productQuery.js";
import { buildSuggestIndex, suggestFrom } from "../../lib/suggest.js";
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

const shaped = shapeProduct;

export function invalidateProducts() {
  memo.clear();
  inflight.clear();
  downUntil = 0;
  list = null;
}

export async function getProductsPage(filters = EMPTY_FILTERS, { page = 1, pageSize, epoch, variant } = {}) {
  const opts = { page, ...(pageSize ? { pageSize } : {}), ...(Number.isInteger(epoch) ? { epoch } : {}), ...(Number.isInteger(variant) ? { variant } : {}) };
  const result = await viaEndpoint(canonicalQuery("page", filters, opts), async () => pageOf(await fullList(), filters, opts));
  return { ...result, items: result.items.map(shaped) };
}

export const getProductFacets = () => viaEndpoint(canonicalQuery("facets"), async () => facetsSummary(await fullList()));

export const getProductCounts = (filters = EMPTY_FILTERS) =>
  viaEndpoint(canonicalQuery("counts", filters), async () => countsSummary(await fullList(), filters));

// Type-ahead: the endpoint answers from the database dictionary (or its snapshot). Unreachable: the same rules over the full list,
// built once per list. Pictures come back as storage paths, turned into urls here like the grid's.
let localIndex = null;
const withPicture = (result) => ({
  ...result,
  products: (result.products ?? []).map((p) => ({ ...p, image: p.image && !/^https?:\/\//.test(p.image) ? mediaUrl(p.image) : p.image ?? null }))
});

export async function getSuggest(prefix) {
  const q = String(prefix ?? "").trim().slice(0, 60);
  const result = await viaEndpoint(`op=suggest&q=${encodeURIComponent(q.toLowerCase())}`, async () => {
    const products = await fullList();
    if (localIndex?.products !== products) localIndex = { products, index: buildSuggestIndex(products) };
    return { ...suggestFrom(localIndex.index, q), source: "local" };
  });
  return withPicture(result);
}

// Trending searches for the menu, worked out on the hour. Unreachable: nothing (the menu simply leaves the list out).
export const getTrending = () =>
  viaEndpoint("op=trending", async () => ({ computedAt: null, live: true, items: [] })).then((data) => ({
    ...data,
    items: (data.items ?? []).map((i) => ({ ...i, image: i.image && !/^https?:\/\//.test(i.image) ? mediaUrl(i.image) : i.image ?? null }))
  }));
