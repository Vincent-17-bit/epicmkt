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

// Sizes 1.9: size chart unit conversion (cm / in), shared by the buyer modal and the admin editor.
export { canToggleUnit, chartInUnit, convertCell, convertLength, matchRow, measurementColumns } from "./chartUnits.js";
// Pricing core: price per combination, flash, offers and sale (integer money). priceFor, itemPriceBounds, priceMin, priceMax, lineTotal.
// The one-item range helper is exported as itemPriceBounds: `priceBounds(items)` already exists in seller/filters.js (the catalog's list-wide
// price slider), and an explicit export here would silently shadow it.
export { priceFor, priceBounds as itemPriceBounds, priceMin, priceMax } from "./pricing.js";
export { lineTotal } from "./pricing/money.js";

// Measured quantity (units | measure | none): normalizeQuantity, checkQuantity, quantityRules, measuredLine, measureTotal.
export { QUANTITY_MODES, quantityModeOf, quantityRules, checkQuantity, normalizeQuantity, parseAmount } from "./quantity.js";
export { measureTotal, measuredMessage, measuredLine, amountText, formatAmount, perUnitText } from "./pricing/measure.js";

// Quantity tier pricing.
export * from "./pricing/tiers.js";

// Flash sale per combination.
export * from "./flash/validateFlashVariants.js";

// Specification rules engine (5.2): specIssues, GENERIC_GOODS_TEMPLATE, checkSpecRows.
export * from "./specRules/index.js";
