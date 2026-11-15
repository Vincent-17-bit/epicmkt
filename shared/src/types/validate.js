// validateProductType: the shape a product type must have to be seeded or saved (A24 to A28).
// Pure. Returns { ok, errors }. It mirrors the database checks (product_type_axes_valid, kind, quantity_mode) and adds
// the rules the database cannot see: scales exist, dependent axes point at an earlier axis, spec rows follow the spec-row rules
// (at most four required), price-tier shapes pass validateTiers, services carry no unit quantity.

import { checkSpecRows } from "../specRules/rows.js";
import { getScale } from "../scales/registry.js";
import { validateTiers } from "../pricing/tiers.js";

export const TYPE_KINDS = Object.freeze(["good", "service", "package"]);
export const TYPE_QUANTITY_MODES = Object.freeze(["units", "measure", "none"]);
export const AXIS_DISPLAYS = Object.freeze(["swatch", "image-card", "button", "text-card", "dropdown"]);
export const MAX_AXES = 3;
const ID = /^[a-z][a-z0-9-]{1,39}$/;
const AXIS_KEY = /^[a-z][a-z0-9_]{0,29}$/;
const VALUE_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const text = (v, max) => typeof v === "string" && v.trim() !== "" && v.length <= max;

export function validateProductType(type, { scales = true } = {}) {
  const errors = [];
  const at = (m) => errors.push(`${type?.id ?? "type"}: ${m}`);
  if (!type || typeof type !== "object") return { ok: false, errors: ["type: must be an object"] };
  if (!ID.test(type.id ?? "")) at("id must be a lowercase slug");
  if (type.slug !== undefined && type.slug !== type.id) at("slug must equal id");
  if (!text(type.name, 60)) at("name is required (60 characters at most)");
  if (!TYPE_KINDS.includes(type.kind)) at(`kind must be one of ${TYPE_KINDS.join(", ")}`);
  if (!TYPE_QUANTITY_MODES.includes(type.quantityMode)) at(`quantityMode must be one of ${TYPE_QUANTITY_MODES.join(", ")}`);
  if (!text(type.departmentId, 40)) at("departmentId is required");
  if (!Array.isArray(type.categoryIds) || type.categoryIds.length === 0 || !type.categoryIds.every((c) => text(c, 60))) at("categoryIds must be a non-empty list");
  if (!Array.isArray(type.restrictedTo ?? []) || !(type.restrictedTo ?? []).every((c) => text(c, 60))) at("restrictedTo must be a list");

  const axes = type.axes ?? [];
  if (!Array.isArray(axes) || axes.length > MAX_AXES) at(`axes: at most ${MAX_AXES}`);
  else {
    const seen = [];
    axes.forEach((a, i) => {
      const p = `axes.${i}`;
      if (!AXIS_KEY.test(a?.key ?? "")) at(`${p}.key must match ${AXIS_KEY}`);
      else if (seen.includes(a.key)) at(`${p}.key repeats`);
      if (!text(a?.label, 40)) at(`${p}.label is required`);
      if (!AXIS_DISPLAYS.includes(a?.display)) at(`${p}.display must be one of ${AXIS_DISPLAYS.join(", ")}`);
      if (a?.scale !== undefined && scales && !getScale(a.scale)) at(`${p}.scale "${a.scale}" is not a known scale`);
      if (a?.dependsOn !== undefined && !seen.includes(a.dependsOn)) at(`${p}.dependsOn must name an earlier axis`);
      if (a?.suggested !== undefined) {
        if (!Array.isArray(a.suggested) || a.suggested.length > 40) at(`${p}.suggested: a list of at most 40`);
        else {
          const ids = new Set();
          a.suggested.forEach((s, j) => {
            if (!VALUE_ID.test(s?.id ?? "") || !text(s?.label, 40)) at(`${p}.suggested.${j}: needs an id slug and a label`);
            else if (ids.has(s.id)) at(`${p}.suggested.${j}: id repeats`);
            else ids.add(s.id);
          });
        }
      }
      seen.push(a?.key);
    });
  }

  for (const m of checkSpecRows(type.specRows ?? [])) at(m);

  const extras = type.extras ?? {};
  if (extras.tiers !== undefined) {
    const { tiers, mode } = extras.tiers;
    // The seed only fixes where the steps start; the seller fills in the prices, so a placeholder price proves the shape.
    const filled = (tiers ?? []).map((t) => ({ ...t, unitPrice: t.unitPrice ?? 1 }));
    const r = validateTiers(filled, mode ?? "whole");
    if (!r.ok) for (const m of r.errors) at(`extras.tiers: ${m}`);
  }
  return { ok: errors.length === 0, errors };
}
