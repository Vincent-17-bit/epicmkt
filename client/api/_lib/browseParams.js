// Turns a request's query string into clean engine parameters, and the other way round.
//
// Two jobs:
//  1. Safety: this endpoint is public, so every number is clamped and every string length-limited before it reaches the engine.
//  2. Cache hit rate: the CDN caches by URL. If "?b=1&a=2" and "?a=2&b=1", or a location that differs by one metre, were
//     different URLs, nobody would ever share a cached answer. canonicalQuery() gives one URL per distinct question.

const SORTS = new Set(["relevance", "distance", "rating", "newest", "price_asc", "price_desc"]);
const OPS = new Set(["categories", "towns", "counties", "search", "facets", "suggest", "featured", "nearby", "similar"]);

export const isOp = (op) => OPS.has(op);

const text = (v, max = 100) => {
  const s = String(v ?? "").trim().slice(0, max);
  return s || null;
};
const num = (v, { min = -Infinity, max = Infinity, int = false } = {}) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.min(max, Math.max(min, n));
  return int ? Math.round(clamped) : clamped;
};
const flag = (v) => v === "1" || v === "true" || v === true;

// About 110 m. Distances shown on cards stay accurate to a tenth of a km, and nearby visitors share one cached answer.
export const roundCoord = (n) => Math.round(n * 1000) / 1000;

const coords = (get) => {
  const lat = num(get("lat"), { min: -90, max: 90 });
  const lng = num(get("lng"), { min: -180, max: 180 });
  return lat === null || lng === null ? {} : { lat: roundCoord(lat), lng: roundCoord(lng) };
};

export function parseRequest(searchParams) {
  const get = (k) => searchParams.get(k);
  const op = get("op");
  if (!isOp(op)) return null;
  switch (op) {
    case "search":
      return {
        op,
        params: {
          query: text(get("query")) ?? "",
          categoryId: text(get("categoryId")),
          county: text(get("county")),
          town: text(get("town")),
          openNow: flag(get("openNow")),
          closedNow: flag(get("closedNow")),
          open24: flag(get("open24")),
          openLate: flag(get("openLate")),
          openSunday: flag(get("openSunday")),
          verifiedOnly: flag(get("verifiedOnly")),
          featuredOnly: flag(get("featuredOnly")),
          flashSale: flag(get("flashSale")),
          hasOffers: flag(get("hasOffers")),
          hasWhatsapp: flag(get("hasWhatsapp")),
          newlyListed: flag(get("newlyListed")),
          radiusKm: num(get("radiusKm"), { min: 0, max: 500 }),
          minPrice: num(get("minPrice"), { min: 0 }),
          maxPrice: num(get("maxPrice"), { min: 0 }),
          minRating: num(get("minRating"), { min: 0, max: 5 }) ?? 0,
          sort: SORTS.has(get("sort")) ? get("sort") : "relevance",
          seed: text(get("seed"), 40) ?? 0,
          page: num(get("page"), { min: 1, max: 10_000, int: true }) ?? 1,
          pageSize: num(get("pageSize"), { min: 1, max: 48, int: true }) ?? 12,
          ...coords(get)
        }
      };
    case "facets":
      return { op, params: { query: text(get("query")) ?? "", categoryId: text(get("categoryId")) } };
    case "suggest":
      return { op, params: { prefix: text(get("prefix"), 60) ?? "", limit: num(get("limit"), { min: 1, max: 20, int: true }) ?? 6 } };
    case "featured":
      return {
        op,
        params: {
          categoryId: text(get("categoryId")),
          limit: num(get("limit"), { min: 1, max: 24, int: true }) ?? 6,
          seed: text(get("seed"), 40),
          ...coords(get)
        }
      };
    case "nearby":
      return {
        op,
        params: {
          categoryId: text(get("categoryId")),
          radiusKm: num(get("radiusKm"), { min: 0.1, max: 500 }) ?? 10,
          limit: num(get("limit"), { min: 1, max: 24, int: true }) ?? 8,
          ...coords(get)
        }
      };
    case "similar":
      return { op, params: { ref: text(get("ref"), 120), limit: num(get("limit"), { min: 1, max: 12, int: true }) ?? 4 } };
    default:
      return { op, params: {} };
  }
}

// Builds the one canonical query string for a call: keys sorted, empty values dropped, coordinates rounded.
export function canonicalQuery(op, params = {}) {
  const pairs = [["op", op]];
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "" || value === false || Number.isNaN(value)) continue;
    const v = key === "lat" || key === "lng" ? roundCoord(Number(value)) : value === true ? "1" : value;
    if (v === undefined || (typeof v === "number" && !Number.isFinite(v))) continue;
    pairs.push([key, String(v)]);
  }
  pairs.sort((a, b) => (a[0] === "op" ? -1 : b[0] === "op" ? 1 : a[0].localeCompare(b[0])));
  return pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
}
