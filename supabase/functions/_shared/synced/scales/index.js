// Scale framework (Contract v1): parse, format, sizeKey, compare, toBase, plausible, validateAxisValues.
// Each scale is one file in this folder (see define.js). Register new ones with registerScale().
import { adoptScale, registerScale } from "./registry.js";
import { registerRemainingScales } from "./remaining/index.js";
import apparelAlpha from "./apparel-alpha.js";
import apparelNumeric from "./apparel-numeric.js";
import kidsAge from "./kids-age.js";
import collarInch from "./collar-inch.js";
import shoe from "./shoe.js";
import screenInch from "./screen-inch.js";
import storage from "./storage.js";
import bodyMeasure from "./body-measure.js";
import ringSize from "./ring-size.js";

for (const s of [apparelAlpha, apparelNumeric, kidsAge, collarInch, shoe, screenInch, storage, bodyMeasure, ringSize]) registerScale(s);
// A03's 26 measure scales (length, volume, weight, duration, dimensions, count ...) live in ./remaining and are registered through the adapter.
registerRemainingScales((id, scale) => registerScale(adoptScale(scale)));

export { defineScale } from "./define.js";
export { registerScale, adoptScale, getScale, listScales, parse, format, sizeKey, compare, toBase, MAX_AXIS_VALUES } from "./registry.js";
export { plausible, PLAUSIBILITY_RULES } from "./plausibility.js";
export { validateAxisValues } from "./validate.js";
export { SHOE_CHART } from "./shoeChart.js";
export { dimensionLabels, dimensionProfileId, DIMENSION_PROFILES } from "./remaining/dimensions.js"; // B05: the seller editor labels its boxes from the product type
