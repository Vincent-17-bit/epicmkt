import { supabase } from "./client.js";
import { itemToRow, rowToItem, isItemLimitMessage } from "@epicmkt/shared";
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

// Database errors become stable app codes. limit_reached:items is the plan limit; the app calls it item_limit_reached.
export const fromDb = (error) => {
  const message = error.message ?? "request_failed";
  if (isItemLimitMessage(message)) return new ApiError("item_limit_reached", "You have reached the item limit for your plan.");
  if (/admin_columns_protected/.test(message)) return new ApiError("admin_columns_protected", message);
  if (error.code === "23514") return new ApiError("invalid_value", message);
  if (error.code === "23505") return new ApiError("already_exists", message);
  if (error.code === "42501" || /row-level security/.test(message)) return new ApiError("not_allowed", message);
  return new ApiError(message.split(":")[0], message);
};

const rpc = async (name, args) => {
  const { data, error } = await need().rpc(name, args);
  if (error) throw fromDb(error);
  return data;
};

export const login = async (sellerId, password) => {
  const { session } = await fn("seller-login", { sellerId, password });
  const { error } = await need().auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  if (error) throw new ApiError("session_failed");
  return { expiresAt: session.expires_at };
};
export const logout = async () => { await need().auth.signOut(); };
export const forgotRequest = (sellerId) => fn("seller-forgot-request", { sellerId });
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
export const finalizeMedia = ({ itemId, path }) => fn("seller-media-finalize", { itemId, path });
export const exportData = () => fn("seller-export-data", {});

let cachedBusiness = null;
const myBusiness = async () => {
  if (cachedBusiness) return cachedBusiness;
  const { data, error } = await need().from("businesses").select("id,name,category_id,plan_key,status").limit(1).maybeSingle();
  if (error) throw fromDb(error);
  if (!data) throw new ApiError("not_a_seller");
  cachedBusiness = data;
  return data;
};

export const getCatalogContext = async () => {
  const b = await myBusiness();
  const [{ data: cat, error: catError }, stats] = await Promise.all([
    need().from("categories").select("id,name,item_template").eq("id", b.category_id).maybeSingle(),
    catalogStats(),
  ]);
  if (catError) throw fromDb(catError);
  return {
    business: { id: b.id, name: b.name, categoryId: b.category_id, planKey: b.plan_key, status: b.status },
    category: { id: b.category_id, name: cat?.name ?? b.category_id, itemFields: cat?.item_template ?? [] },
    itemsLimit: stats?.items_limit ?? null,
  };
};

export const listItems = async () => {
  const { data, error } = await need().from("items").select("*").order("sort", { ascending: true }).order("created_at", { ascending: true });
  if (error) throw fromDb(error);
  return data.map(rowToItem);
};

// The client picks the id so autosave can address the row before the first response returns.
export const createItem = async (item) => {
  const b = await myBusiness();
  const { data, error } = await need().from("items").insert({ ...itemToRow(item), id: item.id, business_id: b.id }).select().single();
  if (error) throw fromDb(error);
  return rowToItem(data);
};

export const updateItem = async (id, item) => {
  const { data, error } = await need().from("items").update(itemToRow(item)).eq("id", id).select().maybeSingle();
  if (error) throw fromDb(error);
  if (!data) throw new ApiError("not_found");
  return rowToItem(data);
};

export const deleteItem = async (id) => {
  const { error } = await need().from("items").delete().eq("id", id);
  if (error) throw fromDb(error);
};

// Undo: insert the same row, same id, back. The limit trigger runs again, so a full plan can refuse it.
export const restoreItem = (item) => createItem(item);

export const reorderItems = async (order) => {
  const results = await Promise.all(order.map(({ id, sort }) => need().from("items").update({ sort }).eq("id", id)));
  const failed = results.find((r) => r.error);
  if (failed) throw fromDb(failed.error);
};

export const getCatalogSettings = async () => {
  const { data, error } = await need().from("seller_settings").select("settings").maybeSingle();
  if (error) throw fromDb(error);
  const s = data?.settings ?? {};
  return { sections: s.sections ?? [], units: s.units ?? [] };
};

export const saveCatalogSettings = async (patch) => {
  const b = await myBusiness();
  const { data: current, error: readError } = await need().from("seller_settings").select("settings").maybeSingle();
  if (readError) throw fromDb(readError);
  const next = { ...(current?.settings ?? {}), ...patch };
  const { error } = await need().from("seller_settings").upsert({ business_id: b.id, settings: next });
  if (error) throw fromDb(error);
  return { sections: next.sections ?? [], units: next.units ?? [] };
};

export const listItemHistory = async ({ itemId, limit = 100 } = {}) => {
  let q = need().from("item_history").select("*").order("created_at", { ascending: false }).limit(limit);
  if (itemId) q = q.eq("item_id", itemId);
  const { data, error } = await q;
  if (error) throw fromDb(error);
  return data;
};
