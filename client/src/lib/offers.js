import { itemPath } from "../config/breadcrumbs.js";

export function offerHref(view) {
  const { offer, business } = view;
  if (offer.appliesTo === "items" && offer.itemIds?.length === 1) {
    return itemPath(business.slug, offer.itemIds[0]);
  }
  return `/b/${business.slug}#offers`;
}
