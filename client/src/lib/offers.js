export function offerHref(view) {
  const { offer, business } = view;
  if (offer.appliesTo === "items" && offer.itemIds?.length === 1) {
    return `/b/${business.slug}?item=${encodeURIComponent(offer.itemIds[0])}`;
  }
  return `/b/${business.slug}#offers`;
}
