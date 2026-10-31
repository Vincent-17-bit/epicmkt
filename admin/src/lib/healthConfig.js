// The form behind Settings > Business health. Numbers are validated here only to give quick, specific feedback; the server
// (admin_save_health_config, migration 0069) checks the same ranges again and is the authority. No scoring happens here.

export const RULES = {
  w_profile: { min: 0, max: 100, label: "Profile weight" },
  w_freshness: { min: 0, max: 100, label: "Prices weight" },
  w_activity: { min: 0, max: 100, label: "Activity weight" },
  w_trust: { min: 0, max: 100, label: "Trust weight" },
  band_healthy: { min: 2, max: 100, label: "Healthy from" },
  band_watch: { min: 1, max: 99, label: "Watch from" },
  grace_days: { min: 0, max: 90, label: "New-business grace (days)" },
  neutral: { min: 0, max: 100, label: "Neutral score" },
  freshness_days: { min: 1, max: 365, label: "Price window (days)" },
  activity_full_days: { min: 0, max: 90, label: "Full marks until (days)" },
  activity_zero_days: { min: 1, max: 365, label: "Zero at (days)" },
  t_flag: { min: 0, max: 100, label: "Points per open flag" },
  t_flag_cap: { min: 0, max: 100, label: "Flag penalty cap" },
  t_report: { min: 0, max: 100, label: "Points per open report" },
  t_report_cap: { min: 0, max: 100, label: "Report penalty cap" },
  t_strike: { min: 0, max: 100, label: "Points per strike" },
  t_strike_cap: { min: 0, max: 100, label: "Strike penalty cap" },
  serious_flag_days: { min: 0, max: 90, label: "Serious after (days)" },
};

export const WEIGHT_KEYS = [
  ["w_profile", "Profile"],
  ["w_freshness", "Prices"],
  ["w_activity", "Activity"],
  ["w_trust", "Trust"],
];

const str = (n) => String(n ?? "");

export function toForm(config) {
  const c = config ?? {};
  return {
    w_profile: str(c.weights?.profile), w_freshness: str(c.weights?.freshness), w_activity: str(c.weights?.activity), w_trust: str(c.weights?.trust),
    band_healthy: str(c.bands?.healthy), band_watch: str(c.bands?.watch),
    grace_days: str(c.grace_days), neutral: str(c.neutral), freshness_days: str(c.freshness_days),
    activity_full_days: str(c.activity_full_days), activity_zero_days: str(c.activity_zero_days),
    t_flag: str(c.trust?.flag), t_flag_cap: str(c.trust?.flag_cap), t_report: str(c.trust?.report), t_report_cap: str(c.trust?.report_cap),
    t_strike: str(c.trust?.strike), t_strike_cap: str(c.trust?.strike_cap), serious_flag_days: str(c.serious_flag_days),
    categories: Object.entries(c.freshness_days_by_category ?? {}).map(([id, days]) => ({ id, days: str(days) })),
  };
}

const whole = (v) => (/^\d{1,4}$/.test(String(v).trim()) ? Number(v) : null);

/** { config, errors }: `config` is null when anything is wrong. `errors` maps a field key (or "form", or "category:<n>") to a message. */
export function fromForm(form) {
  const errors = {};
  const n = {};
  for (const [key, rule] of Object.entries(RULES)) {
    const v = whole(form[key]);
    if (v === null || v < rule.min || v > rule.max) errors[key] = `${rule.label}: a whole number from ${rule.min} to ${rule.max}.`;
    else n[key] = v;
  }

  const byCategory = {};
  (form.categories ?? []).forEach((row, i) => {
    const id = String(row.id ?? "").trim();
    const days = whole(row.days);
    if (!id) errors[`category:${i}`] = "Choose a category.";
    else if (byCategory[id] !== undefined) errors[`category:${i}`] = "That category is already listed.";
    else if (days === null || days < 1 || days > 365) errors[`category:${i}`] = "Days: a whole number from 1 to 365.";
    else byCategory[id] = days;
  });

  if (!errors.w_profile && !errors.w_freshness && !errors.w_activity && !errors.w_trust && n.w_profile + n.w_freshness + n.w_activity + n.w_trust <= 0) {
    errors.form = "At least one weight must be above 0.";
  }
  if (n.band_healthy !== undefined && n.band_watch !== undefined && n.band_watch >= n.band_healthy) errors.band_watch = "“Watch from” must be lower than “Healthy from”.";
  if (n.activity_full_days !== undefined && n.activity_zero_days !== undefined && n.activity_zero_days <= n.activity_full_days) errors.activity_zero_days = "“Zero at” must be above “Full marks until”.";
  if (Object.keys(errors).length) return { config: null, errors };

  return {
    errors,
    config: {
      weights: { profile: n.w_profile, freshness: n.w_freshness, activity: n.w_activity, trust: n.w_trust },
      grace_days: n.grace_days, neutral: n.neutral, freshness_days: n.freshness_days, freshness_days_by_category: byCategory,
      activity_full_days: n.activity_full_days, activity_zero_days: n.activity_zero_days,
      trust: { flag: n.t_flag, flag_cap: n.t_flag_cap, report: n.t_report, report_cap: n.t_report_cap, strike: n.t_strike, strike_cap: n.t_strike_cap },
      serious_flag_days: n.serious_flag_days,
      bands: { healthy: n.band_healthy, watch: n.band_watch },
    },
  };
}

/** Each weight as a percentage of the total, for the live readout. Unreadable numbers count as 0; all zero gives all zero. */
export function weightShares(form) {
  const values = WEIGHT_KEYS.map(([key]) => {
    const v = whole(form[key]);
    return v === null ? 0 : Math.min(100, v);
  });
  const total = values.reduce((a, b) => a + b, 0);
  return WEIGHT_KEYS.map(([key, label], i) => ({ key, label, value: values[i], share: total ? Math.round((100 * values[i]) / total) : 0 }));
}

/** True when the form differs from the saved config (compared as normalised JSON, so "014" and "14" are the same). */
export function isChanged(form, saved) {
  const { config } = fromForm(form);
  if (!config) return true;
  return JSON.stringify(sortKeys(config)) !== JSON.stringify(sortKeys(saved));
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}
