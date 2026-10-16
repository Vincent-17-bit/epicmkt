// Demo applications for mock mode (VITE_SUPABASE_URL empty). Same row shape as the live query in live.js.
// Deterministic, so reloads and screenshots match. Times are relative to "now", so the SLA column always has a
// spread of on time, due soon and overdue rows.

const HOUR = 3_600_000;
const pseudo = (seed) => { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); };
const pick = (list, seed) => list[Math.floor(pseudo(seed) * list.length) % list.length];

export const MOCK_CATEGORIES = [
  ["barbershops", "Barbershops"], ["water-refill", "Water Refill Points"], ["chemists", "Chemists"], ["agrovets", "Agrovets"],
  ["gyms", "Gyms"], ["car-wash", "Car Wash"], ["salons", "Salons"], ["tailors", "Tailors and Boutiques"], ["hardware", "Hardware"],
  ["mpesa", "M-PESA and Mobile Money"], ["groceries", "Groceries and Mboga"], ["butchery", "Butcheries"], ["eateries", "Eateries"],
  ["bakery", "Bakeries"], ["mechanics", "Mechanics"], ["phone-repair", "Phone Repair"],
].map(([id, name]) => ({ id, name }));

export const MOCK_REVIEWERS = [
  { id: "mock-owner@epicmkt.test", name: "Owner (mock)", email: "owner@epicmkt.test", role: "owner" },
  { id: "mock-reviewer@epicmkt.test", name: "Reviewer (mock)", email: "reviewer@epicmkt.test", role: "reviewer" },
  { id: "5b1f0c2e-7a64-4d0b-9c1e-0a1b2c3d4e01", name: "Amina Wanjiru", email: "amina@epicmkt.test", role: "reviewer" },
  { id: "5b1f0c2e-7a64-4d0b-9c1e-0a1b2c3d4e02", name: "Peter Otieno", email: "peter@epicmkt.test", role: "reviewer" },
];

const FIRST = ["Mara", "Zuri", "Karibu", "Umoja", "Pwani", "Imani", "Neema", "Tumaini", "Safari", "Jua Kali", "Baraka", "Upendo", "Amani", "Harambee", "Kilimo", "Lake View", "Rift", "Savanna", "Mbuzi", "Twiga"];
const KIND = ["Fresh Mart", "Studio", "Corner", "Hardware", "Pharmacy", "Cuts", "Wash", "Gym", "Bakery", "Mechanics", "Express", "Plaza", "Foods", "Works", "House", "Centre"];
const GIVEN = ["Amina", "Joy", "Brian", "Faith", "Kevin", "Grace", "Otieno", "Wanjiru", "Mercy", "Peter", "Achieng", "Kamau", "Naliaka", "Barasa", "Chebet", "Mwangi"];
const FAMILY = ["Odhiambo", "Kariuki", "Njoroge", "Wekesa", "Mutiso", "Kiplagat", "Atieno", "Ochieng", "Wafula", "Cheruiyot", "Mohamed", "Achola"];
const TOWNS = [["Kisumu", "Kisumu"], ["Nairobi", "Nairobi"], ["Mombasa", "Mombasa"], ["Nakuru", "Nakuru"], ["Eldoret", "Uasin Gishu"], ["Kakamega", "Kakamega"], ["Maseno", "Kisumu"], ["Kisii", "Kisii"], ["Thika", "Kiambu"]];

// How many of each status, and how long ago each was submitted (hours). Submitted ones are spread across the SLA bands.
const PLAN = [
  ["submitted", 38, 0.2, 52], ["under_review", 12, 4, 80], ["changes_requested", 7, 10, 120],
  ["approved", 9, 20, 160], ["payment_confirming", 4, 6, 60], ["activated", 60, 100, 1400], ["rejected", 14, 60, 1200],
];

let seq = 0;
export function makeApplication({ status, hoursAgo, reviewer = null, seed = ++seq, now = Date.now() }) {
  const [town, county] = pick(TOWNS, seed + 5);
  const category = pick(MOCK_CATEGORIES, seed + 9);
  const plan = pseudo(seed + 3) > 0.7 ? "premium" : "standard";
  const owner = `${pick(GIVEN, seed + 1)} ${pick(FAMILY, seed + 2)}`;
  const submittedAt = new Date(now - hoursAgo * HOUR);
  const reviewStarted = status === "submitted" ? null : new Date(submittedAt.getTime() + Math.min(hoursAgo * 0.4, 6 + pseudo(seed + 8) * 30) * HOUR);
  const phoneTail = String(100000000 + Math.floor(pseudo(seed + 7) * 899999999)).slice(0, 9);
  return {
    id: `mock-app-${seed}`,
    reference_no: `EPM-2026-${String(400 + seed).padStart(4, "0")}`,
    status,
    business_name: `${pick(FIRST, seed + 4)} ${pick(KIND, seed + 6)}`,
    owner_full_name: owner,
    phone: `+254${phoneTail}`,
    county, town,
    category_id: category.id, category_name: category.name,
    plan_key: plan, price_at_submission: plan === "premium" ? 1500 : 500,
    verification_level: pseudo(seed + 11) > 0.6 ? "verified" : "unverified",
    completeness_hint: pseudo(seed + 12) > 0.3 ? "complete" : "basic",
    registered: pseudo(seed + 13) > 0.4,
    submitted_at: submittedAt.toISOString(),
    review_started_at: reviewStarted ? reviewStarted.toISOString() : null,
    reviewer_id: reviewer,
    updated_at: new Date(now - Math.max(0.05, hoursAgo * 0.2) * HOUR).toISOString(),
  };
}

export function seedApplications(now = Date.now()) {
  const rows = [];
  for (const [status, count, from, to] of PLAN) {
    for (let i = 0; i < count; i += 1) {
      const hoursAgo = from + (to - from) * pseudo(rows.length * 3 + 17) ** 1.4;
      const reviewer = status === "submitted"
        ? (pseudo(rows.length + 40) > 0.78 ? MOCK_REVIEWERS[1 + (rows.length % 3)].id : null)
        : ["approved", "payment_confirming", "activated", "rejected", "under_review", "changes_requested"].includes(status) ? MOCK_REVIEWERS[(rows.length % 3) + 1].id : null;
      rows.push(makeApplication({ status, hoursAgo, reviewer, now }));
    }
  }
  return rows;
}
