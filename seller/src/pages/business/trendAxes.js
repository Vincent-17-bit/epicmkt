const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const GRAIN_UNIT = { day: "day", week: "week", month: "month" };

export const niceMax = (max) => {
  const raw = Math.max(1, max);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const steps = mag >= 10 ? [1, 2, 2.5, 5, 10] : [1, 2, 5, 10];
  const step = steps.map((m) => m * mag).find((s) => s * 4 >= raw) ?? 10 * mag;
  const top = Math.ceil(raw / step) * step;
  return { top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) };
};

export const bucketLabel = (bucket, grain, withYear) => {
  const [y, m, d] = String(bucket).slice(0, 10).split("-").map(Number);
  if (!y || !m) return String(bucket);
  if (grain === "month") return `${MONTHS[m - 1]} ${y}`;
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${String(y).slice(2)}` : ""}`;
};

export const fullLabel = (bucket, grain) => {
  const [y, m, d] = String(bucket).slice(0, 10).split("-").map(Number);
  if (!y || !m) return String(bucket);
  if (grain === "month") return `${MONTHS[m - 1]} ${y}`;
  const text = `${d} ${MONTHS[m - 1]} ${y}`;
  return grain === "week" ? `Week of ${text}` : text;
};

export const labelIndexes = (n, want = 5) => {
  if (n <= want) return Array.from({ length: n }, (_, i) => i);
  return [...new Set(Array.from({ length: want }, (_, i) => Math.round((i * (n - 1)) / (want - 1))))];
};

export const indexAt = (frac, n) => (n <= 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1)))));

export const peakIndex = (values) => values.reduce((best, v, i) => (v > values[best] ? i : best), 0);
