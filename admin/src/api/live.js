import { supabase } from "../lib/supabase.js";
import { buildPeek } from "../lib/peek.js";
import * as businesses from "./liveBusinesses.js";

const NOT_CONFIGURED = "Supabase admin API not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable live data.";

function client() {
  if (!supabase) throw new Error(NOT_CONFIGURED);
  return supabase;
}

const fail = (error) => {
  throw Object.assign(new Error(error.message || "Request failed"), { code: error.code });
};

// Calls public.admin_search(q, scopes, lim). Resolves to { businesses, items, applications, payments, faqs } (or {} under 2 characters).
// Rejects with code "42501" when the caller is not an admin.
export async function adminSearch(term, { scopes = null, limit = 8 } = {}) {
  const { data, error } = await client().rpc("admin_search", { q: term, scopes: scopes?.length ? scopes : null, lim: limit });
  if (error) fail(error);
  return data ?? {};
}

// Explicit column lists on purpose: the peek drawer must never pull ID numbers, KRA PINs or document references off applications.
const PEEK_SOURCES = {
  business: { table: "businesses", columns: "id,name,slug,seller_id,status,plan_key,town,phone,email,owner_name,paid_until,verification_level,featured" },
  item: { table: "items", columns: "id,name,price,price_type,unit,availability,visible,hidden_by_admin,business_id,description,section", owner: true },
  application: { table: "applications", columns: "id,reference_no,business_name,owner_full_name,phone,email,status,submitted_at,payment_code" },
  payment: { table: "payments", columns: "id,mpesa_code,receipt_no,amount_kes,status,kind,business_id,submitted_at", owner: true },
  faq: { table: "faqs", columns: "id,question,answer,business_id,created_at", owner: true },
};

// Resolves one record for the peek drawer, or null when it does not exist (or is not visible to this admin).
export async function adminPeek(type, id) {
  const source = PEEK_SOURCES[type];
  if (!source) return null;
  const db = client();
  const { data, error } = await db.from(source.table).select(source.columns).eq("id", id).maybeSingle();
  if (error) fail(error);
  if (!data) return null;
  let business = null;
  if (source.owner && data.business_id) {
    const res = await db.from("businesses").select("name,slug,phone").eq("id", data.business_id).maybeSingle();
    if (res.error) fail(res.error);
    business = res.data;
  }
  return buildPeek(type, data, { business });
}

export const liveAdminApi = {
  async getAdminCounts() {
    throw new Error(NOT_CONFIGURED);
  },
  async getApplications() {
    throw new Error(NOT_CONFIGURED);
  },
  async getBusinesses() {
    throw new Error(NOT_CONFIGURED);
  },
  async getPayments() {
    throw new Error(NOT_CONFIGURED);
  },
  adminSearch,
  adminPeek,
  ...businesses,
};

export default liveAdminApi;
