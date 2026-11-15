import { supabase } from "./applications/supabaseClient";
import { EVENT_TYPES } from "@epicmkt/shared";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Live mode: one call to log_business_event. The database reads the caller's address from the request headers, hashes it with a
// daily salt and drops repeats within the hour, so nothing here sends or stores an address. Never throws.
// A buyer's tap on "Let the seller know" (log_unmet_demand). The database dedupes per buyer per day and stores only a salted hash.
export async function logUnmetDemand({ businessId, itemId, filters }) {
  if (!UUID.test(String(businessId ?? "")) || !UUID.test(String(itemId ?? "")) || !filters || typeof filters !== "object") return { ok: false };
  try {
    await supabase.rpc("log_unmet_demand", { p_shop: businessId, p_item: itemId, p_filters: filters });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function logBusinessEvent({ businessId, type, itemId = null }) {
  if (!EVENT_TYPES.includes(type) || !UUID.test(String(businessId ?? ""))) return { ok: false };
  const item = itemId && UUID.test(String(itemId)) ? itemId : null;
  try {
    await supabase.rpc("log_business_event", { p_business_id: businessId, p_type: type, p_item_id: item });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
