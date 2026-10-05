export const TIER_PLANS = {
  A: { standard: { price: 300, items: 20 }, premium: { price: 600, items: 60 } },
  B: { standard: { price: 500, items: 30 }, premium: { price: 1000, items: 100 } },
  C: { standard: { price: 800, items: 50 }, premium: { price: 1500, items: 150 } },
  D: { standard: { price: 1200, items: 50 }, premium: { price: 2500, items: 150 } },
};

export const GLOBAL_LIMITS = {
  standard: { photosPerItem: 7, videosPerItem: 1, galleryPhotos: 5, faqs: 5, activeOffers: 8, flashSalesPerMonth: 3, flashSalesConcurrent: 1 },
  premium: { photosPerItem: 15, videosPerItem: 3, galleryPhotos: 20, faqs: 20, activeOffers: null, flashSalesPerMonth: 10, flashSalesConcurrent: 5 },
};

const benefits = (planKey, items) =>
  planKey === 'standard'
    ? ['Listed in search and category pages', 'Call, WhatsApp and directions buttons', `Up to ${items} items with photos`]
    : ['Priority placement in search results', `Up to ${items} items with photos and video`, 'Unlimited offers and 10 flash sales a month'];

const features = (planKey) =>
  planKey === 'standard'
    ? { priorityRanking: false, homeFeatured: false }
    : { priorityRanking: true, homeFeatured: true };

export function planRows(categoryId, tier) {
  const t = TIER_PLANS[tier];
  return ['standard', 'premium'].map((planKey) => ({
    category_id: categoryId,
    plan_key: planKey,
    price_kes: t[planKey].price,
    items_limit: t[planKey].items,
    top_benefits: benefits(planKey, t[planKey].items),
    features: features(planKey),
    badge: planKey === 'premium' ? 'Best value' : null,
  }));
}
