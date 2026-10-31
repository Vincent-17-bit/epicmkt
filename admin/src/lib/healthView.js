// How a business health score is SHOWN. There is no formula here: the score, band, four parts, weights and reasons are all
// computed once, in SQL (business_health(), migration 0069), and arrive on each row as `health`. This file only names things.

export const BANDS = {
  healthy: { label: "Healthy", tone: "success" },
  watch: { label: "Watch", tone: "warning" },
  at_risk: { label: "At risk", tone: "danger" },
  none: { label: "No score", tone: "neutral" },
};

export const PARTS = [
  { id: "profile", label: "Profile", hint: "How complete the listing is (8 checks)" },
  { id: "freshness", label: "Prices", hint: "Share of items with a recently confirmed price" },
  { id: "activity", label: "Activity", hint: "Latest login, edit or price confirmation" },
  { id: "trust", label: "Trust", hint: "Open flags, open reports and strikes" },
];

const DEFAULT_BANDS = { healthy: 70, watch: 40 };

/** The band for a part score, using the thresholds the server sent (so a tuned setting changes the colours too). */
export function toneOfScore(value, bands = DEFAULT_BANDS) {
  if (!Number.isFinite(value)) return "neutral";
  return value >= bands.healthy ? "success" : value >= bands.watch ? "warning" : "danger";
}

/** Always returns something drawable, even for a row from an older server that has only a number. */
export function readHealth(row) {
  const h = row?.health;
  if (h && typeof h === "object" && "band" in h) return h;
  const score = Number.isFinite(row?.healthScore) ? Math.round(row.healthScore) : null;
  const band = score === null ? "none" : score >= DEFAULT_BANDS.healthy ? "healthy" : score >= DEFAULT_BANDS.watch ? "watch" : "at_risk";
  return { score, band, label: BANDS[band].label, capped: false, weakest: null, grace: false, bands: DEFAULT_BANDS, subs: null, weights: null, reasons: [] };
}

/** The part dragging the score down most, or null. */
export function weakestPart(health) {
  if (!health?.weakest || !health.subs) return null;
  const part = PARTS.find((p) => p.id === health.weakest);
  return part ? { ...part, value: health.subs[part.id] } : null;
}

/** Change against about a week ago. `trend` is a number of points, or null while there is no snapshot that old. */
export function trendInfo(trend) {
  if (!Number.isFinite(trend)) return { dir: "none", text: "", label: "No trend yet" };
  if (Math.abs(trend) < 2) return { dir: "flat", text: "Steady", label: "Steady compared with a week ago" };
  const points = Math.abs(Math.round(trend));
  const unit = points === 1 ? "point" : "points";
  return trend > 0
    ? { dir: "up", text: `+${points}`, label: `Up ${points} ${unit} on a week ago` }
    : { dir: "down", text: `−${points}`, label: `Down ${points} ${unit} on a week ago` };
}

/** One sentence for screen readers and the title of the ring. */
export function describeHealth(health, trend) {
  if (!health || health.score === null || health.score === undefined) return "No health score";
  const weak = weakestPart(health);
  const parts = [`Health ${health.score} out of 100, ${health.label}`];
  if (health.capped) parts.push("capped");
  if (weak) parts.push(`weakest part ${weak.label.toLowerCase()} at ${weak.value}`);
  const t = trendInfo(trend);
  if (t.dir !== "none") parts.push(t.label.toLowerCase());
  return parts.join(", ");
}

/** The history strip on the business page: 30 days ending today, a day with no snapshot is a gap (null). */
export function historyStrip(history, days = 30, today = new Date()) {
  const byDay = new Map((history ?? []).map((h) => [String(h.day).slice(0, 10), h]));
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, ...(byDay.get(key) ?? { score: null, band: null }) });
  }
  return out;
}
