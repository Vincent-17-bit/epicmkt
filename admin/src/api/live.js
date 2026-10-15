import { supabase } from "../lib/supabase.js";
import { normalizeCounts } from "./counts.js";

/** One RPC, role-checked in SQL (public.admin_counts). Non-admins get an empty object, which normalises to zeros. */
export async function getAdminCounts() {
  const { data, error } = await supabase.rpc("admin_counts");
  if (error) throw new Error("Could not load the admin counts.");
  return normalizeCounts(data);
}
