import { coverUrl } from "@epicmkt/ui";
import { quantityInfo } from "../../lib/itemView.js";
import { isServiceItem } from "../../lib/listing.js";

// Building the line to store needs the quantity rules and the product/service rule, which are big. Cards load this file only when a heart is
// tapped (preloaded when the browser is idle); the item page, which already has them, imports it directly.
const unitNow = (item, override) => {
  if (Number.isFinite(override)) return override;
  const p = item?.pricing;
  if (Number.isFinite(p?.salePrice)) return p.salePrice;
  return Number.isFinite(p?.regularPrice) ? p.regularPrice : null;
};

/** The line to store: ids, the option, the quantity and a small snapshot (never anything the buyer typed). */
export function entryFor({ item, business, optionParam = "", optionLabel = "", qty = 1, unit }) {
  const shop = business ?? item?.business ?? {};
  const info = quantityInfo(item);
  const measure = info?.mode === "measure" ? { min: info.rules.min, step: info.rules.step, unit: info.unit } : null;
  return {
    itemId: item.id,
    businessId: item.businessId || shop.id,
    businessSlug: item.businessSlug || shop.slug || "",
    optionParam,
    optionLabel,
    kind: isServiceItem(item) ? "service" : "product",
    qty,
    snap: { name: item.name, image: coverUrl(item) || null, unit: unitNow(item, unit), businessName: shop.name || "", mode: measure ? "measure" : "units", measure, counted: Boolean(info) }
  };
}
