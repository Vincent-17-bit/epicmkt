// Live adapter for the Businesses list and detail pages. Every call is an RPC defined in
// supabase/migrations/0011_admin_businesses.sql and 0012_admin_business_actions.sql, which check the admin role.
import { supabase } from "../lib/supabase.js";
import { PAGE_SIZE, buildActionCall } from "../lib/businesses.js";

const NOT_CONFIGURED = "Supabase admin API not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable live data.";

function client() {
  if (!supabase) throw new Error(NOT_CONFIGURED);
  return supabase;
}

// Postgres raises short codes ("reason_required", "forbidden", ...). Keep the code so the UI can word it.
const fail = (error) => {
  throw Object.assign(new Error(error.message || "Request failed"), { code: error.code });
};

async function rpc(name, args) {
  const { data, error } = await client().rpc(name, args);
  if (error) fail(error);
  return data;
}

export async function getAdminRole() {
  const db = client();
  const { data: auth } = await db.auth.getUser();
  if (!auth?.user) return null;
  const { data, error } = await db.from("admins").select("role").eq("user_id", auth.user.id).maybeSingle();
  if (error) fail(error);
  return data?.role ?? null;
}

export async function listAgents() {
  const { data, error } = await client().from("admins").select("user_id,email,display_name,role").order("email");
  if (error) fail(error);
  return data ?? [];
}

export async function listBusinesses(list) {
  const offset = (Math.max(1, list.page ?? 1) - 1) * PAGE_SIZE;
  return rpc("admin_list_businesses", {
    p_tab: list.tab, p_q: list.q || null, p_filters: list.filters ?? {}, p_sort: list.sort, p_dir: list.dir, p_limit: PAGE_SIZE, p_offset: offset,
  });
}

export const getBusinessDetail = (id) => rpc("admin_business_detail", { p_id: id });
export const getBusinessTab = (id, tab) => rpc("admin_business_tab", { p_id: id, p_tab: tab });

export async function runBusinessAction(key, id, form) {
  const { fn, args } = buildActionCall(key, id, form);
  return rpc(fn, args);
}

// action: suspend | unsuspend | unlist | relist | feature | extend | tag | assign | message
export function bulkBusinesses(ids, action, { reason = null, args = {} } = {}) {
  return rpc("admin_bulk_businesses", { p_ids: ids, p_action: action, p_reason: reason, p_args: args });
}

export const messageBusiness = (id, { subject, body, channels }) =>
  rpc("admin_message_business", { p_id: id, p_subject: subject || null, p_body: body, p_channels: channels });

export const addBusinessNote = (id, body, pinned = false) => rpc("admin_add_business_note", { p_id: id, p_body: body, p_pinned: pinned });
export const setBusinessNotePinned = (noteId, pinned) => rpc("admin_set_business_note_pinned", { p_note_id: noteId, p_pinned: pinned });
export const deleteBusinessNote = (noteId) => rpc("admin_delete_business_note", { p_note_id: noteId });
