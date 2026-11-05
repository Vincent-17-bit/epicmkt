// A03: the remaining measure scales. Register them with A02's scale registry.
// TODO(contract:A02): A02 owns shared/src/scales/index.js. Until it is merged this file stands alone; once it is merged, A02's index
// calls registerRemainingScales((id, scale) => ...) or spreads REMAINING_SCALES, and nothing here changes.
import { UNIT_SCALES } from "./units.js";
import { dimensions } from "./dimensions.js";
import { SIZE_SCALES } from "./sizes.js";
import { ORDINAL_SCALES } from "./ordinal.js";

export * from "./units.js";
export { dimensions, dimensionLabels, dimensionProfileId, DIMENSION_PROFILES } from "./dimensions.js";
export * from "./sizes.js";
export * from "./ordinal.js";
export { slugKey, parseNumber } from "./kit.js";

/** Every scale A03 adds, in a stable order. Each has {id, parse(raw, ctx), format(value, opts), sizeKey, compare, toBase, plausible(typeId, axisKey, value)}. */
export const REMAINING_SCALES = [...UNIT_SCALES, dimensions, ...SIZE_SCALES, ...ORDINAL_SCALES];
export const REMAINING_SCALE_IDS = REMAINING_SCALES.map((s) => s.id);
const BY_ID = new Map(REMAINING_SCALES.map((s) => [s.id, s]));
export const remainingScale = (id) => BY_ID.get(id) ?? null;
export function registerRemainingScales(register) {
  for (const scale of REMAINING_SCALES) register(scale.id, scale);
}
