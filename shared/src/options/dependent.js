// Dependent options. An axis may say `dependsOn: "<key of an earlier axis>"`. Its list of values then follows what the seller
// actually sells for the buyer's choice on that axis: Style "New Version" shows 64 GB and 2 TB and drops 32 GB.
// The lists are derived from the sellable combinations (the variants), never stored a second time.
//
// A combination is sellable when a variant exists for it and its status is not "unavailable". Sold-out variants still count: the
// value stays in the list (so the buyer sees it), and the picker marks it. An absent combination is "not sold".

import { findDefaultVariant } from "./defaultVariant.js";

const sellable = (variant) => variant && variant.status !== "unavailable";

// The axis a given axis depends on, chained up to the first axis: ["style"] for capacity, [] for style.
// Stops on an unknown key or a repeat, so bad data can never loop.
export const ancestorKeys = (axes, axisKey) => {
  const list = Array.isArray(axes) ? axes : [];
  const out = [];
  let axis = list.find((a) => a.key === axisKey);
  while (axis?.dependsOn && !out.includes(axis.dependsOn) && axis.dependsOn !== axisKey) {
    out.push(axis.dependsOn);
    axis = list.find((a) => a.key === axis.dependsOn);
  }
  return out;
};

// Does this variant agree with every chosen value in `selection` for the given axes?
const agrees = (variant, keys, selection) => keys.every((k) => typeof selection?.[k] !== "string" || variant.choice?.[k] === selection[k]);

// The values of one axis the buyer may pick now, in the seller's order, as value objects.
// An axis with no dependsOn lists all its values. A dependent axis lists the values that have a sellable combination with the
// current choice on the axes it depends on. While nothing is chosen on those axes yet, it lists every value that is sold at all.
export const dependentValues = (axes, variants, axisKey, selection = {}) => {
  const list = Array.isArray(axes) ? axes : [];
  const axis = list.find((a) => a.key === axisKey);
  if (!axis) return [];
  if (!axis.dependsOn) return axis.values;
  const up = ancestorKeys(list, axisKey);
  const rows = (Array.isArray(variants) ? variants : []).filter((v) => sellable(v) && agrees(v, up, selection));
  const present = new Set(rows.map((v) => v.choice?.[axisKey]));
  return axis.values.filter((v) => present.has(v.id));
};

// The buyer's choice made whole and consistent. Axes are walked in order. A value that is still on offer is kept (switching Style
// keeps 128 GB when the other style has it); otherwise the default of what is left is chosen (the seller's default, else the
// cheapest in stock). Never returns a value that is not in the axis. An empty `selection` gives the default variant's choice.
export const reconcileSelection = (axes, variants, selection = {}, defaultVariantId = null) => {
  const list = Array.isArray(axes) ? axes : [];
  const rows = Array.isArray(variants) ? variants : [];
  const next = {};
  for (const axis of list) {
    const offered = dependentValues(list, rows, axis.key, next);
    const wanted = selection?.[axis.key];
    if (offered.some((v) => v.id === wanted)) {
      next[axis.key] = wanted;
      continue;
    }
    const decided = Object.keys(next);
    const pool = rows.filter((v) => sellable(v) && agrees(v, decided, next));
    const pick = findDefaultVariant(rows, defaultVariantId, pool.length ? pool : rows);
    const id = pick?.choice?.[axis.key];
    next[axis.key] = offered.some((v) => v.id === id) ? id : (offered[0]?.id ?? axis.values[0]?.id);
  }
  return next;
};

// The variant that matches a full choice, or null when that combination is not sold (or the choice is incomplete).
export const variantForChoice = (axes, variants, choice) => {
  const list = Array.isArray(axes) ? axes : [];
  if (list.length === 0 || !choice) return null;
  return (variants ?? []).find((v) => list.every((a) => v.choice?.[a.key] === choice[a.key])) ?? null;
};
