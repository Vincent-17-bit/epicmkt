export const PLAN_LIMIT_DEFAULTS = {
  // historyEntries: how many item History entries are shown (null = all). flashAttribution: whether the panel attributes
  // views and taps to flash sales and offers. Read both through limitsFor(), never with an inline plan check.
  standard: { galleryPhotos: 5, activeOffers: 8, flashSalesPerMonth: 3, flashSalesConcurrent: 1, historyEntries: 5, flashAttribution: false },
  premium: { galleryPhotos: 20, activeOffers: null, flashSalesPerMonth: 10, flashSalesConcurrent: 5, historyEntries: null, flashAttribution: true },
};

export const planOf = (plan) => (plan === "premium" ? "premium" : "standard");

export const limitsFor = (plan, globalLimits) => {
  const key = planOf(plan);
  return { ...PLAN_LIMIT_DEFAULTS[key], ...(globalLimits?.[key] ?? {}) };
};

export const GALLERY_CAPTION_MAX = 120;
export const PAIR_CATEGORIES = ["barbershop", "salon-beauty"];
export const TIMETABLE_CATEGORIES = ["salon-beauty", "gym-fitness"];

export const teamCapabilities = (plan, categoryId) => {
  const premium = planOf(plan) === "premium";
  return {
    staff: true,
    services: premium,
    timetable: premium && TIMETABLE_CATEGORIES.includes(categoryId),
    timetableCategory: TIMETABLE_CATEGORIES.includes(categoryId),
  };
};

export const canPair = (categoryId) => PAIR_CATEGORIES.includes(categoryId);
