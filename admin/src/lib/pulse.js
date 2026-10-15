import { eatDayKey } from "./series.js";

const DAY = 86_400_000;

export const RING_DAYS = [1, 3, 7, 14, 30];

export const BANDS = [
  { key: "grace", label: "Grace", shape: "cross", tone: "danger" },
  { key: "d1", label: "Within 1 day", shape: "diamond", tone: "danger" },
  { key: "d3", label: "Within 3 days", shape: "triangle", tone: "warning" },
  { key: "d7", label: "Within 7 days", shape: "square", tone: "warning" },
  { key: "d14", label: "Within 14 days", shape: "circle", tone: "info" },
  { key: "d30", label: "Within 30 days", shape: "ring", tone: "neutral" },
];

export const LAYERS = [
  { key: "flagged", label: "Open flags", shape: "triangle", tone: "danger" },
  { key: "grace", label: "In grace", shape: "cross", tone: "danger" },
  { key: "expiring", label: "Expiring in 7 days", shape: "square", tone: "warning" },
  { key: "applications", label: "Applications", shape: "diamond", tone: "info" },
  { key: "live", label: "Live", shape: "circle", tone: "success" },
];

const dayNumber = (value) => Date.parse(eatDayKey(value)) / DAY;

export function daysLeft(paidUntil, now = new Date()) {
  if (!paidUntil || Number.isNaN(Date.parse(paidUntil))) return null;
  return dayNumber(paidUntil) - dayNumber(now);
}

export function bandFor(days) {
  if (days === null || days < -1 || days > 30) return null;
  if (days < 0) return BANDS[0];
  if (days <= 1) return BANDS[1];
  if (days <= 3) return BANDS[2];
  if (days <= 7) return BANDS[3];
  if (days <= 14) return BANDS[4];
  return BANDS[5];
}

export function layersFor(item, now = new Date()) {
  const layers = [];
  if (item.flagged) layers.push("flagged");
  if (item.kind === "application") return [...layers, "applications"];
  const days = daysLeft(item.paid_until, now);
  if (days !== null && days < 0 && days >= -1) layers.push("grace");
  else if (days !== null && days >= 0 && days <= 7) layers.push("expiring");
  if (days === null || days >= 0) layers.push("live");
  return layers;
}

export function buildPulse(raw, now = new Date()) {
  const flagged = new Set(raw.flaggedIds ?? []);
  const rows = [
    ...(raw.businesses ?? []).map((b) => ({ id: b.id, kind: "business", name: b.name, county: b.county ?? "", lat: b.lat, lng: b.lng, status: b.status ?? "live", paid_until: b.paid_until ?? null, flagged: flagged.has(b.id) })),
    ...(raw.applications ?? []).map((a) => ({ id: a.id, kind: "application", name: a.business_name ?? a.name, county: a.county ?? "", lat: a.lat, lng: a.lng, status: a.status ?? "submitted", paid_until: null, flagged: false })),
  ];
  return rows
    .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng))
    .map((row) => ({ ...row, days: row.kind === "business" ? daysLeft(row.paid_until, now) : null, layers: layersFor(row, now) }))
    .filter((row) => row.layers.length > 0);
}

export function displayLayer(item, enabled) {
  return LAYERS.find((layer) => item.layers.includes(layer.key) && enabled.has(layer.key)) ?? null;
}

export function expiringItems(items) {
  return items
    .filter((item) => item.kind === "business" && bandFor(item.days))
    .map((item) => ({ ...item, band: bandFor(item.days) }))
    .sort((a, b) => a.days - b.days || a.name.localeCompare(b.name));
}

export function bandCounts(items) {
  const counts = Object.fromEntries(BANDS.map((band) => [band.key, 0]));
  for (const item of items) counts[item.band.key] += 1;
  return counts;
}

const KNOTS = [[-1, 38], [0, 58], [1, 80], [3, 108], [7, 138], [14, 160], [30, 176]];
export const RADAR = { size: 380, centre: 190, knots: KNOTS, pointRadius: 7 };

export function radiusFor(days) {
  const d = Math.min(30, Math.max(-1, days));
  for (let i = 1; i < KNOTS.length; i += 1) {
    const [d0, r0] = KNOTS[i - 1];
    const [d1, r1] = KNOTS[i];
    if (d <= d1) return r0 + ((d - d0) / (d1 - d0)) * (r1 - r0);
  }
  return KNOTS[KNOTS.length - 1][1];
}

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function layoutRadar(items, { gap = 3 } = {}) {
  const { centre, pointRadius } = RADAR;
  const min = pointRadius * 2 + gap;
  const placed = [];
  for (const item of items) {
    const r = radiusFor(item.days);
    let angle = hash(item.id) * Math.PI * 2;
    const step = (min / Math.max(r, 1)) * 0.9;
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 400; tries += 1) {
      x = centre + r * Math.sin(angle);
      y = centre - r * Math.cos(angle);
      if (!placed.some((p) => Math.hypot(p.x - x, p.y - y) < min)) break;
      angle += step;
    }
    placed.push({ ...item, x, y, r });
  }
  return placed;
}

export function formatDayEat(value) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", weekday: "short", day: "numeric", month: "short" }).format(new Date(value)).replace(",", "");
}

export function describeDays(days) {
  if (days === null) return "No expiry date";
  if (days < 0) return "In grace: expired yesterday";
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  return `Expires in ${days} days`;
}
