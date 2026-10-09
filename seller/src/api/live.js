import { supabase } from "./client.js";
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
    settings: { idle_minutes: settings?.settings?.idle_minutes ?? 60 }
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
export const finalizeMedia = ({ itemId, path }) => fn("seller-media-finalize", { itemId, path });
export const exportData = () => fn("seller-export-data", {});
