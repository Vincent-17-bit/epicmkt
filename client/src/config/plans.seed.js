export const TIER_PLANS = {
  A: { standard: { price: 300, items: 15 }, premium: { price: 800, items: 40 } },
  B: { standard: { price: 500, items: 25 }, premium: { price: 1300, items: 70 } },
  C: { standard: { price: 800, items: 40 }, premium: { price: 2000, items: 100 } },
  D: { standard: { price: 1200, items: 50 }, premium: { price: 3000, items: 150 } },
};

export const GLOBAL_LIMITS = {
  standard: { photosPerItem: 7, videosPerItem: 1, galleryPhotos: 5, faqs: 5, activeOffers: 8, flashSalesPerMonth: 3, flashSalesConcurrent: 1 },
  premium: { photosPerItem: 15, videosPerItem: 3, galleryPhotos: 20, faqs: 20, activeOffers: null, flashSalesPerMonth: 10, flashSalesConcurrent: 5 },
};

const CATEGORY_BENEFITS = {
  'water-refill': [['Delivery area and per-litre prices shown', 'Call and WhatsApp to order refills', 'Treatment type and container options listed'], ['Featured shop ranked first for water', 'Delivery area and per-litre prices shown', 'Announcement banner for new deliveries']],
  'lpg-gas': [['Brands and cylinder sizes listed', 'Refill and new cylinder prices shown', 'Delivery area and open hours shown'], ['Featured shop ranked first for gas', 'Brands and cylinder prices highlighted', 'Banner for refill offers and deliveries']],
  'bakery': [['Product types and custom cakes shown', 'Order lead time and delivery listed', 'Photos of your bakes on every item'], ['Featured bakery ranked first in search', 'More photos and video for custom cakes', 'Flash sales on fresh bakes, up to 10 a month']],
  'juice-shop': [['Menu, sizes and prices listed', 'No-added-sugar options highlighted', 'Delivery and opening hours shown'], ['Featured juice shop ranked first', 'Menu photos and video for every drink', 'Flash sales on combos, up to 10 a month']],
  'restaurant-cafe': [['Cuisine, seats and menu listed', 'Dine-in, takeaway and delivery shown', 'Reservations and halal options marked'], ['Featured restaurant ranked first', 'Menu photos and video for dishes', 'Branches and weekly specials promoted']],
  'butchery': [['Meat types, cuts and price per kg', 'Halal and delivery options shown', 'Call and WhatsApp to order'], ['Featured butchery ranked first in search', 'Daily price changes in bulk', 'Banner for fresh stock and offers']],
  'greengrocer': [['Produce and price per kg listed', 'Locally sourced produce marked', 'Delivery and opening hours shown'], ['Featured greengrocer ranked first', 'Bulk price updates in seconds', 'Banner for seasonal produce and offers']],
  'supermarket-minimart': [['Departments and payment methods listed', 'Delivery and late opening shown', 'Call, WhatsApp and directions buttons'], ['Featured store ranked first in search', 'CSV import for your whole shelf', 'Multiple branches under one listing']],
  'chemist': [['Dosage forms and strengths listed', 'Prescription-only items clearly marked', '24-hour opening and delivery shown'], ['Featured chemist ranked first for health', 'CSV import for your full stock list', 'Branches and priority review support']],
  'clinic': [['Services and specialties listed', 'Insurance accepted shown up front', 'Emergency and lab services marked'], ['Featured clinic ranked first in search', 'Team profiles and clinic timetable', 'Branches and priority review support']],
  'optician': [['Eye tests, frames and lenses listed', 'Frame brands and insurance shown', 'Call and directions buttons'], ['Featured optician ranked first in search', 'Photos of frames in every collection', 'Announcement banner for eye test offers']],
  'barbershop': [['Services and prices listed', 'Walk-ins and appointments shown', 'Kids cuts marked'], ['Featured barbershop ranked first', 'Team and timetable for every barber', 'Gallery of your best cuts, 20 photos']],
  'salon-beauty': [['Services and prices listed', 'Home service and appointments shown', 'Staff and opening hours listed'], ['Featured salon ranked first in search', 'Team and timetable for every stylist', 'Gallery of your best work, 20 photos']],
  'spa-massage': [['Treatments and durations listed', 'Women-only and couples options marked', 'Call and WhatsApp to book'], ['Featured spa ranked first in search', 'Team and timetable for therapists', 'Banner for packages and seasonal offers']],
  'gym-fitness': [['Membership terms and classes listed', 'Equipment, showers and lockers shown', 'Trainer availability and hours shown'], ['Featured gym ranked first in search', 'Team and class timetable', 'Branches and banner for join offers']],
  'agrovet': [['Seeds, fertiliser and vet drugs listed', 'Brands and pack sizes shown', 'Farming advice offered, marked'], ['Featured agrovet ranked first in search', 'CSV import for your full stock list', 'Banner for seasonal planting offers']],
  'cyber-cafe': [['Services and rate per hour listed', 'Printing, scanning and Wi-Fi shown', 'Number of computers listed'], ['Featured cyber cafe ranked first', 'Photos of your setup and services', 'Banner for student and bulk offers']],
  'phone-repair': [['Repairs and brands you handle listed', 'Warranty and turnaround shown', 'Accessories listed with prices'], ['Featured repair shop ranked first', 'Photos and video of your repairs', 'Flash sales on accessories, 10 a month']],
  'electronics-appliances': [['Brands and warranty listed', 'New or refurbished clearly marked', 'Installation and delivery shown'], ['Featured shop ranked first in search', 'CSV import for your full catalogue', 'Flash sales on deals, up to 10 a month']],
  'printing-stationery': [['Services and bulk orders listed', 'Same-day and design help shown', 'Call and WhatsApp to order'], ['Featured print shop ranked first', 'Sample photos and video of your work', 'Banner for bulk and school offers']],
  'mpesa-airtime-agent': [['Services and opening hours listed', 'Late opening and banking agent shown', 'Directions and call buttons'], ['Featured agent ranked first in search', 'Branches under one listing', 'Banner for extended hours and services']],
  'hardware-building': [['Material categories listed', 'Delivery and bulk orders shown', 'Cutting service marked'], ['Featured hardware ranked first in search', 'CSV import and bulk price change', 'Flash sales on cement and tools']],
  'plumbing-electrical': [['Services and call-out fee listed', 'Emergency 24h service marked', 'Service area shown'], ['Featured contractor ranked first', 'Photos and video of finished jobs', 'Team and timetable for call-outs']],
  'furniture-carpentry': [['Furniture types and materials listed', 'Custom-made orders marked', 'Delivery shown'], ['Featured workshop ranked first in search', 'Photos and video of finished pieces', 'Banner for custom orders and offers']],
  'cleaning-laundry': [['Services and price per kg listed', 'Pickup and delivery shown', 'Turnaround time listed'], ['Featured service ranked first in search', 'Team and pickup timetable', 'Banner for weekly and bulk offers']],
  'tailor-boutique': [['Tailoring and alterations listed', 'Ready-made items shown', 'Turnaround time listed'], ['Featured boutique ranked first in search', 'Photos and video of your designs', 'Flash sales on new collections']],
  'shoes-cobbler': [['Repairs and new shoes listed', 'Brands you stock shown', 'Call and directions buttons'], ['Featured shop ranked first in search', 'Before and after photos of repairs', 'Banner for repair offers']],
  'garage-mechanic': [['Services and vehicle types listed', 'Towing and diagnostics marked', 'Call, WhatsApp and directions'], ['Featured garage ranked first in search', 'Photos and video of your workshop', 'Team and booking timetable']],
  'car-wash': [['Wash types and vehicle sizes listed', 'Mobile service marked', 'Opening hours and directions shown'], ['Featured car wash ranked first', 'Before and after photos and video', 'Banner for package and loyalty offers']],
  'auto-spare-parts': [['Brands and vehicle makes listed', 'Genuine or aftermarket marked', 'Delivery shown'], ['Featured parts shop ranked first', 'CSV import for your parts catalogue', 'Flash sales on fast-moving parts']],
  'photography-events': [['Services and packages listed', 'Coverage area shown', 'Photo delivery time listed'], ['Featured photographer ranked first', 'Portfolio gallery with 20 photos', 'Banner for event season bookings']],
  'tuition-daycare': [['Levels, ages and fees per term', 'Transport and meals shown', 'Call and directions buttons'], ['Featured school ranked first in search', 'Gallery of classrooms and activities', 'Banner for enrolment periods']],
};

const FEATURES = {
  standard: {
    Visibility: ['Listed in search and category pages', 'Call, WhatsApp and directions buttons', 'Opening hours, partial and temporary closure'],
    Catalog: ['Manual item entry', 'Up to {items} items', 'Up to {photos} photos and {videos} video per item', 'Shop gallery of {gallery} photos', 'Up to {faqs} FAQs'],
    Promotions: ['Up to {offers} active offers', '{flash} flash sales a month, 1 at a time'],
    Tools: ['Basic totals', 'Plain QR poster'],
    Support: ['Standard review and support'],
  },
  premium: {
    Visibility: ['Featured badge on shop card and business page', 'Priority placement in category lists and search', 'Eligible for the homepage Featured shops carousel', 'Premium label on your account', 'Opening hours, partial and temporary closure'],
    Catalog: ['Manual item entry and bulk import', 'Up to {items} items', 'Up to {photos} photos and {videos} videos per item', 'Shop gallery of {gallery} photos', 'Up to {faqs} FAQs'],
    Promotions: ['Unlimited active offers, schedule ahead', '{flash} flash sales a month, several at once', 'Announcement banner'],
    Tools: ['CSV and Excel import', 'Bulk price change', 'Team and timetable', 'Multiple branches', 'Branded QR poster in A4 and A5'],
    Support: ['Priority review and support'],
  },
};

const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, k) => vars[k]);

function features(planKey, items) {
  const g = GLOBAL_LIMITS[planKey];
  const vars = { items, photos: g.photosPerItem, videos: g.videosPerItem, gallery: g.galleryPhotos, faqs: g.faqs, offers: g.activeOffers, flash: g.flashSalesPerMonth };
  return Object.fromEntries(Object.entries(FEATURES[planKey]).map(([group, list]) => [group, list.map((t) => fill(t, vars))]));
}

export function planRows(categoryId, tier) {
  const t = TIER_PLANS[tier];
  const [standard, premium] = CATEGORY_BENEFITS[categoryId];
  return [['standard', standard], ['premium', premium]].map(([planKey, benefits]) => ({
    category_id: categoryId,
    plan_key: planKey,
    price_kes: t[planKey].price,
    items_limit: t[planKey].items,
    top_benefits: benefits,
    features: features(planKey, t[planKey].items),
    badge: planKey === 'premium' ? 'Best value' : null,
  }));
}
