// Where an offer's card sends the customer: straight to the product when the offer is on one product, otherwise to the
// store's offers section, where every product in the offer is listed.
export function offerHref(view) {
  const { offer, business } = view;
  const ids = (offer.items ?? []).map((entry) => entry.itemId);
  if (ids.length === 1) return `/b/${business.slug}?item=${encodeURIComponent(ids[0])}`;
  return `/b/${business.slug}#offers`;
}
