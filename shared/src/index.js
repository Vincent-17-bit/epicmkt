export * from "./constants.js";
export * from "./time.js";
export * from "./shopTime.js";
export * from "./utils.js";
export * from "./openState.js";
export * from "./template.js";
export * from "./seller/password.js";
export * from "./seller/media.js";
export * from "./seller/mediaSequence.js";
export * from "./seller/images.js";
export * from "./seller/cloudinarySign.js";
export * from "./seller/proofs.js";
export * from "./seller/exceptions.js";
export * from "./seller/hours.js";
export * from "./seller/flash.js";
export * from "./offers.js";
export * from "./availability.js";
export * from "./seller/filters.js";
export * from "./seller/bulk.js";
export * from "./seller/options.js";
export * from "./seller/importer.js";
export * from "./seller/itemForm.js";
export * from "./receipts.js";
export * from "./shopLink.js";
export * from "./similar.js";
export * from "./seller/settings.js";
export * from "./seller/limits.js";
export * from "./seller/performance.js";
export * from "./seller/team.js";
export * from "./variants.js";
export * from "./options/index.js";

// Contract v1 (W0): product types, option/price contracts, validators, lazy fixtures. See docs/contracts/.
export * from "./contracts/index.js";

// Scale framework (A02, Wave 1). The Contract v1 functions are generic names (parse, format, compare), so they live under `scales`;
// the unambiguous ones are also exported flat. Module path for the full API: shared/src/scales/index.js
export * as scales from "./scales/index.js";
export { sizeKey, validateAxisValues, registerScale, defineScale, listScales } from "./scales/index.js";

// A18: open values dictionary (typed material, colour, brand). normalizeValueKey is the one canonical key function.
export * from "./openValues.js";

// Selling restrictions and type requests (A08).
export * from "./types/restrictions.js";

// A05: size charts and shoe conversion (convertShoe, cleanShoeConversion, shoeChartFrom, shoeTable, pickSizeChart, SEED_SIZE_CHARTS).
export * from "./sizeCharts.js";

// Pricing core: price per combination, flash, offers and sale (integer money). priceFor, priceBounds, priceMin, priceMax, lineTotal.
export { priceFor, priceBounds, priceMin, priceMax } from "./pricing.js";
export { lineTotal } from "./pricing/money.js";
