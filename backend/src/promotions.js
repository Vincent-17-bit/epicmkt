import { BUSINESS_STATUS, chipOf, liveOffers, offerAvailableNow, offerPhase, offerProductCount, offersByItem } from "@epicmkt/shared";
import { store } from "./store.js";
import { now } from "./clock.js";

const salePriceFor = (discount, regular) => {
  const raw =
    discount.type === "percent"
      ? regular * (1 - discount.value / 100)
      : discount.type === "amount_off"
        ? regular - discount.value
        : discount.value;
  return Math.max(0, Math.round(raw));
};

const effective = (regular, salePrice) => (Number.isFinite(salePrice) && salePrice < regular ? salePrice : regular);

const amounts = (regular, salePrice) => ({
  regularPrice: regular,
  salePrice,
  savings: regular - salePrice,
  discountPercent: regular > 0 ? Math.round(((regular - salePrice) / regular) * 100) : 0
});

export function buildPricing(item, sale) {
  const regular = item.regularPrice;
  if (!Number.isFinite(regular)) return null;
  const apply = (price, override) => {
    if (!sale) return price;
    return effective(price, override ?? salePriceFor(sale.discount, price));
  };
  const variants = item.variants.map((variant) => {
    const override = sale?.variantOverrides?.find((o) => o.variantId === variant.id)?.salePrice;
    return { id: variant.id, label: variant.label, ...amounts(variant.price, apply(variant.price, override)) };
  });
  return {
    ...amounts(regular, apply(regular)),
    unit: item.unit,
    priceType: item.priceType,
    variants
  };
}

export function liveSaleFor(item, business, at = now()) {
  if (!item || !business || business.status !== BUSINESS_STATUS.ACTIVE || item.status !== "listed") return null;
  return (
    store.flashSales
      .filter(
        (sale) =>
          sale.businessId === business.id &&
          sale.itemId === item.id &&
          sale.status !== "cancelled" &&
          sale.status !== "ended" &&
          Date.parse(sale.startsAt) <= at &&
          at < Date.parse(sale.endsAt)
      )
      .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))[0] ?? null
  );
}

const businessOffers = (business) => store.offers.filter((offer) => offer.businessId === business.id);

// Offers showing right now on one product of a store. A product that is in no offer gets none.
export function liveOffersFor(item, business, at = now()) {
  if (!item || !business || business.status !== BUSINESS_STATUS.ACTIVE || item.status !== "listed") return [];
  return liveOffers(businessOffers(business), at).filter((offer) => offer.items.some((entry) => entry.itemId === item.id));
}

// Offers that are showing now anywhere in a store, on products customers can see.
export function liveStoreOffers(business, at = now()) {
  const listed = new Set(business.services.filter((svc) => svc.status !== "unlisted").map((svc) => svc.id));
  return liveOffers(businessOffers(business), at).filter((offer) => offer.items.some((entry) => listed.has(entry.itemId)));
}

// The small chip a card shows for one product: the offer to name and how many more there are.
export function offerChipFor(item, business, at = now()) {
  const chip = chipOf(liveOffersFor(item, business, at), at);
  return chip ? { id: chip.top.id, label: chip.label, extra: chip.extra } : null;
}

// The store card's Offer chip counts products that have an offer, not offers.
export function promoCountsFor(business, at = now()) {
  if (!business) return { flash: 0, offers: 0 };
  const items = business.services.filter((svc) => svc.status !== "unlisted");
  const flash = items.filter((svc) => liveSaleFor({ id: svc.id, status: svc.status ?? "listed" }, business, at)).length;
  const listed = new Set(items.map((svc) => svc.id));
  const offers = offerProductCount(
    liveOffers(businessOffers(business), at).map((offer) => ({ ...offer, items: offer.items.filter((entry) => listed.has(entry.itemId)) })),
    at
  );
  return { flash, offers };
}

// The products an offer is on that customers can see, with what a card needs to show them.
export const offerProducts = (offer, business) =>
  offer.items
    .map((entry) => {
      const svc = business.services.find((x) => x.id === entry.itemId);
      return svc && svc.status !== "unlisted"
        ? { id: svc.id, name: svc.name, imageUrl: svc.imageUrl ?? null, price: Number.isFinite(svc.priceKes) ? svc.priceKes : null, role: entry.role }
        : null;
    })
    .filter(Boolean);

export const appliesToLabel = (offer, business) => {
  const names = offer.items
    .map((entry) => business.services.find((svc) => svc.id === entry.itemId)?.name)
    .filter(Boolean);
  if (names.length === 0) return "";
  if (names.length <= 2) return names.join(" + ");
  return `${names[0]} + ${names.length - 1} more`;
};

export { offerAvailableNow, offerPhase, offersByItem };

export function endSale(sale, reason) {
  const at = new Date(now()).toISOString();
  sale.status = "ended";
  sale.endedAt = at;
  sale.endedReason = reason;
  sale.updatedAt = at;
  if (sale.afterEnd !== "unlist") return;
  const business = store.businesses.find((b) => b.id === sale.businessId);
  const svc = business?.services.find((s) => s.id === sale.itemId);
  if (!svc || svc.status === "unlisted") return;
  svc.status = "unlisted";
  svc.unlistReason = "flash_ended";
  store.notifications.push({
    id: `n_${String(store.notifications.length + 1).padStart(4, "0")}`,
    sellerId: business.sellerId,
    type: "flash_sale_ended",
    saleId: sale.id,
    itemId: sale.itemId,
    at
  });
}

export function runSweep() {
  const at = now();
  for (const offer of store.offers) {
    if (offer.status === "scheduled" && (!offer.startsAt || at >= Date.parse(offer.startsAt))) offer.status = "active";
    if ((offer.status === "active" || offer.status === "paused") && offer.endsAt && at >= Date.parse(offer.endsAt)) offer.status = "expired";
  }
  for (const sale of store.flashSales) {
    if (sale.status === "scheduled" && at >= Date.parse(sale.startsAt)) sale.status = "live";
    if (sale.status === "live" && at >= Date.parse(sale.endsAt)) endSale(sale, "time");
  }
}
