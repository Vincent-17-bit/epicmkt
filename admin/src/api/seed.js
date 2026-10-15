// Deterministic demo data for mock mode. Dates are relative to `now` so "expiring this week" and
// "waiting" counts stay meaningful whenever the mock is first opened. Business names are invented.

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const uuid = (prefix, n) => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const iso = (ms) => new Date(ms).toISOString();

const TOWNS = [
  ["Nairobi", "Nairobi"],
  ["Kisumu", "Kisumu"],
  ["Mombasa", "Mombasa"],
  ["Nakuru", "Nakuru"],
  ["Eldoret", "Uasin Gishu"],
  ["Maseno", "Kisumu"],
  ["Kisii", "Kisii"],
  ["Thika", "Kiambu"],
];
const CATEGORIES = ["groceries", "hardware", "restaurants", "salons", "pharmacies", "electronics"];

const BUSINESS_NAMES = [
  "Savannah Fresh Mart",
  "Lakeview Hardware",
  "Mama Njeri Kitchen",
  "Glow Studio Salon",
  "CarePlus Pharmacy",
  "Circuit Corner Electronics",
  "Baobab Groceries",
  "Ridge Tools & Supplies",
  "Pilau Palace",
  "Crown Cuts Barbers",
  "Afya Bora Chemist",
  "Volt Mobile Hub",
  "Green Basket Market",
  "Anvil Builders Depot",
  "Chapati Corner",
  "Elegance Beauty Bar",
  "Wellspring Pharmacy",
  "ByteBay Computers",
  "Harvest Gate Foods",
  "Boma Hardware",
  "Mtaani Eatery",
  "Silk & Shine Salon",
  "Neema Drugstore",
  "Pixel Point Electronics",
];

const OWNERS = [
  "Alice Njeri",
  "John Ouma",
  "Mary Wambui",
  "Peter Kiprop",
  "Grace Atieno",
  "Samuel Mwangi",
  "Faith Chebet",
  "David Otieno",
];

// Status plan for the 24 businesses: 16 live, 2 paused, 1 suspended, 2 expired, 3 pending.
const BUSINESS_STATUS = [
  "live", "live", "live", "live", "live", "live", "live", "live",
  "live", "live", "live", "live", "live", "live", "live", "live",
  "paused", "paused", "suspended", "expired", "expired", "pending", "pending", "pending",
];

// Days from now until paid_until for live businesses. Five of them fall inside the next 7 days.
const PAID_UNTIL_DAYS = [3, 25, 41, 6, 58, 12, 2, 33, 19, 5, 67, 28, 45, 1, 22, 38];

const APPLICATION_STATUS = [
  "submitted", "submitted", "submitted", "under_review", "under_review", "changes_requested",
  "approved", "payment_confirming", "payment_confirming", "activated", "rejected", "uploading",
];

export const SEED_VERSION = 1;

export function buildSeed(now = Date.now()) {
  const businesses = BUSINESS_NAMES.map((name, i) => {
    const status = BUSINESS_STATUS[i];
    const [town, county] = TOWNS[i % TOWNS.length];
    let paidUntil = null;
    if (status === "live") paidUntil = iso(now + PAID_UNTIL_DAYS[i] * DAY);
    else if (status === "paused" || status === "suspended") paidUntil = iso(now + (10 + i) * DAY);
    else if (status === "expired") paidUntil = iso(now - (3 + i) * DAY);
    return {
      id: uuid("b0000000", i + 1),
      seller_id: `ES${100001 + i}`,
      slug: name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      name,
      status,
      plan_key: i % 3 === 0 ? "premium" : "standard",
      category_id: CATEGORIES[i % CATEGORIES.length],
      county,
      town,
      phone: `+2547000000${String(i + 10).padStart(2, "0")}`,
      featured: i % 8 === 0,
      verification_level: i % 4 === 0 ? "verified" : "unverified",
      paid_until: paidUntil,
      created_at: iso(now - (200 - i * 6) * DAY),
    };
  });

  const applications = APPLICATION_STATUS.map((status, i) => {
    const [town, county] = TOWNS[(i + 3) % TOWNS.length];
    const submitted = status === "uploading" ? null : iso(now - (i * 7 + 2) * HOUR);
    return {
      id: uuid("a0000000", i + 1),
      reference_no: `EPM-2026-${["K7M2QX", "R4TW9B", "H8NC3D", "Z2PV6F", "M5GJ8L", "X9QA4S", "C3WE7T", "B6KD2H", "N8RF5Y", "T4LM9P", "V7HX3C", "D2SB6J"][i]}`,
      status,
      verification_level: i % 3 === 0 ? "verified" : "unverified",
      completeness_hint: i % 2 === 0 ? "complete" : "basic",
      category_id: CATEGORIES[(i + 2) % CATEGORIES.length],
      plan_key: i % 2 === 0 ? "standard" : "premium",
      price_at_submission: i % 2 === 0 ? 2500 : 4500,
      owner_full_name: OWNERS[i % OWNERS.length],
      owner_id_type: "national_id",
      owner_id_number: `3${String(1000000 + i * 137).padStart(7, "0")}`,
      phone: `+2547111100${String(i + 10).padStart(2, "0")}`,
      alt_phone: null,
      email: `owner${i + 1}@example.test`,
      business_name: ["Kijani Greens", "Pwani Tools", "Mama Otis Cafe", "Zuri Salon", "AfyaLink Chemist", "Techno Nest", "Soko Fresh", "Jenga Hardware", "Tamu Bites", "Urembo Lounge", "Dawa Mart", "Gadget Garage"][i],
      registered: i % 3 !== 2,
      reg_type: i % 3 !== 2 ? "sole_proprietor" : null,
      reg_number: i % 3 !== 2 ? `BN/2020/${1000 + i}` : null,
      year_established: 2015 + (i % 9),
      kra_pin: `A00${1234567 + i}Z`,
      sbp_number: `SBP-${20000 + i}`,
      sbp_expiry: iso(now + (120 + i) * DAY).slice(0, 10),
      short_description: null,
      county,
      town,
      address: `Plot ${10 + i}, Main Street`,
      lat: -1.28 - i * 0.01,
      lng: 36.82 + i * 0.01,
      business_phones: [],
      whatsapp: `+2547111100${String(i + 10).padStart(2, "0")}`,
      website: null,
      socials: {},
      admin_note: status === "changes_requested" ? "SBP photo is blurry. Ask for a clearer scan." : null,
      rejection_reason: status === "rejected" ? "Documents do not match the business name." : null,
      payment_code: status === "payment_confirming" ? `QK${700000 + i}XZ` : null,
      seller_id: status === "activated" ? "ES100001" : null,
      submitted_at: submitted,
      created_at: iso(now - (i * 7 + 6) * HOUR),
      updated_at: iso(now - (i * 7 + 1) * HOUR),
    };
  });

  // Twenty payments across the live businesses, newest first by index.
  const payments = Array.from({ length: 20 }, (_, i) => {
    const business = businesses[i % 16];
    const premium = business.plan_key === "premium";
    const createdMs = now - (i * 2 + 1) * DAY;
    return {
      id: uuid("c0000000", i + 1),
      business_id: business.id,
      amount_kes: premium ? 4500 : 2500,
      method: "mpesa",
      reference: `QK${800000 + i * 17}AB`,
      period_start: iso(createdMs).slice(0, 10),
      period_end: iso(createdMs + 30 * DAY).slice(0, 10),
      created_at: iso(createdMs),
    };
  });

  return { version: SEED_VERSION, seededAt: iso(now), businesses, applications, payments };
}
