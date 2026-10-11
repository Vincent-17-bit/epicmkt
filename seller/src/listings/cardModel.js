import { AVAILABILITY_LABELS, isLowStock, isStalePrice, visibilityOf } from "@epicmkt/shared";

const DOT = {
  available: "available",
  limited_stock: "limited",
  out_of_stock: "unavailable",
  unavailable: "unavailable",
  seasonal: "available",
  by_appointment: "available",
  coming_soon: "limited"
};

export function toCardItem(item) {
  const sale = item.price !== null && item.salePrice !== null && item.salePrice < item.price;
  const pricing =
    item.price === null
      ? null
      : {
          regularPrice: item.price,
          salePrice: sale ? item.salePrice : item.price,
          savings: sale ? item.price - item.salePrice : 0,
          discountPercent: sale ? Math.round(((item.price - item.salePrice) / item.price) * 100) : 0
        };
  return { id: item.id, name: item.name, imageUrl: item.imageUrl, availability: DOT[item.availability] ?? "available", pricing };
}

const labelCache = {};

export function cardLabels(availability) {
  const key = DOT[availability] ?? "available";
  const id = `${key}:${availability}`;
  labelCache[id] ??= { was: "Was", availability: { [key]: AVAILABILITY_LABELS[availability] ?? "Available" } };
  return labelCache[id];
}

export function describeItem(item, ctx) {
  const visibility = visibilityOf(item);
  let ribbon = null;
  if (item.removedByAdmin) ribbon = { tone: "admin", text: "Removed by admin", reason: item.adminReason };
  else if (visibility === "hidden_by_admin") ribbon = { tone: "admin", text: "Hidden by admin", reason: item.adminReason };
  else if (visibility === "draft") ribbon = { tone: "me", text: "Draft", reason: "Not showing to customers yet" };
  else if (visibility === "hidden_by_me") ribbon = { tone: "me", text: "Hidden by me", reason: "Customers cannot see this item" };
  const lowStock = isLowStock(item);
  return {
    ribbon,
    visibility,
    dimmed: Boolean(ribbon),
    locked: item.hiddenByAdmin || item.removedByAdmin,
    availabilityLabel: AVAILABILITY_LABELS[item.availability] ?? "Available",
    lowStock: lowStock ? `Low stock: ${item.stockCount} left` : null,
    stale: isStalePrice(item, ctx),
    flagged: item.openFlags > 0,
    reports: item.reports30d,
    reportsText: item.reports30d > 0 ? `${item.reports30d} ${item.reports30d === 1 ? "report" : "reports"}` : null
  };
}
