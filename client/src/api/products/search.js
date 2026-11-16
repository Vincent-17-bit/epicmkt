// Product search for the /products page. Demo: the in-memory backend's products. Live: the cached /api/products endpoint
// answers `op=search` from its snapshot; if it cannot be reached, the full public list is loaded once and the same shared
// searchProducts() runs here, so a problem with the endpoint makes search slower, never broken.
import * as backend from "@epicmkt/backend";
import { searchProducts, writeSearch } from "@epicmkt/shared";
import { isLive } from "../flash/mode.js";
import { buildSuggestIndex, correctWord, suggestKey } from "../../lib/suggest.js";
import * as flashApi from "../flash/index.js";

const ENDPOINT = "/api/products";
const TIMEOUT_MS = 8000;
const LIST_MS = 60_000;
let list = null;

async function fullList() {
  if (list && Date.now() - list.at < LIST_MS) return list.promise;
  const promise = flashApi.getAllProducts();
  list = { at: Date.now(), promise };
  promise.catch(() => {
    if (list?.promise === promise) list = null;
  });
  return promise;
}

async function viaEndpoint(search) {
  const query = writeSearch(search);
  query.set("op", "search");
  const res = await fetch(`${ENDPOINT}?${query}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok || !(res.headers.get("content-type") ?? "").includes("application/json")) throw new Error(`search_${res.status}`);
  return res.json();
}

// Nothing found: try once more with each unknown word corrected against the catalogue's own words ("mlik" -> "milk"), as the
// endpoint does, and say so with `corrected`.
const indexes = new WeakMap();
function searchCorrecting(products, search) {
  const result = searchProducts(products, search);
  if (result.total || !String(search.q ?? "").trim()) return result;
  if (!indexes.has(products)) indexes.set(products, buildSuggestIndex(products));
  const typed = suggestKey(search.q);
  const fixed = typed.split(" ").map((w) => correctWord(indexes.get(products), w) ?? w).join(" ");
  if (fixed === typed) return result;
  const again = searchProducts(products, { ...search, q: fixed });
  return again.total ? { ...again, corrected: fixed } : result;
}

export async function searchCatalog(search) {
  if (!isLive()) return searchCorrecting(await backend.getAllProducts(), search);
  try {
    return await viaEndpoint(search);
  } catch {
    return searchCorrecting(await fullList(), search);
  }
}
