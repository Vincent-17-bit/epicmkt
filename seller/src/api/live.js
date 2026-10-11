import { supabase } from "./client.js";
import { sanitizeSavedViews } from "@epicmkt/shared";
import { ApiError } from "./errors.js";

const need = () => {
  if (!supabase) throw new ApiError("not_configured", "The portal is not configured.");
  return supabase;
};

const fn = async (name, body) => {
  const { data, error } = await need().functions.invoke(name, { body });
  if (error) {
    let payload = null;
    try { payload = await error.context?.json?.(); } catch { payload = null; }
    throw new ApiError(payload?.error ?? "request_failed", payload?.message, { status: error.context?.status, retryAfter: payload?.retryAfter, problems: payload?.problems });
  }
  return data;
};

const rpc = async (name, args) => {
  const { data, error } = await need().rpc(name, args);
  if (error) throw new ApiError((error.message ?? "request_failed").split(":")[0], error.message);
  return data;
};

export const login = async (sellerId, password) => {
  const { session } = await fn("seller-login", { sellerId, password });
  const { error } = await need().auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  if (error) throw new ApiError("session_failed");
  return { expiresAt: session.expires_at };
};
export const logout = async () => { await need().auth.signOut(); };
export const me = async () => {
  const client = need();
  const { data: sess } = await client.auth.getSession();
  if (!sess?.session) throw new ApiError("unauthorized");
  const { data: business, error } = await client.from("businesses").select("*").eq("user_id", sess.session.user.id).neq("status", "deleted").maybeSingle();
  if (error || !business) throw new ApiError("unauthorized");
  const catalog = await rpc("seller_catalog_stats", { p_stale_days: 90 }).catch(() => null);
  const { data: notes } = await client.from("messages").select("id, subject, body, created_at, read_at").order("created_at", { ascending: false }).limit(20);
  const { data: settings } = await client.from("seller_settings").select("*").maybeSingle();
  return {
    business: { ...business, unlisted: business.status === "pending" },
    mustChangePassword: Boolean(business.must_change_password),
    application: { stage: business.status === "pending" ? "paid" : "live", outcome: null },
    catalog,
    usage: null,
    limits: null,
    questions: [],
    notifications: (notes ?? []).map((n) => ({ id: n.id, title: n.subject ?? "Message", body: n.body, created_at: n.created_at, read: Boolean(n.read_at) })),
    settings: { idle_minutes: settings?.settings?.idle_minutes ?? 60, saved_views: sanitizeSavedViews(settings?.settings?.saved_views) }
  };
};
export const forgotRequest = (input) => fn("seller-forgot-request", typeof input === "string" ? { sellerId: input } : input);
export const forgotVerify = ({ sellerId, code, newPassword }) => fn("seller-forgot-verify", { sellerId, code, newPassword });
export const requestOtp = () => fn("seller-otp-request", { purpose: "change_password" });
export const changePassword = ({ code, newPassword }) => fn("seller-change-password", { code, newPassword });
export const updateProfile = (patch) => rpc("seller_update_profile", { p_patch: patch });
export const requestChange = (field, value) => rpc("seller_request_change", { p_field: field, p_value: value });
export const cancelChange = (id) => rpc("seller_cancel_change", { p_id: id });
export const listChanges = async () => {
  const { data, error } = await need().from("change_requests").select("*").order("created_at", { ascending: false });
  if (error) throw new ApiError("request_failed", error.message);
  return data;
};
export const confirmPrices = () => rpc("seller_confirm_prices");
export const replyFlag = (id, reply) => rpc("seller_reply_flag", { p_flag: id, p_reply: reply });
export const markRead = (ids = null) => rpc("seller_mark_read", { p_ids: ids });
export const pauseListing = (pause) => rpc("seller_pause_listing", { p_pause: pause });
export const requestDeletion = (name) => rpc("seller_request_deletion", { p_name: name });
export const catalogStats = (staleDays = 90) => rpc("seller_catalog_stats", { p_stale_days: staleDays });
export const itemSignals = () => rpc("seller_item_signals");
const MEDIA_BUCKET = "seller-media";
export const listItems = async () => {
  const client = need();
  const { data, error } = await client.from("items").select("*, item_media(kind, path, sort)").order("sort").order("created_at");
  if (error) throw new ApiError("request_failed", error.message);
  const items = (data ?? []).map((row) => {
    const first = [...(row.item_media ?? [])].filter((m) => m.kind === "image").sort((a, b) => a.sort - b.sort)[0];
    return { ...row, imageUrl: first ? client.storage.from(MEDIA_BUCKET).getPublicUrl(first.path).data.publicUrl : null };
  });
  const [signals, stats] = await Promise.all([rpc("seller_item_signals"), rpc("seller_catalog_stats", { p_stale_days: 90 })]);
  return { items, signals: signals ?? [], stats };
};
export const bulkItems = (action, ids, args = {}) => rpc("seller_bulk_items", { p_action: action, p_ids: ids, p_args: args });
export const reorderItems = (ids) => rpc("seller_reorder_items", { p_ids: ids });
export const importItems = (rows) => rpc("seller_import_items", { p_rows: rows });
export const duplicateItem = async (id) => {
  const client = need();
  const { data: src, error } = await client.from("items").select("*").eq("id", id).maybeSingle();
  if (error || !src) throw new ApiError("item_not_found");
  const { data: top } = await client.from("items").select("sort").order("sort", { ascending: false }).limit(1).maybeSingle();
  const keep = ["section", "description", "kind", "price_type", "price", "price_max", "unit", "availability", "search_tags", "variants", "badge", "track_stock", "low_stock_threshold", "show_stock_count"];
  const copy = Object.fromEntries(keep.map((k) => [k, src[k]]));
  const { data, error: insertError } = await client.from("items").insert({ ...copy, business_id: src.business_id, name: `${src.name} (copy)`.slice(0, 80), visible: false, draft: true, sort: (top?.sort ?? 0) + 1 }).select().single();
  if (insertError) throw new ApiError((insertError.message ?? "request_failed").split(":")[0] === "limit_reached" ? "limit_reached:items" : "request_failed", insertError.message);
  return data;
};
export const saveViews = (views) => rpc("seller_save_views", { p_views: views });
export const finalizeMedia = ({ itemId, path }) => fn("seller-media-finalize", { itemId, path });
export const exportData = () => fn("seller-export-data", {});
