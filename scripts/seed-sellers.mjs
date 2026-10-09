import { createClient } from "@supabase/supabase-js";
import { activateSeller } from "./lib/activate-seller.mjs";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (process.env.APP_ENV === "production") {
  console.error("Refusing to run: APP_ENV is production.");
  process.exit(1);
}
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in scripts/.env");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

const plans = await db.from("plans").select("category_id, plan_key");
if (plans.error || !plans.data?.length) {
  console.error("No plans found. Run npm run seed first.");
  process.exit(1);
}
const categoryId = [...new Set(plans.data.map((p) => p.category_id))].find((id) =>
  ["standard", "premium"].every((k) => plans.data.some((p) => p.category_id === id && p.plan_key === k)));
if (!categoryId) {
  console.error("No category has both plans.");
  process.exit(1);
}

const samples = [
  { name: "Seed Standard Shop", planKey: "standard", phone: "+254700000001", items: ["Item one", "Item two", "Item three"] },
  { name: "Seed Premium Shop", planKey: "premium", phone: "+254700000002", items: ["Item one", "Item two", "Item three"] },
];

for (const s of samples) {
  const account = await activateSeller(db, {
    name: s.name, categoryId, planKey: s.planKey, phone: s.phone, county: "Kisumu", town: "Kisumu", address: "Test street", lat: -0.0917, lng: 34.768,
  });
  const items = await db.from("items").insert(s.items.map((name, i) => ({ business_id: account.businessId, name, price: 100 * (i + 1), sort: i })));
  if (items.error) {
    console.error(`items failed: ${items.error.message}`);
    process.exit(1);
  }
  console.log(`${s.planKey.padEnd(9)} Seller ID: ${account.sellerId}   Password: ${account.password}`);
}
console.log("Credentials are shown once and are not stored anywhere.");
