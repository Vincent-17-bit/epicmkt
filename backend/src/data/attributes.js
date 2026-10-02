import { galleryArt } from "./art.js";

const pay = {
  cm: ["cash", "mpesa"],
  cma: ["cash", "mpesa", "airtel"],
  cmc: ["cash", "mpesa", "card"]
};

export const attributesById = {
  b_001: { booking: "both", chairs: 4, "kids-cuts": true, "beard-grooming": true, dreadlocks: false, amenities: ["waiting-area", "tv", "wifi", "charging"], specialty: "Skin fades and sharp line-ups", payment: pay.cm },
  b_002: { booking: "walk-in", chairs: 3, "kids-cuts": false, "beard-grooming": true, dreadlocks: true, amenities: ["tv"], payment: pay.cm },
  b_003: { booking: "appointment", chairs: 5, "kids-cuts": false, "beard-grooming": true, dreadlocks: false, amenities: ["waiting-area", "wifi", "ac"], specialty: "Hot towel shaves", payment: pay.cmc },

  b_004: { "water-type": "purified", "price-20l": 30, "container-sizes": ["10l", "20l"], jerrycans: true, "quality-tested": true, bowser: false, delivery: true, "delivery-fee": 50, "delivery-radius": 3, payment: pay.cm },
  b_005: { "water-type": "purified", "price-20l": 40, "container-sizes": ["5l", "20l", "bulk"], jerrycans: true, "quality-tested": true, bowser: true, delivery: true, "delivery-fee": 100, "delivery-radius": 8, payment: pay.cma },
  b_006: { "water-type": "borehole", "price-20l": 25, "container-sizes": ["20l"], jerrycans: false, "quality-tested": false, bowser: false, delivery: false, payment: ["cash"] },

  b_007: { prescriptions: true, pharmacist: true, licence: "PPB/RET/2041", stocks: ["prescription", "otc", "baby", "equipment"], clinic: true, "health-services": ["bp", "glucose"], insurance: ["sha", "private"], "open-24h": false, delivery: true, "delivery-fee": 100, "delivery-radius": 5, payment: pay.cmc },
  b_008: { prescriptions: true, pharmacist: true, stocks: ["prescription", "otc"], clinic: false, "open-24h": false, delivery: false, payment: pay.cm },
  b_009: { prescriptions: true, pharmacist: true, stocks: ["prescription", "otc", "cosmetics"], clinic: true, "health-services": ["bp", "vaccines"], insurance: ["sha"], "open-24h": false, delivery: false, payment: pay.cm },

  b_010: { sells: ["seeds", "fertilizer", "feeds", "animal-drugs"], brands: "Kenya Seed, Unga Farm Care, Pembe", "vet-services": true, agronomist: true, bulk: true, credit: true, delivery: true, "delivery-fee": 200, "delivery-radius": 15, payment: pay.cm },
  b_011: { sells: ["feeds", "tools"], "vet-services": false, agronomist: false, bulk: false, credit: false, delivery: false, payment: pay.cm },
  b_012: { sells: ["seeds", "fertilizer", "pesticides"], "vet-services": true, agronomist: true, bulk: true, credit: false, delivery: false, payment: pay.cm },

  b_013: { audience: "mixed", equipment: ["free-weights", "machines", "cardio", "boxing"], classes: ["aerobics", "spinning", "boxing"], trainers: true, showers: true, lockers: true, parking: true, "day-pass": true, rules: "Bring a towel and a padlock. Joining fee is waived on the first Monday of every month.", payment: pay.cmc },
  b_014: { audience: "mixed", equipment: ["free-weights", "machines"], classes: [], trainers: false, showers: true, lockers: false, parking: false, "day-pass": true, payment: pay.cm },
  b_015: { audience: "women", equipment: ["machines", "cardio"], classes: ["yoga", "zumba", "aerobics"], trainers: true, showers: true, lockers: true, parking: true, "day-pass": true, payment: pay.cm },

  b_016: { clientele: "women", braiding: false, nails: true, "hair-services": ["relaxing", "dye"], "beauty-services": ["makeup", "lashes"], bridal: false, "home-service": false, booking: "both", payment: pay.cm },
  b_017: { clientele: "women", braiding: true, nails: false, "hair-services": ["wigs", "weaving", "natural", "kids"], bridal: true, "booking-link": "https://crownbraids.example/book", "home-service": true, booking: "appointment", payment: pay.cmc },

  b_018: { vehicles: "all", welding: true, towing: true },
  b_019: { vehicles: "cars", welding: true, towing: false },

  b_020: { sells: ["cement", "iron-sheets", "paint", "plumbing", "tools"], brands: "Bamburi, Mabati Rolling Mills, Crown", "tool-hire": false, cutting: true, bulk: true, credit: true, terms: "Delivery is free for orders above KSh 20,000 within town. Contractors can open a credit account after two cash orders.", delivery: true, "delivery-fee": 500, "delivery-radius": 20, payment: pay.cm },

  b_021: { cuisine: ["kenyan"], "meal-times": ["breakfast", "lunch"], "average-meal": 250, takeaway: true, "dine-in": true, halal: false, "vegetarian-options": true, seats: 40, reservations: false, outdoor: false, "menu-photo": galleryArt(5, "Menu board"), menu: [{ name: "Ugali and fish", price: 350 }, { name: "Chapati and beans", price: 120 }, { name: "Githeri", price: 150 }, { name: "Chai", price: 50 }], delivery: false, payment: pay.cm },
  b_022: { cuisine: ["swahili", "kenyan"], "meal-times": ["lunch", "dinner"], "average-meal": 650, takeaway: true, "dine-in": true, halal: true, "vegetarian-options": true, seats: 60, reservations: true, outdoor: true, "menu-link": "https://swahiliplate.example/menu", "menu-photo": galleryArt(15, "Menu board"), menu: [{ name: "Chicken biryani", price: 600 }, { name: "Samaki wa kupaka", price: 750 }, { name: "Coconut rice", price: 300 }, { name: "Fresh passion juice", price: 150 }], delivery: true, "delivery-fee": 150, "delivery-radius": 6, payment: pay.cmc },

  b_023: { devices: "phones", "same-day": true, warranty: true },
  b_024: { prescriptions: true, stocks: ["prescription", "otc"], clinic: false, delivery: false, payment: ["cash"] },

  b_025: { vehicles: ["cars", "suvs", "matatus"], "wash-types": ["exterior", "interior", "full", "engine", "polish"], "mobile-wash": true, "starting-price": 200, bays: 3, booking: "both", "waiting-area": true, shaded: true, payment: pay.cm },
  b_026: { vehicles: ["cars", "suvs", "trucks"], "wash-types": ["exterior", "interior", "full", "underbody", "upholstery", "polish"], "mobile-wash": false, "starting-price": 300, bays: 5, booking: "appointment", "waiting-area": true, shaded: true, payment: pay.cmc },

  b_027: { "shop-type": "tailor", for: ["women", "men", "kids"], custom: true, alterations: true, specialties: ["suits", "african-print", "uniforms", "wedding"], turnaround: 5, fitting: true, delivery: true, "delivery-fee": 150, "delivery-radius": 10, payment: pay.cm },
  b_028: { "shop-type": "boutique", condition: "mitumba", for: ["women", "kids"], alterations: true, fitting: true, delivery: false, payment: pay.cm },

  b_029: { networks: ["mpesa", "airtel"], "agent-number": "612345", "till-number": "5123456", services: ["deposit", "withdraw", "airtime", "bills", "send"], extras: ["printing", "photocopy"], "open-24h": false, "high-float": true },
  b_030: { networks: ["mpesa", "airtel", "tkash"], "agent-number": "745678", services: ["deposit", "withdraw", "airtime", "bills", "bank", "tokens"], banks: ["equity", "kcb", "coop"], extras: ["passport-photos", "ecitizen"], "open-24h": true, "high-float": true },

  b_031: { "shop-type": "stall", sells: ["fruit", "vegetables", "eggs"], "farm-fresh": true, wholesale: false, "price-board": [{ name: "Tomatoes (kg)", price: 80 }, { name: "Sukuma wiki (bunch)", price: 20 }, { name: "Onions (kg)", price: 100 }, { name: "Bananas (bunch)", price: 150 }], delivery: true, "delivery-fee": 50, "delivery-radius": 3, "min-order": 300, payment: pay.cm },
  b_032: { "shop-type": "mini", sells: ["fruit", "vegetables", "cereals", "dairy", "bread", "household", "drinks"], "farm-fresh": false, wholesale: true, "price-board": [{ name: "Maize flour 2kg", price: 190 }, { name: "Fresh milk 500ml", price: 65 }, { name: "Bread 400g", price: 65 }], delivery: true, "delivery-fee": 100, "delivery-radius": 5, "min-order": 500, payment: pay.cmc },

  b_033: { meats: ["beef", "goat", "offals"], halal: false, "cut-to-order": true, mincing: true, refrigerated: true, "health-licence": true, "nyama-choma": true, events: true, "price-board": [{ name: "Beef with bone (kg)", price: 600 }, { name: "Beef fillet (kg)", price: 800 }, { name: "Goat meat (kg)", price: 750 }, { name: "Matumbo (kg)", price: 450 }], delivery: true, "delivery-fee": 100, "delivery-radius": 6, payment: pay.cm },
  b_034: { meats: ["beef", "chicken", "pork", "sausages"], halal: false, "cut-to-order": true, mincing: true, refrigerated: true, "health-licence": true, "nyama-choma": false, events: false, "price-board": [{ name: "Beef (kg)", price: 650 }, { name: "Pork (kg)", price: 600 }, { name: "Chicken (whole)", price: 900 }], delivery: false, payment: pay.cmc },

  b_035: { products: ["bread", "cakes", "cupcakes", "pastries", "mandazi"], "custom-cakes": true, notice: 3, "order-notes": "Send the cake size, flavour, date and a reference picture on WhatsApp. We confirm the price and take a 50% deposit by M-PESA.", dietary: ["eggless", "sugar-free"], "fresh-bread": ["06:00", "08:30"], wholesale: true, "cake-prices": [{ name: "1 kg vanilla cake", price: 1800 }, { name: "2 kg fruit cake", price: 3200 }, { name: "Wedding cake (3 tier)", price: 12000 }], delivery: true, "delivery-fee": 200, "delivery-radius": 12, payment: pay.cmc },
  b_036: { products: ["cakes", "cupcakes", "cookies"], "custom-cakes": true, notice: 2, dietary: ["vegan", "gluten-free"], wholesale: false, "cake-prices": [{ name: "Dozen cupcakes", price: 1500 }, { name: "1 kg chocolate cake", price: 2200 }], delivery: true, "delivery-fee": 250, "delivery-radius": 10, payment: pay.cmc }
};
