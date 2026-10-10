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

export const hasSession = async () => {
  if (!supabase) return false;
  const { data } = await supabase.auth.getSession();
  return Boolean(data?.session);
};

export const getMyBusiness = async () => {
  const { data, error } = await need().from("businesses").select("*").maybeSingle();
  if (error) throw new ApiError("request_failed", error.message);
  if (!data) throw new ApiError("not_a_seller");
  return data;
};

export const listCategories = async () => {
  const { data, error } = await need().from("categories").select("id, name, grp, template, plans(plan_key, price_kes)").eq("active", true).order("sort");
  if (error) throw new ApiError("request_failed", error.message);
  return data.map((c) => ({
    id: c.id,
    name: c.name,
    grp: c.grp,
    template: c.template ?? [],
    plans: Object.fromEntries((c.plans ?? []).map((p) => [p.plan_key, { price: p.price_kes }])),
  }));
};

const tableError = (error) => new ApiError((error.message ?? "request_failed").split(":")[0], error.message);

export const listBranches = async () => {
  const { data, error } = await need().from("branches").select("*").order("sort").order("created_at");
  if (error) throw tableError(error);
  return data;
};

export const saveBranch = async (branch) => {
  const { id, business_id, name, address, town, lat, lng, phone, hours, sort } = branch;
  const row = { name, address, town, lat, lng, phone, hours: hours ?? {}, sort: sort ?? 0 };
  const q = id ? need().from("branches").update(row).eq("id", id) : need().from("branches").insert({ ...row, business_id });
  const { data, error } = await q.select().single();
  if (error) throw tableError(error);
  return data;
};

export const deleteBranch = async (id) => {
  const { error } = await need().from("branches").delete().eq("id", id);
  if (error) throw tableError(error);
};

const upload = async (bucket, path, body, contentType) => {
  const { error } = await need().storage.from(bucket).upload(path, body, { contentType, upsert: false, cacheControl: "31536000" });
  if (error) throw new ApiError("upload_failed", error.message);
  return path;
};

export const uploadMedia = ({ businessId, kind, blob }) => upload("seller-media", `${businessId}/profile/${kind}-${Date.now()}.webp`, blob, "image/webp");

export const uploadDoc = ({ businessId, file }) => {
  const safe = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(-60) || "document";
  return upload("seller-docs", `${businessId}/licence/${Date.now()}-${safe}`, file, file.type);
};

export const mediaUrl = (path) => (path && supabase ? supabase.storage.from("seller-media").getPublicUrl(path).data.publicUrl : null);
