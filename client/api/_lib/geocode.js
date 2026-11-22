export const KENYA = Object.freeze({ south: -4.9, north: 5.1, west: 33.8, east: 41.95 });
export const MAX_QUERY = 80;
export const MIN_QUERY = 2;
export const MAX_RESULTS = 8;

export const inKenya = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= KENYA.south && lat <= KENYA.north && lng >= KENYA.west && lng <= KENYA.east;

const text = (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
const first = (obj, keys) => keys.map((k) => text(obj?.[k])).find(Boolean) ?? "";
const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places;

export function parseRequest(params) {
  const q = text(params.get("q") ?? "");
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  const hasPoint = params.get("lat") !== null && params.get("lng") !== null && inKenya(lat, lng);
  if (q) {
    if (q.length < MIN_QUERY || q.length > MAX_QUERY) return { error: "bad_query" };
    // A position next to a search only ranks nearer places first. It is rounded to about 11 km so searches from one area share a cache entry.
    return { op: "search", q, ...(hasPoint ? { near: { lat: round(lat, 1), lng: round(lng, 1) } } : {}) };
  }
  if (!hasPoint) return { error: "bad_position" };
  return { op: "reverse", lat: round(lat, 4), lng: round(lng, 4) };
}

export const searchUrl = (base, q, near = null) => {
  const url = new URL("/api/", base);
  const query = { q, limit: "20", lang: "en", bbox: `${KENYA.west},${KENYA.south},${KENYA.east},${KENYA.north}` };
  if (near) Object.assign(query, { lat: String(near.lat), lon: String(near.lng), location_bias_scale: "0.4" });
  url.search = new URLSearchParams(query).toString();
  return url.toString();
};

export const reverseUrl = (base, lat, lng) => {
  const url = new URL("/reverse", base);
  url.search = new URLSearchParams({ format: "jsonv2", lat: String(lat), lon: String(lng), zoom: "18", addressdetails: "1", "accept-language": "en" }).toString();
  return url.toString();
};

const labelOf = (name, context) => (context && context.toLowerCase() !== name.toLowerCase() ? `${name}, ${context}` : name);
const join = (parts) => {
  const seen = new Set();
  return parts.filter((p) => p && !seen.has(p.toLowerCase()) && seen.add(p.toLowerCase())).join(", ");
};
const KIND_WORDS = { marketplace: "Market", place_of_worship: "Place of worship", bus_station: "Bus station", post_office: "Post office", social_facility: "Social facility", kindergarten: "Nursery school", college: "College", university: "University", hospital: "Hospital", clinic: "Clinic", doctors: "Clinic", pub: "Bar", bar: "Bar", nightclub: "Club", hotel: "Hotel", guest_house: "Guest house", hostel: "Hostel", mortuary: "Mortuary", funeral_directors: "Funeral home", police: "Police station", pitch: "Sports field", playground: "Playground", stadium: "Stadium", fuel: "Petrol station", bank: "Bank", pharmacy: "Pharmacy", supermarket: "Supermarket", mall: "Mall", school: "School", suburb: "Area", neighbourhood: "Area", quarter: "Area", residential: "Estate", industrial: "Industrial area", factory: "Factory", works: "Factory", house: "House", apartments: "Apartments", residential_building: "Residential building" };
const kindOf = (value) => KIND_WORDS[value] ?? (value && !["yes", "no"].includes(value) ? value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "");

/** The place a position is at, from a Nominatim reverse answer: { name, label, area } or null. `label` is as exact as the map data allows
 *  (a named building or shop, else the road, then the area and town); `area` is the short form ("Kilimani, Nairobi") for the header. */
export function placeFromReverse(body) {
  const a = body?.address;
  if (!a || String(a.country_code ?? "").toLowerCase() !== "ke") return null;
  const area = first(a, ["neighbourhood", "suburb", "quarter", "city_district", "hamlet", "village"]);
  const town = first(a, ["city", "town", "municipality", "county", "state"]);
  const named = text(body?.name);
  const road = first(a, ["road", "pedestrian", "footway"]);
  const specific = named || [text(a.house_number), road].filter(Boolean).join(" ") || "";
  const short = join([area || (specific ? "" : town), town]);
  if (!specific && !short) return null;
  const label = join([specific, area, town]);
  return { name: specific || area || town, label, area: short || label };
}

/** Kenyan places from a Photon (GeoJSON) answer, best first, without duplicates: [{ name, label, lat, lng, kind }].
 *  Anything with a name and a position in Kenya counts: areas, estates, schools, hospitals, markets, bars, churches, bus stations, streets, houses. */
export function placesFromSearch(body) {
  const seen = new Set();
  const out = [];
  for (const f of Array.isArray(body?.features) ? body.features : []) {
    const p = f?.properties ?? {};
    const [lng, lat] = Array.isArray(f?.geometry?.coordinates) ? f.geometry.coordinates.map(Number) : [];
    const name = text(p.name) || [text(p.housenumber), text(p.street)].filter(Boolean).join(" ");
    if (!name || String(p.countrycode ?? "").toUpperCase() !== "KE" || p.type === "country" || !inKenya(lat, lng)) continue;
    const label = join([name, first(p, ["district", "locality", "suburb"]), first(p, ["city", "county", "state"])]);
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, label, lat: round(lat, 5), lng: round(lng, 5), kind: kindOf(text(p.osm_value)) });
    if (out.length >= MAX_RESULTS) break;
  }
  return out;
}
