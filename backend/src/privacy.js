// Location privacy helpers. One implementation, used by the client store (to coarsen device fixes) and by the
// analytics sinks (to guarantee no coordinates are ever written to a log, whatever a call site passes).

// Two decimals is about 1.1 km. Distances in the app are straight-line and shown to the nearest 100 m at best,
// so a street-level fix adds nothing to the feature and only adds risk if it ever leaks.
export const COORD_DECIMALS = 2;

const FACTOR = 10 ** COORD_DECIMALS;

// Keys that carry a position. Matched case-insensitively against the whole key.
const POSITION_KEY = /^(lat|lng|lon|long|latitude|longitude|coord|coords|coordinates|location|origin|position|geo|geolocation|accuracy)$/i;

// Two decimal numbers with three or more decimals each, e.g. "-0.0917, 34.7680" or "0.0917 34.7680".
const COORD_PAIR = /-?\d{1,3}\.\d{3,}\s*[,;/\s]\s*-?\d{1,3}\.\d{3,}/;

const MAX_DEPTH = 3;

export function coarsenCoord(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * FACTOR) / FACTOR : null;
}

export function coarsenCoords(point) {
  if (!point) return null;
  const lat = coarsenCoord(point.lat);
  const lng = coarsenCoord(point.lng);
  return lat === null || lng === null ? null : { lat, lng };
}

export function looksLikeCoordinates(text) {
  return typeof text === "string" && COORD_PAIR.test(text);
}

function scrub(value, depth) {
  if (typeof value === "string") return looksLikeCoordinates(value) ? undefined : value;
  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return undefined;
    return value.map((v) => scrub(v, depth + 1)).filter((v) => v !== undefined);
  }
  if (value && typeof value === "object") {
    if (depth >= MAX_DEPTH) return undefined;
    const out = {};
    for (const [key, inner] of Object.entries(value)) {
      if (POSITION_KEY.test(key)) continue;
      const clean = scrub(inner, depth + 1);
      if (clean !== undefined) out[key] = clean;
    }
    return out;
  }
  return value;
}

// Returns a copy of an analytics payload with every position removed: position-named keys at any depth,
// and any string that reads as a coordinate pair. Anything that is not a plain object becomes {}.
export function scrubPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  return scrub(payload, 0) ?? {};
}
