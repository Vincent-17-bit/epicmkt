const HOUR = 3600000;

const sale = (id, businessId, itemId, startsInH, endsInH, discount, extra = {}) => {
  const at = Date.now();
  return {
    id,
    businessId,
    itemId,
    headline: null,
    startsAt: new Date(at + startsInH * HOUR).toISOString(),
    endsAt: new Date(at + endsInH * HOUR).toISOString(),
    discount,
    variantOverrides: [],
    quantityNote: null,
    afterEnd: "keep",
    status: startsInH <= 0 ? "live" : "scheduled",
    endedAt: null,
    endedReason: null,
    createdAt: new Date(at - 24 * HOUR).toISOString(),
    updatedAt: new Date(at - 24 * HOUR).toISOString(),
    ...extra
  };
};

export const seedFlashSales = () => [
  sale("f_001", "b_001", "fade-and-beard", -2, 6, { type: "percent", value: 20 }, { headline: "Weekend fade deal", quantityNote: "Walk-ins only" }),
  sale("f_002", "b_017", "box-braids", -1, 30, { type: "percent", value: 10 }, {
    variantOverrides: [{ variantId: "medium", salePrice: 2000 }]
  }),
  sale("f_003", "b_010", "dairy-meal-70kg", -3, 12, { type: "amount_off", value: 200 }, { afterEnd: "unlist" }),
  sale("f_004", "b_004", "10l-refill", 5, 48, { type: "sale_price", value: 15 })
];
