// FIXTURE ONLY. The real health score is computed in SQL (business_health(), migration 0069) and the admin never calculates
// one. This file only produces rows with the same SHAPE the server sends, so the screens can be built and tested without a
// database. Its numbers are plausible, not authoritative: do not copy anything from here into production code.
import { ApiError } from "./errors.js";

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const WEIGHTS = { profile: 20, freshness: 25, activity: 35, trust: 20 };
const BANDS = { healthy: 70, watch: 40 };
const LABELS = { healthy: "Healthy", watch: "Watch", at_risk: "At risk" };

export function fixtureHealth({ completeness, items, priceAgeDays, loginAgeDays, openFlags, openReports, strikes, state, ageDays, serious = false }) {
  const grace = ageDays < 14;
  const profile = completeness;
  const freshness = items === 0 ? (grace ? 70 : 0) : clamp(100 - priceAgeDays * 2.2);
  const activity = clamp(loginAgeDays <= 3 ? 100 : 100 - ((loginAgeDays - 3) / 27) * 100);
  const trust = clamp(100 - Math.min(50, openFlags * 25) - Math.min(30, openReports * 15) - Math.min(60, strikes * 20));
  let score = clamp((profile * WEIGHTS.profile + freshness * WEIGHTS.freshness + activity * WEIGHTS.activity + trust * WEIGHTS.trust) / 100);

  const reasons = [];
  let capped = false;
  const cap = (text) => { reasons.unshift({ part: "cap", tone: "bad", points: 0, text }); if (score > 39) { score = 39; capped = true; } };
  if (state === "suspended" || state === "expired") cap(`${state === "suspended" ? "Suspended" : "Expired"}: the score cannot rise above 39`);
  if (serious) cap("Open flag unanswered for over 7 days: the score cannot rise above 39");
  if (strikes >= 3) cap(`Strike threshold reached (${strikes}): the score cannot rise above 39`);

  const lost = { profile: (WEIGHTS.profile / 100) * (100 - profile), freshness: (WEIGHTS.freshness / 100) * (100 - freshness), activity: (WEIGHTS.activity / 100) * (100 - activity), trust: (WEIGHTS.trust / 100) * (100 - trust) };
  const tone = (v) => (v < BANDS.watch ? "bad" : v < BANDS.healthy ? "warn" : "note");
  if (lost.activity >= 1) reasons.push({ part: "activity", tone: tone(activity), points: Math.round(lost.activity), text: `No login, edit or price confirmation for ${loginAgeDays} days` });
  if (lost.freshness >= 1) reasons.push({ part: "freshness", tone: tone(freshness), points: Math.round(lost.freshness), text: items === 0 ? "No items listed, so there are no prices to keep fresh" : `${Math.round((items * freshness) / 100)} of ${items} prices confirmed in the last 14 days` });
  if (lost.profile >= 1) reasons.push({ part: "profile", tone: tone(profile), points: Math.round(lost.profile), text: `Profile ${Math.round((profile * 8) / 100)} of 8 complete` });
  if (lost.trust >= 1) reasons.push({ part: "trust", tone: tone(trust), points: Math.round(lost.trust), text: [openFlags && `${openFlags} open flag${openFlags > 1 ? "s" : ""}`, openReports && `${openReports} open report${openReports > 1 ? "s" : ""}`, strikes && `${strikes} strike${strikes > 1 ? "s" : ""}`].filter(Boolean).join(", ") });
  if (grace && (items === 0 || loginAgeDays >= 30)) reasons.push({ part: "grace", tone: "info", points: 0, text: "New business: freshness and activity are scored as neutral (70) until day 14" });
  const body = reasons.filter((r) => r.part !== "cap" && r.part !== "grace").sort((a, b) => b.points - a.points);
  const ordered = [...reasons.filter((r) => r.part === "cap"), ...body, ...reasons.filter((r) => r.part === "grace")];

  const band = score >= BANDS.healthy ? "healthy" : score >= BANDS.watch ? "watch" : "at_risk";
  const weakest = Object.entries(lost).sort((a, b) => b[1] - a[1])[0];
  return {
    score, band, label: LABELS[band], capped, weakest: weakest[1] >= 1 ? weakest[0] : null, grace,
    bands: { ...BANDS }, subs: { profile, freshness, activity, trust }, weights: { ...WEIGHTS }, reasons: ordered,
  };
}

/** 30 days of snapshots ending today, a gentle walk that finishes at the current score. Deterministic per business. */
export function fixtureHistory(id, score, today = new Date()) {
  let seed = [...String(id)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7);
  const next = () => { seed = (Math.imul(seed ^ (seed >>> 15), 2246822507) + 374761393) | 0; return ((seed >>> 0) % 1000) / 1000; };
  const out = [];
  let value = clamp(score + (next() - 0.5) * 36);
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    value = i === 0 ? score : clamp(value + (score - value) * 0.12 + (next() - 0.5) * 9);
    if (i > 24 && next() < 0.4) continue;   // a business created or scored late has gaps at the start
    out.push({ day: d.toISOString().slice(0, 10), score: value, band: value >= BANDS.healthy ? "healthy" : value >= BANDS.watch ? "watch" : "at_risk" });
  }
  return out;
}

export const DEFAULT_HEALTH_CONFIG = {
  weights: { ...WEIGHTS }, grace_days: 14, neutral: 70, freshness_days: 14,
  freshness_days_by_category: { bakery: 3, tailor: 60 },
  activity_full_days: 3, activity_zero_days: 30,
  trust: { flag: 25, flag_cap: 50, report: 15, report_cap: 30, strike: 20, strike_cap: 60 },
  serious_flag_days: 7, bands: { ...BANDS },
};

let config = structuredClone(DEFAULT_HEALTH_CONFIG);
const wait = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));
const whole = (v, min, max) => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

export async function getHealthConfig() {
  await wait();
  return structuredClone(config);
}

export async function saveHealthConfig(next) {
  await wait();
  const w = next?.weights ?? {};
  const t = next?.trust ?? {};
  const ok = ["profile", "freshness", "activity", "trust"].every((k) => whole(w[k], 0, 100))
    && whole(next?.grace_days, 0, 90) && whole(next?.neutral, 0, 100) && whole(next?.freshness_days, 1, 365)
    && whole(next?.activity_full_days, 0, 90) && whole(next?.activity_zero_days, 1, 365) && whole(next?.serious_flag_days, 0, 90)
    && ["flag", "flag_cap", "report", "report_cap", "strike", "strike_cap"].every((k) => whole(t[k], 0, 100))
    && whole(next?.bands?.healthy, 2, 100) && whole(next?.bands?.watch, 1, 99);
  if (!ok) throw new ApiError("invalid_health_config");
  if (w.profile + w.freshness + w.activity + w.trust <= 0) throw new ApiError("invalid_health_weights");
  if (next.bands.watch >= next.bands.healthy) throw new ApiError("invalid_health_bands");
  if (next.activity_zero_days <= next.activity_full_days) throw new ApiError("invalid_health_activity");
  const byCategory = next.freshness_days_by_category ?? {};
  for (const [key, days] of Object.entries(byCategory)) {
    if (!/^[a-z0-9-]{2,50}$/.test(key) || !whole(days, 1, 365)) throw new ApiError("invalid_health_config");
  }
  config = structuredClone({ ...next, freshness_days_by_category: byCategory });
  return structuredClone(config);
}
