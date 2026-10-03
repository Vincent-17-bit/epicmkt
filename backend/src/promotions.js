import { BUSINESS_STATUS } from "@epicmkt/shared";
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
  for (const sale of store.flashSales) {
    if (sale.status === "scheduled" && at >= Date.parse(sale.startsAt)) sale.status = "live";
    if (sale.status === "live" && at >= Date.parse(sale.endsAt)) endSale(sale, "time");
  }
}
