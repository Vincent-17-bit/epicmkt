// Text for the size charts page (migration 0093). Errors are the P0001 codes the database functions raise.
export const SIZE_CHART_ERRORS = {
  invalid_name: "Use 2 to 80 characters for the name.",
  invalid_unit: "Choose a unit from the list.",
  invalid_category: "That category does not exist. Pick one from the list or leave it empty.",
  invalid_chart: "The rows do not fit the columns. Every row needs a value (up to 20 characters) in every column.",
  invalid_type_ids: "A product type in the list does not exist, is repeated, or there are more than 20.",
  duplicate_chart: "Another chart already has this name in this category. Use a different name.",
  chart_not_found: "That chart no longer exists. Reload the list.",
  size_chart_in_use: "An item or a product type still uses this chart. Release them first (or switch the chart off instead).",
  invalid_shoe_chart: "The shoe table does not pass the rules. Fix the rows marked in red and save again.",
  item_not_found: "That item no longer exists. Search again.",
  chart_inactive: "That chart is switched off. Switch it on first, or pick another.",
  forbidden: "Only the Owner can change size charts.",
};

export const chartError = (error) =>
  SIZE_CHART_ERRORS[error?.code] ?? SIZE_CHART_ERRORS[String(error?.message ?? "").split(":")[0].trim()] ?? error?.message ?? "Something went wrong. Try again.";

export const rowsText = (n) => `${n} ${n === 1 ? "row" : "rows"}`;
export const typesText = (n) => `${n} ${n === 1 ? "type" : "types"}`;
export const itemsUsingText = (n) => `${n} ${n === 1 ? "item" : "items"}`;
