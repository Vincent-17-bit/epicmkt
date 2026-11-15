// Product search for the /products page. Demo: the in-memory backend's products. Live: the cached /api/products endpoint
// answers `op=search` from its snapshot; if it cannot be reached, the full public list is loaded once and the same shared
// searchProducts() runs here, so a problem with the endpoint makes search slower, never broken.
import * as backend from "@epicmkt/backend";
import { searchProducts, writeSearch } from "@epicmkt/shared";
import { isLive } from "../flash/mode.js";
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

export async function searchCatalog(search) {
  if (!isLive()) return searchProducts(await backend.getAllProducts(), search);
  try {
    return await viaEndpoint(search);
  } catch {
    return searchProducts(await fullList(), search);
  }
}
