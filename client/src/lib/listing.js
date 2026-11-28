import { SERVICE_CATEGORIES, kindOf } from "@epicmkt/shared";

/**
 * Product or service: the same rule search uses for its `listing` (shared/src/search/search.js). An item says so itself, else the
 * item's kind (the product type's service flag), else the shop's category. Not a new rule.
 */
export function isServiceItem(item) {
  if (!item) return false;
  if (item.kind === "service") return true;
  if (item.kind === "product") return false;
  const k = kindOf(item);
  return Boolean(k ? k.service : SERVICE_CATEGORIES.has(item.business?.categoryId));
}
