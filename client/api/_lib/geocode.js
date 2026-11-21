export const KENYA = Object.freeze({ south: -4.9, north: 5.1, west: 33.8, east: 41.95 });
export const MAX_QUERY = 80;
export const MIN_QUERY = 2;
export const MAX_RESULTS = 6;

export const inKenya = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= KENYA.south && lat <= KENYA.north && lng >= KENYA.west && lng <= KENYA.east;

const text = (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
const first = (obj, keys) => keys.map((k) => text(obj?.[k])).find(Boolean) ?? "";
const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places;

export function parseRequest(params) {
  const q = text(params.get("q") ?? "");
  if (q) {
    if (q.length < MIN_QUERY || q.length > MAX_QUERY) return { error: "bad_query" };
    return { op: "search", q };
  }
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  if (params.get("lat") === null || params.get("lng") === null || !inKenya(lat, lng)) return { error: "bad_position" };
  return { op: "reverse", lat: round(lat, 3), lng: round(lng, 3) };
}

export const searchUrl = (base, q) => {
  const url = new URL("/api/", base);
  url.search = new URLSearchParams({ q, limit: "10", lang: "en", osm_tag: "place", bbox: `${KENYA.west},${KENYA.south},${KENYA.east},${KENYA.north}` }).toString();
  return url.toString();
};

export const reverseUrl = (base, lat, lng) => {
  const url = new URL("/reverse", base);
  url.search = new URLSearchParams({ format: "jsonv2", lat: String(lat), lon: String(lng), zoom: "14", addressdetails: "1", "accept-language": "en" }).toString();
  return url.toString();
};

const labelOf = (name, context) => (context && context.toLowerCase() !== name.toLowerCase() ? `${name}, ${context}` : name);

/** The area a position falls in, from a Nominatim reverse answer: { name, label } or null. The most local name wins (suburb, neighbourhood), with its town for context. */
export function placeFromReverse(body) {
  const a = body?.address;
  if (!a || String(a.country_code ?? "").toLowerCase() !== "ke") return null;
  const name = first(a, ["neighbourhood", "suburb", "quarter", "city_district", "hamlet", "village", "town", "city", "municipality"]);
  if (!name) return null;
  const context = first(a, ["city", "town", "municipality", "county", "state"]);
  return { name, label: labelOf(name, context) };
}

/** Kenyan areas from a Photon (GeoJSON) answer, best first, without duplicates: [{ name, label, lat, lng, kind }]. */
export function placesFromSearch(body) {
  const seen = new Set();
  const out = [];
  for (const f of Array.isArray(body?.features) ? body.features : []) {
    const p = f?.properties ?? {};
    const [lng, lat] = Array.isArray(f?.geometry?.coordinates) ? f.geometry.coordinates.map(Number) : [];
    const name = text(p.name);
    if (!name || String(p.countrycode ?? "").toUpperCase() !== "KE" || !["place", "boundary"].includes(p.osm_key) || !inKenya(lat, lng)) continue;
    const context = first(p, ["city", "district", "county", "state"]);
    const label = labelOf(name, context);
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, label, lat: round(lat, 4), lng: round(lng, 4), kind: text(p.osm_value) });
    if (out.length >= MAX_RESULTS) break;
  }
  return out;
}
