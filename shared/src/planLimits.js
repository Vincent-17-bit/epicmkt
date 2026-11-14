// Plan limits and feature switches for the options, 3D, recommend, delivery and demand features (Prompt 11.5).
// Stored per plan in global_limits (`standard`, `premium`): `options` { axes, values, variants } (already read by the seller editor),
// `threeD` { models, spinFrames } and `features` { options, threeD, recommend, delivery, demand }.
// A plan can only LOWER a hard limit, never raise it, and a missing value means "the hard limit". Every switch is on unless a plan turns it off,
// so shops keep everything they have today. The database function admin_save_plan_limits repeats these rules; keep them in step.

import { OPTION_LIMITS } from "./seller/options.js";
import { MEDIA3D } from "./media3d.js";


/** group.key -> the hard cap, and the lowest a plan may set. */
export const PLAN_LIMIT_RULES = Object.freeze({
  options: Object.freeze({
    axes: Object.freeze({ min: 1, max: OPTION_LIMITS.axes, label: "Option types per item" }),
    values: Object.freeze({ min: 1, max: OPTION_LIMITS.values, label: "Values per option type" }),
    variants: Object.freeze({ min: 1, max: OPTION_LIMITS.variants, label: "Combinations per item" })
  }),
  threeD: Object.freeze({
    models: Object.freeze({ min: 0, max: 40, label: "3D models per item" }),
    spinFrames: Object.freeze({ min: MEDIA3D.spinMinFrames, max: MEDIA3D.spinMaxFrames, label: "Spin frames per 360 view" })
  })
});

export const FEATURE_SWITCHES = Object.freeze([
  Object.freeze({ key: "options", label: "Options and combinations", hint: "Colours, sizes and other choices with their own price and stock." }),
  Object.freeze({ key: "threeD", label: "3D and 360 views", hint: "Spin views and 3D models on the item page." }),
  Object.freeze({ key: "recommend", label: "Recommend", hint: "Related items shown under an item." }),
  Object.freeze({ key: "delivery", label: "Delivery block", hint: "Delivery area, fee and time on the item page." }),
  Object.freeze({ key: "demand", label: "Demand signals", hint: "What shoppers searched for and did not find." })
]);

const FEATURE_KEYS = FEATURE_SWITCHES.map((f) => f.key);
const isPlan = (p) => (p === "premium" ? "premium" : "standard");

/** The limits a plan has, with the hard limit filled in for anything it does not lower. */
export function planLimitValues(plan, global) {
  const own = global?.[isPlan(plan)] ?? {};
  const out = { options: {}, threeD: {} };
  for (const [group, fields] of Object.entries(PLAN_LIMIT_RULES)) {
    for (const [key, rule] of Object.entries(fields)) {
      const v = own?.[group]?.[key];
      out[group][key] = Number.isInteger(v) && v >= rule.min && v < rule.max ? v : rule.max;
    }
  }
  return out;
}

/** Which features a plan has. A switch that is not set to false is on. */
export function planSwitches(plan, global) {
  const own = global?.[isPlan(plan)]?.features ?? {};
  return Object.fromEntries(FEATURE_KEYS.map((k) => [k, own[k] !== false]));
}

/** @returns {{ ok: boolean, errors: Record<string, string>, value: object|null }}  `value` holds only what a plan changes from the defaults */
export function checkPlanLimits(input) {
  const errors = {};
  const value = { options: {}, threeD: {}, features: {} };
  const src = input && typeof input === "object" ? input : {};
  for (const [group, fields] of Object.entries(PLAN_LIMIT_RULES)) {
    for (const [key, rule] of Object.entries(fields)) {
      const raw = src?.[group]?.[key];
      if (raw === undefined || raw === null || raw === "") continue;
      if (!Number.isInteger(raw) || raw < rule.min || raw > rule.max) { errors[`${group}.${key}`] = `${rule.label}: a whole number from ${rule.min} to ${rule.max}.`; continue; }
      if (raw < rule.max) value[group][key] = raw; // the hard limit is the default, so it is not stored
    }
  }
  for (const key of Object.keys(src.features ?? {})) {
    if (!FEATURE_KEYS.includes(key)) { errors[`features.${key}`] = `Unknown feature "${key}".`; continue; }
    if (typeof src.features[key] !== "boolean") { errors[`features.${key}`] = "A switch is on or off."; continue; }
    if (src.features[key] === false) value.features[key] = false;
  }
  return { ok: Object.keys(errors).length === 0, errors, value: Object.keys(errors).length ? null : value };
}
