const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const sale = (id, businessId, itemId, startsInMs, endsInMs, discount, extra = {}) => {
  const at = Date.now();
  return {
    id,
    businessId,
    itemId,
    headline: null,
    startsAt: new Date(at + startsInMs).toISOString(),
    endsAt: new Date(at + endsInMs).toISOString(),
    discount,
    variantOverrides: [],
    quantityNote: null,
    afterEnd: "keep",
    status: startsInMs <= 0 ? "live" : "scheduled",
    endedAt: null,
    endedReason: null,
    createdAt: new Date(at - 24 * HOUR).toISOString(),
    updatedAt: new Date(at - 24 * HOUR).toISOString(),
    ...extra
  };
};

export const seedFlashSales = () => [
  sale("f_001", "b_001", "fade-and-beard", -2 * HOUR, 6 * HOUR, { type: "percent", value: 20 }, { headline: "Weekend fade deal", quantityNote: "Walk-ins only" }),
  sale("f_002", "b_017", "box-braids", -HOUR, 30 * HOUR, { type: "percent", value: 10 }, {
    variantOverrides: [{ variantId: "medium", salePrice: 2000 }]
  }),
  sale("f_003", "b_010", "dairy-meal-70kg", -3 * HOUR, 12 * HOUR, { type: "amount_off", value: 200 }, { afterEnd: "unlist" }),
  sale("f_004", "b_004", "10l-refill", 5 * HOUR, 48 * HOUR, { type: "sale_price", value: 15 }),
  sale("f_005", "b_013", "monthly-membership", -4 * HOUR, 20 * HOUR, { type: "percent", value: 15 }, { headline: "Join this week" }),
  sale("f_006", "b_007", "multivitamin-30-tablets", -HOUR, 9 * HOUR, { type: "amount_off", value: 50 }),
  sale("f_007", "b_020", "pressure-cooker-5l", -2 * HOUR, 14 * HOUR, { type: "percent", value: 25 }, { quantityNote: "While stock lasts" }),
  sale("f_008", "b_016", "manicure", -HOUR, 48 * MINUTE, { type: "sale_price", value: 450 }),
  sale("f_009", "b_003", "hot-towel-shave", 3 * HOUR, 30 * HOUR, { type: "percent", value: 10 }),
  sale("f_010", "b_005", "20l-refill", -2 * HOUR, 25 * MINUTE, { type: "sale_price", value: 30 }, { headline: "Fill up cheap" }),
  sale("f_011", "b_014", "monthly-membership", -6 * HOUR, 4 * MINUTE, { type: "amount_off", value: 400 }, { quantityNote: "Last few slots" }),
  sale("f_012", "b_020", "two-burner-gas-cooker", -HOUR, 30 * SECOND, { type: "percent", value: 20 }, { afterEnd: "unlist", quantityNote: "Final unit" }),
  sale("f_013", "b_008", "multivitamin-30-tablets", -HOUR, 72 * HOUR, { type: "amount_off", value: 80 }),
  sale("f_014", "b_035", "1-kg-vanilla-cake", -3 * HOUR, 2 * HOUR, { type: "percent", value: 20 }, { headline: "Fresh today" }),
  sale("f_015", "b_015", "day-pass", -HOUR, 46 * HOUR, { type: "percent", value: 25 }),
  sale("f_016", "b_025", "exterior-wash", -HOUR, 3 * HOUR, { type: "sale_price", value: 150 }, { headline: "Wash day" })
];
