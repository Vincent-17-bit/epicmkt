import { supabase } from "./client.js";
import { itemToRow, rowToItem, isItemLimitMessage, mediaLimitsFor, newId } from "@epicmkt/shared";
import { ApiError } from "./errors.js";
import { normalizeRow } from "../media/normalize.js";
import { prepareMedia, uploadPlan, preparePoster, posterObjectPath } from "../media/prepare.js";

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
  if (/photo_required/.test(message)) return new ApiError("photo_required", "Add at least one photo before showing this item to shoppers.");
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
  const [{ data: cat, error: catError }, stats, limits] = await Promise.all([
    need().from("categories").select("id,name,template").eq("id", b.category_id).maybeSingle(),
    catalogStats(),
    need().from("global_limits").select("standard,premium").eq("id", 1).maybeSingle(),
  ]);
  if (catError) throw fromDb(catError);
  return {
    business: { id: b.id, name: b.name, categoryId: b.category_id, planKey: b.plan_key, status: b.status },
    category: { id: b.category_id, name: cat?.name ?? b.category_id, fields: cat?.template ?? [] },
    itemsLimit: stats?.items_limit ?? null,
    mediaLimits: mediaLimitsFor(limits?.data ?? undefined, b.plan_key),
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

// The files go first, through the server, so no photo or video is left behind. If that fails the item stays and the
// seller can try again. The media rows go with the item (foreign key).
export const deleteItem = async (id) => {
  try {
    await fn("seller-media-remove", { itemId: id });
  } catch (e) {
    if (e.code !== "item_not_found") throw e;
  }
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

// ---- Photos and videos (S5) ----

const BUCKET = "seller-media";
const publicUrl = (path) => need().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
const view = (row) => normalizeRow(row, publicUrl);

const rowOf = async (id) => {
  const { data, error } = await need().from("item_media").select("*").eq("id", id).maybeSingle();
  if (error) throw fromDb(error);
  if (!data) throw new ApiError("media_not_found");
  return data;
};

// Straight to Storage so the browser can report real progress and cancel. supabase-js has neither.
const putObject = async (path, blob, { signal, onProgress } = {}) => {
  const { data } = await need().auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new ApiError("unauthorized");
  const base = import.meta.env?.VITE_SUPABASE_URL;
  const key = import.meta.env?.VITE_SUPABASE_ANON_KEY;
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}/storage/v1/object/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`);
    xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", key);
    xhr.setRequestHeader("content-type", blob.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "max-age=31536000");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      reject(new ApiError(xhr.status === 413 ? "too_large" : xhr.status === 401 || xhr.status === 403 ? "not_allowed" : "upload_failed", undefined, { status: xhr.status }));
    };
    xhr.onerror = () => reject(new ApiError("network", "Could not reach the server."));
    xhr.onabort = () => reject(new ApiError("cancelled", "Upload cancelled."));
    if (signal) {
      if (signal.aborted) return reject(new ApiError("cancelled", "Upload cancelled."));
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(blob);
  });
};

export const listMedia = async (itemId) => {
  const { data, error } = await need().from("item_media").select("*").eq("item_id", itemId).order("sort", { ascending: true }).order("created_at", { ascending: true });
  if (error) throw fromDb(error);
  return data.map(view);
};

// opts: { signal, mediaId, replaceMediaId, alt, variantId, prepared }. onProgress(fraction, phase).
export const uploadMedia = async (itemId, file, onProgress = () => {}, opts = {}) => {
  const { signal, mediaId = newId(), replaceMediaId, alt, variantId, prepared: given } = opts;
  const prepared = given ?? await prepareMedia(file, { signal, onProgress: (f) => onProgress(f * 0.3, "processing") });
  const b = await myBusiness();
  const { objects, body } = uploadPlan(prepared, { businessId: b.id, itemId, mediaId });
  const total = objects.reduce((n, o) => n + o.blob.size, 0) || 1;
  const sent = [];
  let done = 0;
  let finalized = null;
  try {
    for (const o of objects) {
      await putObject(o.path, o.blob, { signal, onProgress: (loaded) => onProgress(0.3 + 0.6 * ((done + loaded) / total), "uploading") });
      done += o.blob.size;
      sent.push(o.path);
    }
    if (signal?.aborted) throw new ApiError("cancelled", "Upload cancelled.");
    onProgress(0.92, "finishing");
    finalized = await fn("seller-media-finalize", { itemId, ...body, ...(alt ? { alt } : {}), ...(variantId ? { variantId } : {}), ...(replaceMediaId ? { replaceMediaId } : {}) });
  } catch (e) {
    // The server deletes what it refuses. This covers a cancel or a dropped connection before it was asked.
    if (!finalized) await need().storage.from(BUCKET).remove(sent).catch(() => {});
    throw e;
  }
  onProgress(1, "done");
  return view(await rowOf(finalized.id));
};

export const reorderMedia = (itemId, orderedIds) => rpc("seller_reorder_media", { p_item: itemId, p_ids: orderedIds });

export const updateMedia = async (mediaId, patch) => rpc("seller_update_media", { p_media: mediaId, p_patch: patch }).then(view);

// input: { timeSec } picks a frame of the stored video, { file } uses a picture the seller chose.
export const setPoster = async (mediaId, input) => {
  const row = await rowOf(mediaId);
  if (row.kind !== "video") throw new ApiError("poster_only_video");
  const poster = await preparePoster(input, { videoUrl: publicUrl(row.path) });
  const path = posterObjectPath({ businessId: row.business_id, itemId: row.item_id, mediaId }, poster.ext);
  await putObject(path, poster.blob);
  try {
    await fn("seller-media-finalize", { action: "poster", itemId: row.item_id, mediaId, path, timeSec: poster.timeSec ?? null });
  } catch (e) {
    await need().storage.from(BUCKET).remove([path]).catch(() => {});
    throw e;
  }
  return view(await rowOf(mediaId));
};

export const removeMedia = async (mediaId) => { await fn("seller-media-remove", { mediaId }); };

export const copyItemMedia = async (fromItemId, toItemId) => {
  await fn("seller-media-copy", { fromItemId, toItemId });
  return listMedia(toItemId);
};
