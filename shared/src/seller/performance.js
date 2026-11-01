// Performance panel: the one list of ranges, shared by the panel and the tests. The server (seller_performance) accepts the same keys.
export const PERFORMANCE_RANGES = [
  { key: "7d", label: "7 days" },
  { key: "1m", label: "1 month" },
  { key: "6m", label: "6 months" },
  { key: "12m", label: "12 months" },
  { key: "24m", label: "24 months" },
  { key: "36m", label: "36 months" },
  { key: "all", label: "All time" },
];
export const DEFAULT_PERFORMANCE_RANGE = "1m";

export const PERFORMANCE_METRICS = [
  { key: "view", label: "Views" },
  { key: "whatsapp", label: "WhatsApp taps" },
  { key: "call", label: "Call taps" },
  { key: "directions", label: "Directions taps" },
];

export const isPerformanceRange = (key) => PERFORMANCE_RANGES.some((r) => r.key === key);

const ZERO = { view: 0, whatsapp: 0, call: 0, directions: 0 };

// Tolerates a missing or partly filled answer so the panel never has to guard each field.
export const normalizePerformance = (raw) => {
  const totals = { ...ZERO, ...(raw?.totals ?? {}) };
  for (const k of Object.keys(ZERO)) totals[k] = Number.isFinite(Number(totals[k])) ? Number(totals[k]) : 0;
  const series = Array.isArray(raw?.series)
    ? raw.series.map((p) => ({ bucket: String(p.bucket ?? ""), ...Object.fromEntries(Object.keys(ZERO).map((k) => [k, Number(p[k]) || 0])) }))
    : [];
  return { range: raw?.range ?? DEFAULT_PERFORMANCE_RANGE, grain: raw?.grain ?? "day", from: raw?.from ?? null, to: raw?.to ?? null, totals, series };
};

export const performanceIsEmpty = (perf) => Object.values(perf.totals).every((n) => n === 0);

// "Locked" History copy: one plain line, same wording rule as the "(Premium)" label on Import.
export const HISTORY_LOCK_TEXT = "Older changes are part of Premium.";
export const historyHiddenCount = (history) => (history?.locked ? Math.max(0, (history.total ?? 0) - (history.entries?.length ?? 0)) : 0);
