// Browse API for the live site: a thin client over the cached /api/browse endpoint.
//
// The browser asks questions and gets back one page of answers. It never downloads the catalog. If the endpoint cannot be
// reached (local dev has no Vercel functions, or an outage), it falls back to the old build-it-in-the-browser path in
// liveLegacy.js, so a problem with the endpoint makes the site slower, never broken.
import { NotFoundError } from "@epicmkt/backend";
import { mediaUrl } from "../flash/shape.js";
import { canonicalQuery } from "../../../api/_lib/browseParams.js";
import * as legacy from "./liveLegacy.js";

const ENDPOINT = "/api/browse";
const TIMEOUT_MS = 8000;
const MEMO_MS = 10_000;
// After the endpoint fails, go straight to the fallback for a while instead of making every call wait for a timeout.
const COOLDOWN_MS = 60_000;
const UNAVAILABLE_MS = 10_000;

const memo = new Map();
const inflight = new Map();
let downUntil = 0;
let unavailableUntil = 0;

const unreachable = (reason) => Object.assign(new Error(reason), { name: "BrowseEndpointError" });
const unavailable = () => Object.assign(new Error("browse_unavailable"), { name: "BrowseUnavailableError" });

async function fetchJson(query) {
  const res = await fetch(`${ENDPOINT}?${query}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 404) {
    const body = await res.json().catch(() => ({}));
    if (body?.error === "not_found") throw new NotFoundError(body.message || "Not found");
  }
  if (res.status === 503) {
    const body = await res.json().catch(() => ({}));
    if (body?.error === "unavailable") throw unavailable();
  }
  const type = res.headers.get("content-type") ?? "";
  // A 404 page or the SPA's index.html is not an answer: treat it as "endpoint not here".
  if (!res.ok || !type.includes("application/json")) throw unreachable(`browse_${res.status}`);
  return res.json();
}

// Same question twice in a row (a re-render, two components) is one request. Answers are also kept for a few seconds.
function ask(op, params) {
  const query = canonicalQuery(op, params);
  const hit = memo.get(query);
  if (hit && Date.now() - hit.at < MEMO_MS) return Promise.resolve(hit.value);
  if (inflight.has(query)) return inflight.get(query);
  const promise = fetchJson(query)
    .then((value) => {
      memo.set(query, { at: Date.now(), value });
      if (memo.size > 200) memo.delete(memo.keys().next().value);
      return value;
    })
    .finally(() => inflight.delete(query));
  inflight.set(query, promise);
  return promise;
}

// Runs the endpoint call; on "endpoint unreachable" (not on a real answer such as not-found) uses the fallback.
async function viaEndpoint(op, params, fallback) {
  if (Date.now() < unavailableUntil) throw unavailable();
  if (Date.now() < downUntil) return fallback();
  try {
    return await ask(op, params);
  } catch (error) {
    if (error?.name === "NotFoundError") throw error;
    if (error?.name === "BrowseUnavailableError") {
      unavailableUntil = Date.now() + UNAVAILABLE_MS;
      throw error;
    }
    downUntil = Date.now() + COOLDOWN_MS;
    return fallback();
  }
}

// The endpoint returns raw storage paths for pictures; media-host sharding stays in the browser. The fallback path already
// returns full URLs, so anything that is already a URL is left alone.
const media = (value) => (value && !/^https?:\/\//.test(value) ? mediaUrl(value) : value ?? null);
const withMedia = (summary) => ({ ...summary, coverUrl: media(summary.coverUrl), logoUrl: media(summary.logoUrl) });

export function invalidateBrowseCache() {
  memo.clear();
  inflight.clear();
  downUntil = 0;
  unavailableUntil = 0;
  legacy.invalidateBrowseCache();
}

export const getCategories = () => viaEndpoint("categories", {}, () => legacy.getCategories());
export const getTowns = () => viaEndpoint("towns", {}, () => legacy.getTowns());
export const getCounties = () => viaEndpoint("counties", {}, () => legacy.getCounties());

export const getSearchFacets = (params = {}) =>
  viaEndpoint("facets", { query: params.query, categoryId: params.categoryId }, () => legacy.getSearchFacets(params));

export async function getSuggestions(prefix, limit = 6) {
  if (String(prefix ?? "").trim().length < 2) return [];
  return viaEndpoint("suggest", { prefix, limit }, () => legacy.getSuggestions(prefix, limit));
}

export async function searchBusinesses(params = {}) {
  const result = await viaEndpoint("search", params, () => legacy.searchBusinesses(params));
  return { ...result, items: result.items.map(withMedia) };
}

export async function getFeaturedBusinesses(params = {}) {
  return (await viaEndpoint("featured", params, () => legacy.getFeaturedBusinesses(params))).map(withMedia);
}

export async function getNearbyBusinesses(params = {}) {
  const { lat, lng } = params;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  return (await viaEndpoint("nearby", params, () => legacy.getNearbyBusinesses(params))).map(withMedia);
}

export async function getSimilarBusinesses(ref, limit = 4) {
  return (await viaEndpoint("similar", { ref, limit }, () => legacy.getSimilarBusinesses(ref, limit))).map(withMedia);
}

export const getTopSearches = (limit) => legacy.getTopSearches(limit);
export const logSearch = (term) => legacy.logSearch(term);
