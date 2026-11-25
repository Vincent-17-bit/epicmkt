import { supabase } from "./client.js";
import { ApiError } from "./errors.js";
import * as shape from "./shape.js";
import { resolveSettings, summarizeLogins, checkProofBatch, checkReply, flashQuota, flashTextProblem, isCloudinaryId, offerQuota, normalizePerformance, normalizeSocials } from "@epicmkt/shared";
import { shrinkIfHuge } from "../lib/prepareUpload.js";

const BUCKET = "message-files";

const need = () => {
  if (!supabase) throw new ApiError("not_configured", "The portal is not configured.");
  return supabase;
};

const fn = async (name, body) => {
  const { data, error } = await need().functions.invoke(name, { body });
  if (error) {
    let payload = null;
    const status = error.context?.status;
    try { payload = await error.context?.json?.(); } catch { payload = null; }
    // These used to all end up as "request_failed", so the seller saw "check your connection" even when the real cause was on the server.
    //   - the request never reached the function (offline, or blocked by the browser: a CORS origin that does not include this site)
    //   - the function is not deployed on this Supabase project (404 with no answer of ours)
    //   - the Supabase relay could not start it
    if (error.name === "FunctionsFetchError") throw new ApiError("service_unreachable", `${name}: ${error.context?.message ?? error.message}`, { fn: name });
    if (error.name === "FunctionsRelayError") throw new ApiError("service_unavailable", name, { fn: name, status });
    if (status === 404 && !payload?.error) throw new ApiError("function_missing", name, { fn: name, status });
    throw new ApiError(payload?.error ?? (status >= 500 ? "server_error" : "request_failed"), payload?.message, { status, fn: name, retryAfter: payload?.retryAfter, problems: payload?.problems, request: payload?.request ?? null });
  }
  return data;
};

const rpc = async (name, args) => {
  const { data, error } = await need().rpc(name, args);
  if (error) throw new ApiError((error.message ?? "request_failed").split(":")[0], error.message, { details: error.details });
  return data;
};

// `identifier` is the seller's Seller ID, or their verified sign-in email.
export const login = async (identifier, password) => {
  const { session } = await fn("seller-login", { identifier, sellerId: identifier, password });
  const { error } = await need().auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  if (error) throw new ApiError("session_failed");
  return { expiresAt: session.expires_at };
};
// An admin opening this site as one business: the admin app's one-time token for that seller's own login becomes a normal session.
export const adminAccess = async (tokenHash) => {
  const { error } = await need().auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (error) throw new ApiError("link_invalid", error.message);
  return { ok: true };
};
export const logout = async () => { await need().auth.signOut(); };
// `channel` is where the code goes: "sms" (Africa's Talking, to the phone on the listing) or "email" (the verified sign-in email).
export const forgotRequest = ({ identifier, channel = "sms" }) => fn("seller-forgot-request", { identifier, sellerId: identifier, channel });
export const forgotVerify = ({ identifier, code, newPassword }) => fn("seller-forgot-verify", { identifier, sellerId: identifier, code, newPassword });
// A code to confirm a password change ("change_password", by `channel`), to prove a new email is theirs ("verify_email", sent to `email`),
// or to prove a new phone number is theirs ("verify_phone", texted to `phone`, in any country). The current password is needed for the
// phone, and is checked before anything is sent; for the email it is optional and catches a typo before the code is spent.
export const requestOtp = ({ purpose = "change_password", channel = "sms", email, phone, currentPassword } = {}) => {
  if (purpose === "verify_email") return fn("seller-otp-request", currentPassword ? { purpose, email, currentPassword } : { purpose, email });
  if (purpose === "verify_phone") return fn("seller-otp-request", { purpose, phone, currentPassword });
  return fn("seller-otp-request", { purpose, channel });
};
export const changePassword = ({ code, newPassword }) => fn("seller-change-password", { code, newPassword });
// Saves the email the last "verify_email" code was sent to. Needs that code and the seller's current password.
export const setLoginEmail = ({ code, currentPassword }) => fn("seller-set-email", { code, currentPassword });
// Saves the phone number the last "verify_phone" code was texted to. Needs that code and the seller's current password. -> { ok, phone }
export const setLoginPhone = ({ code, currentPassword }) => fn("seller-set-phone", { code, currentPassword });
export const updateProfile = (patch) => rpc("seller_update_profile", { p_patch: patch });
export const setTimezone = (timezone) => rpc("seller_set_timezone", { p_timezone: timezone });
export const saveWeeklyHours = (hours) => rpc("seller_set_hours", { p_hours: hours });
// Moves the shop pin on the map. `address` (the landmark text) is optional: leave it out to keep what is saved.
export const setLocation = ({ lat, lng, address } = {}) => rpc("seller_set_location", { p_lat: lat, p_lng: lng, p_address: address ?? null });
// The shop's own delivery setting (migration 0114). { offers, fee, radiusKm, area, minOrder, notes } -> the public object the buyer sees.
export const setDelivery = ({ offers, fee = null, radiusKm = null, area = null, minOrder = null, notes = null } = {}) =>
  rpc("seller_set_delivery", { p_offers: offers, p_fee: fee, p_radius_km: radiusKm, p_area: area, p_min_order: minOrder, p_notes: notes });
// What shoppers asked for and did not find, for this shop only (migration 0115). period is 7 or 30 days.
export const getUnmetDemand = (period = 7) => rpc("seller_unmet_demand", { p_period: period });
// The item's quantity tiers (migration 0117): { tiers, mode, variants: [{ choice, tiers }] }. saveItem sends priceTiers and priceTierMode.
export const getItemTiers = (id) => rpc("seller_item_tiers", { p_id: id });
// Combine similar items (migration 0116). Groups: [{ key, productTypeId, items: [{ id, name, price, salePrice }] }].
export const getSimilarGroups = () => rpc("seller_similar_item_groups");
// spec: { name, axes: [{ key, label, labels: { [itemId]: "400 g" } }] }. The first id becomes the combined item. -> { mergeId, itemId, expiresAt }
export const mergeItems = (ids, spec) => rpc("seller_merge_items", { p_ids: ids, p_spec: spec });
export const undoMerge = (mergeId) => rpc("seller_undo_merge", { p_merge: mergeId });
// The merges that can still be undone: [{ id, itemId, name, count, createdAt, expiresAt }]
export const listRecentMerges = () => rpc("seller_recent_merges");
export const requestChange = async (field, value) => shape.change(await rpc("seller_request_change", { p_field: field, p_value: value }));
export const cancelChange = (id) => rpc("seller_cancel_change", { p_id: id });
const rows = async (q) => {
  const { data, error } = await q;
  if (error) throw new ApiError((error.message ?? "request_failed").split(":")[0], error.message);
  return data;
};
export const listChanges = async () => (await rows(need().from("change_requests").select("*").order("created_at", { ascending: false }))).map(shape.change);
export const confirmPrices = () => rpc("seller_confirm_prices");
export const replyFlag = async (id, reply) => {
  const bad = checkReply(reply);
  if (bad) throw new ApiError(bad);
  return rpc("seller_reply_flag", { p_flag: id, p_reply: reply });
};
export const markRead = (ids = null) => rpc("seller_mark_read", { p_ids: ids });
export const pauseListing = (pause) => rpc("seller_pause_listing", { p_pause: pause });
export const requestDeletion = (name) => rpc("seller_request_deletion", { p_name: name });
export const catalogStats = (staleDays = 90) => rpc("seller_catalog_stats", { p_stale_days: staleDays });
export const itemSignals = async () => (await rpc("seller_item_signals")).map(shape.signal);
// Pictures live in Cloudinary, not Supabase. An upload is three steps, and the browser never holds the Cloudinary secret:
//   1. seller-media-sign   the server picks the id (under this shop's own prefix), records it, and signs ONE upload for it.
//   2. the browser posts the file straight to Cloudinary with that signature. Cloudinary scales it to a 4K master (up or down) on arrival.
//   3. seller-media-finalize  the browser reports Cloudinary's signed answer; the server checks the signature and attaches the picture.
// Videos and pictures stored before the move stay in the Supabase bucket (their paths end in a file extension).
export const finalizeMedia = ({ itemId, path, cloudinary }) => fn("seller-media-finalize", { itemId, path, cloudinary });
const MEDIA_BUCKET = "seller-media";
const PHOTO_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const signUpload = (body) => fn("seller-media-sign", body);

// Cloudinary's answer, reduced to what the server needs to check and record.
const hostedFacts = (r) => ({ version: r.version, signature: r.signature, width: r.width, height: r.height, bytes: r.bytes, format: r.format === "jpeg" ? "jpg" : r.format });

const abortError = () => new ApiError("upload_cancelled");

const raceAbort = (promise, signal) => {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const stop = () => reject(abortError());
    signal.addEventListener("abort", stop, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", stop));
  });
};

// fetch cannot report how much of a file has gone up, so an upload that wants a progress bar goes through XMLHttpRequest instead.
const postWithProgress = (url, form, { signal, onProgress }) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const xhr = new XMLHttpRequest();
    const stop = () => xhr.abort();
    signal?.addEventListener("abort", stop, { once: true });
    const done = () => signal?.removeEventListener("abort", stop);
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total); };
    xhr.onerror = () => { done(); reject(new ApiError("file_not_uploaded")); };
    xhr.onabort = () => { done(); reject(abortError()); };
    xhr.onload = () => {
      done();
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { data = null; }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, data });
    };
    xhr.send(form);
  });

const sendToCloudinary = async ({ uploadUrl, fields, publicId }, file, { signal, onProgress } = {}) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append("file", file); // Cloudinary wants the file last
  let ok;
  let data;
  if (onProgress) {
    ({ ok, data } = await postWithProgress(uploadUrl, form, { signal, onProgress }));
  } else {
    let res;
    try {
      res = await fetch(uploadUrl, { method: "POST", body: form, signal });
    } catch (e) {
      throw e?.name === "AbortError" ? abortError() : new ApiError("file_not_uploaded");
    }
    ok = res.ok;
    data = await res.json().catch(() => null);
  }
  if (!ok || !data?.public_id || data.public_id !== publicId) {
    throw new ApiError(/too large/i.test(data?.error?.message ?? "") ? "too_large" : "file_not_uploaded", data?.error?.message);
  }
  return data;
};

// Asks the server to delete this seller's queued Cloudinary files now. Best effort: the database has already queued them, and the
// media-gc cron job deletes anything this call misses, so a failure here is never shown to the seller.
const purgeRemoved = () => fn("seller-media-purge", {}).catch(() => {});

const asPhotoLimit = (e) => (e?.code === "limit_reached" ? new ApiError("photo_limit") : e);

// `onProgress(fraction | null, stage)` and `signal` are optional. A cancelled upload stops before it is attached, so nothing is saved.
export const uploadItemPhoto = async (itemId, file, { signal, onProgress } = {}) => {
  if (!PHOTO_EXT[file?.type]) throw new ApiError("unsupported_type");
  onProgress?.(null, "preparing");
  const body = await raceAbort(shrinkIfHuge(file), signal);
  let signed;
  try {
    signed = await raceAbort(signUpload({ purpose: "item_photo", itemId }), signal);
  } catch (e) {
    throw asPhotoLimit(e);
  }
  const hosted = await sendToCloudinary(signed, body, { signal, onProgress: onProgress ? (f) => onProgress(f, "uploading") : undefined });
  onProgress?.(1, "finishing");
  try {
    await raceAbort(finalizeMedia({ itemId, path: signed.publicId, cloudinary: hostedFacts(hosted) }), signal);
  } catch (e) {
    throw asPhotoLimit(e);
  }
  return { path: signed.publicId };
};

// Deleting the row is enough for a Cloudinary picture: a database trigger queues the file and the media-gc job deletes it.
// Older pictures are still files in the Supabase bucket and are removed from there as before.
export const removeItemPhoto = async (path) => {
  await rows(need().from("item_media").delete().eq("path", path));
  if (isCloudinaryId(path)) await purgeRemoved();
  else await need().storage.from(MEDIA_BUCKET).remove([path]);
};

// Videos stay in the Supabase bucket (not Cloudinary). An upload is three steps, like a photo, but the file goes to storage:
//   1. seller-media-sign (purpose item_video)  checks the item is this shop's and the plan has room, and returns an upload ticket.
//   2. the browser sends the file straight to the bucket with that ticket.
//   3. seller-media-finalize                   reads the real bytes, checks type, size and length, and attaches the video to the item.
const VIDEO_EXT = { "video/mp4": "mp4", "video/webm": "webm" };
const VIDEO_MAX_BYTES = 25 * 1024 * 1024;
// finalize answers with the same reasons it uses for pictures; say them in words that are about videos.
const VIDEO_REASON = { unsupported_type: "video_unsupported", too_large: "video_too_large", too_long: "video_too_long", unreadable: "video_unreadable", too_big_dimensions: "video_too_big", limit_reached: "video_limit", upload_not_found: "video_expired", file_not_found: "video_not_uploaded" };
// Codes that mean "the server could not do it", not "you did something wrong". They used to fall through to the generic
// "check your connection" text, which sent sellers with a working connection round in circles.
const SERVER_SIDE = new Set(["server_error", "bad_request", "request_failed", "forbidden", "media_not_configured"]);
const asVideoError = (e) => {
  if (VIDEO_REASON[e?.code]) return new ApiError(VIDEO_REASON[e.code], e.message);
  if (SERVER_SIDE.has(e?.code)) return new ApiError("video_unavailable", e.message, { status: e.status });
  return e;
};
// What the bucket said when it refused the file, in the same words finalize would have used.
const videoStorageCode = (error) => {
  const status = Number(error?.statusCode ?? error?.status ?? 0);
  const text = String(error?.message ?? "");
  if (status === 413 || /exceed|too large|payload/i.test(text)) return "video_too_large";
  if (/mime|not supported|invalid.*type/i.test(text)) return "video_unsupported";
  if (status === 401 || status === 403 || /expired|jwt|token|signature/i.test(text)) return "video_expired";
  return "video_not_uploaded";
};
const logVideo = (stage, e) => console.error(`[video upload] ${stage} failed:`, e?.code ?? e?.name, e?.message ?? "", e?.status ?? "");

// DEPRECATED: use listItemMedia, which returns photos and videos in one ordered list.
export const listItemVideos = async (itemId) =>
  (await rows(need().from("item_media").select("path").eq("item_id", itemId).eq("kind", "video").order("sort", { ascending: true }).order("created_at", { ascending: true }))).map((r) => r.path);

export const uploadItemVideo = async (itemId, file, { signal, onProgress } = {}) => {
  const type = VIDEO_EXT[file?.type];
  if (!type) throw new ApiError("video_unsupported");
  if (file.size > VIDEO_MAX_BYTES) throw new ApiError("video_too_large");
  onProgress?.(null, "preparing");
  let ticket;
  try {
    ticket = await raceAbort(signUpload({ purpose: "item_video", itemId, type }), signal);
  } catch (e) {
    if (e?.code === "upload_cancelled") throw e;
    logVideo("sign", e);
    throw asVideoError(e);
  }
  if (!ticket?.path || !ticket?.token) {
    logVideo("sign", { code: "bad_ticket" });
    throw new ApiError("video_unavailable");
  }
  onProgress?.(null, "uploading");
  let stored;
  try {
    stored = await raceAbort(need().storage.from(MEDIA_BUCKET).uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type }), signal);
  } catch (e) {
    if (e?.code === "upload_cancelled") throw e;
    logVideo("storage", e);
    throw new ApiError("video_not_uploaded");
  }
  if (stored?.error) {
    logVideo("storage", stored.error);
    throw new ApiError(videoStorageCode(stored.error), stored.error.message);
  }
  onProgress?.(1, "finishing");
  try {
    await raceAbort(finalizeMedia({ itemId, path: ticket.path }), signal);
  } catch (e) {
    if (e?.code === "upload_cancelled") throw e;
    // Finalize already ran once (the answer was lost on the way back): the video is attached, so this retry is a success.
    if (e?.code === "already_attached") return { path: ticket.path };
    logVideo("finalize", e);
    throw asVideoError(e);
  }
  return { path: ticket.path };
};

// A video row is removed exactly like a photo row: delete it, then drop the file from the bucket.
export const removeItemVideo = (path) => removeItemPhoto(path);

// DEPRECATED: use reorderItemMedia. This only orders photos, inside the slots photos already occupy.
export const reorderItemPhotos = (itemId, paths) => rpc("seller_reorder_item_photos", { p_item: itemId, p_paths: paths });

// Photos and videos are ONE ordered sequence. The first photo in it is the cover; a video is never the cover.
//   getItemMedia(itemId) -> { media: [{ path, kind, sort, duration? }], cover, limits: { photos: { used, max }, videos: { used, max } } }
//   max is null when the plan has no limit, so the screen can say "3 of 10 photos, 1 of 2 videos".
export const getItemMedia = async (itemId) => shape.itemMedia(await rpc("seller_item_media", { p_item: itemId }));
export const listItemMedia = async (itemId) => (await getItemMedia(itemId)).media;
export const getItemMediaLimits = async (itemId) => (await getItemMedia(itemId)).limits;
// What the plan allows per item, in the same shape as getItemMedia().limits, for an item that does not exist yet.
export const sellerProductTypes = () => rpc("seller_product_types");
export const sellerRequestType = (name, note) => rpc("seller_request_type", { p_name: name, p_note: note || null });
export const getMediaLimits = async () => {
  const sub = await getSubscription();
  const l = sub.limits[sub.business.planKey] ?? {};
  const cap = (n) => (n == null ? null : Number(n));
  return { photos: { used: 0, max: cap(l.photosPerItem) }, videos: { used: 0, max: cap(l.videosPerItem) } };
};
// 3D views (migration 0101). A 3D asset is a model (.glb), the frames of a photo spin, or the poster that stands in while the view loads.
// It belongs to the whole item (optionIds []) or to one option value (such as a colour).
//   getItemMedia3d(itemId) -> { media3d: [{ id, path, role, sort, optionIds, size, width, height }], issues: [{ code, scope }], hasView, limits }
export const getItemMedia3d = (itemId) => rpc("seller_item_media3d", { p_item: itemId });
const POSTER_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const TICKET_ERRORS = { too_large: "model_too_large", unsupported_type: "unsupported_type", limit_reached: "media3d_limit", too_many_pending: "media3d_limit" };
//   1. seller-media-ticket   checks type and size from what we declare, picks the file id, and signs one upload.
//   2. the file goes straight to the bucket (model) or to Cloudinary (frame, poster).
//   3. seller-media3d-finalize   reads the real bytes back and attaches the asset to the item.
// role: "model-glb" | "spin-frame" | "poster". `position` places a spin frame (0-based). Cancel with `signal`.
export const uploadMedia3d = async (itemId, { role, file, optionIds = [], position }, { signal, onProgress } = {}) => {
  const type = role === "model-glb" ? "glb" : POSTER_EXT[file?.type];
  if (!type) throw new ApiError("unsupported_type");
  onProgress?.(null, "preparing");
  let ticket;
  try {
    ticket = await raceAbort(fn("seller-media-ticket", { kind: role, itemId, type, size: file.size, optionIds }), signal);
  } catch (e) {
    throw TICKET_ERRORS[e?.code] ? new ApiError(TICKET_ERRORS[e.code]) : e;
  }
  let path;
  let cloudinary;
  if (ticket.token) {
    path = ticket.path;
    const stored = await raceAbort(need().storage.from(MEDIA_BUCKET).uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: ticket.contentType ?? "model/gltf-binary" }), signal);
    if (stored?.error) throw new ApiError("file_not_uploaded", stored.error.message);
  } else {
    path = ticket.publicId;
    cloudinary = hostedFacts(await sendToCloudinary(ticket, file, { signal, onProgress: onProgress ? (f) => onProgress(f, "uploading") : undefined }));
  }
  onProgress?.(1, "finishing");
  let done = null;
  try {
    done = await raceAbort(fn("seller-media3d-finalize", { itemId, path, optionIds, ...(position === undefined ? {} : { position }), ...(cloudinary ? { cloudinary } : {}) }), signal);
  } catch (e) {
    if (e?.code === "already_attached") return { path, id: null };
    throw TICKET_ERRORS[e?.code] ? new ApiError(TICKET_ERRORS[e.code]) : e;
  }
  return { path, id: done?.id ?? null };
};
// A 3D row is removed like a photo: delete the row, then the file follows (the database queues it).
export const removeMedia3d = (path) => removeItemPhoto(path);
// Puts the uploaded frames of one photo spin in a new order (migration 0137). `paths` must be every frame of that scope, once each.
export const reorderSpinFrames = (itemId, { optionId = "", paths }) => rpc("seller_reorder_spin", { p_item: itemId, p_option: optionId || null, p_paths: paths });

// `paths` must be every path of the item, once each, in the new order. Anything else is refused and nothing changes.
export const reorderItemMedia = async (itemId, paths) => {
  const r = await rpc("seller_reorder_item_media", { p_item: itemId, p_paths: paths });
  return { updated: r?.updated ?? 0, cover: r?.cover ?? null };
};

// The shop logo and cover photo. The browser sends an already-cropped, re-encoded picture (see lib/photoCanvas.js).
// Every upload gets a new id, so a changed picture is never served from a cache that still holds the old one. When the profile
// points at the new picture the old one is queued for deletion by the database (or removed from the bucket if it is an older one).
const SHOP_KINDS = ["logo", "cover"];
const dropLegacy = (old) => (old && !isCloudinaryId(old) ? need().storage.from(MEDIA_BUCKET).remove([old]).catch(() => {}) : undefined);
export const uploadShopImage = async (kind, blob) => {
  if (!SHOP_KINDS.includes(kind)) throw new ApiError("invalid_kind");
  if (!PHOTO_EXT[blob?.type]) throw new ApiError("unsupported_type");
  const business = await rows(need().from("businesses").select("id, logo_path, cover_path").maybeSingle());
  if (!business) throw new ApiError("not_a_seller");
  const signed = await signUpload({ purpose: kind });
  const hosted = await sendToCloudinary(signed, blob);
  await finalizeMedia({ path: signed.publicId, cloudinary: hostedFacts(hosted) });
  // If this fails the upload is simply never attached; the hourly sweep queues it for deletion.
  await updateProfile({ [`${kind}_path`]: signed.publicId });
  const old = business[`${kind}_path`];
  if (old && old !== signed.publicId) {
    await dropLegacy(old);
    await purgeRemoved();
  }
  return { path: signed.publicId };
};
export const removeShopImage = async (kind) => {
  if (!SHOP_KINDS.includes(kind)) throw new ApiError("invalid_kind");
  const business = await rows(need().from("businesses").select("id, logo_path, cover_path").maybeSingle());
  if (!business) throw new ApiError("not_a_seller");
  const old = business[`${kind}_path`];
  await updateProfile({ [`${kind}_path`]: null });
  await dropLegacy(old);
  await purgeRemoved();
};
export const exportData = () => fn("seller-export-data", {});

export const getSubscription = async () => {
  const b = await rows(need().from("businesses").select("*").maybeSingle());
  if (!b) throw new ApiError("not_a_seller");
  const [cat, plans, limits, graceDays] = await Promise.all([
    rows(need().from("categories").select("id, name").eq("id", b.category_id).maybeSingle()),
    rows(need().from("plans").select("*").eq("category_id", b.category_id)),
    rows(need().from("global_limits").select("*").eq("id", 1).maybeSingle()),
    rpc("my_grace_days"),
  ]);
  return {
    business: { ...shape.business(b), graceDays: Number(graceDays ?? 1), categoryName: cat?.name ?? b.category_id },
    plans: shape.plans(plans),
    limits: { standard: limits?.standard ?? {}, premium: limits?.premium ?? {} },
  };
};
export const getPaymentInstructions = async ({ purpose = null, targetPlan = null, category = null } = {}) =>
  shape.instructions(await rpc("seller_payment_instructions", { p_purpose: purpose, p_target_plan: targetPlan, p_category: category }));
export const applyCredit = async ({ purpose = null, targetPlan = null, category = null, changeId = null } = {}) =>
  rpc("seller_apply_credit", { p_purpose: purpose, p_target_plan: targetPlan, p_category: category, p_change_id: changeId });
// Tells the server what the seller is about to pay for, so money for an upgrade is not taken as a renewal.
export const setPaymentIntent = async ({ purpose = null, targetPlan = null, category = null, changeId = null } = {}) => {
  await rpc("seller_set_payment_intent", { p_purpose: purpose, p_target_plan: targetPlan, p_category: category, p_change_id: changeId });
};
// M-Pesa "Pay now" (STK Push): the PIN prompt goes to `phone`. Only what is being paid for is sent; the server works out the amount.
const defined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));
export const startStkPayment = ({ phone, months = 1, purpose = null, targetPlan = null, category = null, changeId = null } = {}) =>
  fn("pay-stk-start", defined({ phone, months, purpose, targetPlan, category, changeId }));
export const getStkPayment = (requestId) => fn("pay-stk-status", { requestId });
export const listPayments = async () => (await rows(need().from("payments").select("*").order("created_at", { ascending: false }).limit(200))).map(shape.payment);
export const getReceipt = async (id) => {
  const p = await rows(need().from("payments").select("*").eq("id", id).maybeSingle());
  if (!p || p.status !== "confirmed") throw new ApiError("receipt_not_found");
  const sub = await getSubscription();
  const category = p.category_id && p.category_id !== sub.business.categoryId
    ? (await rows(need().from("categories").select("id, name").eq("id", p.category_id).maybeSingle()))?.name
    : sub.business.categoryName;
  return { payment: shape.payment(p), business: sub.business, categoryName: category ?? sub.business.categoryName };
};
export const quoteCategoryChange = (category) => rpc("seller_quote_category_change", { p_category: category });
export const listCategoryPlans = async () => {
  const [cats, plans] = await Promise.all([
    rows(need().from("categories").select("id, name, grp").order("sort")),
    rows(need().from("plans").select("category_id, plan_key, price_kes")),
  ]);
  return cats.map((c) => ({ id: c.id, name: c.name, group: c.grp, prices: Object.fromEntries(plans.filter((p) => p.category_id === c.id).map((p) => [p.plan_key, p.price_kes])) }));
};
export const listMessages = async ({ kinds = null } = {}) => {
  let q = need().from("messages").select("*").order("created_at", { ascending: false }).limit(200);
  if (kinds?.length) q = q.in("kind", kinds);
  const list = await rows(q);
  const files = list.length ? await rows(need().from("message_attachments").select("*").in("message_id", list.map((m) => m.id))) : [];
  return list.map((m) => shape.message(m, files.filter((f) => f.message_id === m.id).map(shape.messageFile)));
};
// Tells the server this device received the messages (two green ticks on the sender's side).
export const ackDelivered = async () => rpc("message_ack_delivered", { p_ids: null });
export const sendMessage = async ({ parentId, body, files = [] }) => {
  const check = checkProofBatch(files);
  if (check.error) throw new ApiError(check.error, undefined, { file: check.file });
  const business = await rows(need().from("businesses").select("id").maybeSingle());
  if (!business) throw new ApiError("not_a_seller");
  const attachments = [];
  for (const f of files) {
    const safe = f.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-100);
    const path = `${business.id}/${crypto.randomUUID()}-${safe}`;
    const { error } = await need().storage.from(BUCKET).upload(path, f, { contentType: f.type });
    if (error) throw new ApiError("file_not_uploaded");
    attachments.push({ path, name: f.name, mime: f.type, size: f.size });
  }
  return shape.message(await rpc("seller_send_message", { p_parent: parentId, p_body: body ?? "", p_attachments: attachments }));
};
// Files are private. A short lived link is made for each click.
export const openAttachment = async (path) => {
  const { data, error } = await need().storage.from(BUCKET).createSignedUrl(path, 300);
  if (error) throw new ApiError("file_not_found");
  return data.signedUrl;
};
export const unreadCount = async () => {
  const { count, error } = await need().from("messages").select("id", { count: "exact", head: true }).is("read_at", null);
  if (error) throw new ApiError("request_failed", error.message);
  return count ?? 0;
};
export const listQuestions = async () => {
  const flags = await rows(need().from("flags").select("*").not("seller_message", "is", null).order("created_at", { ascending: false }).limit(100));
  if (!flags.length) return [];
  const itemIds = [...new Set(flags.map((f) => f.item_id).filter(Boolean))];
  const faqIds = [...new Set(flags.map((f) => f.faq_id).filter(Boolean))];
  const [items, faqs, files] = await Promise.all([
    itemIds.length ? rows(need().from("items").select("id, name").in("id", itemIds)) : [],
    faqIds.length ? rows(need().from("faqs").select("id, question").in("id", faqIds)) : [],
    rows(need().from("flag_attachments").select("id, flag_id, original_name, mime, size_bytes, status").in("flag_id", flags.map((f) => f.id)).eq("status", "ready")),
  ]);
  return flags.map((f) => shape.question(f, {
    item: items.find((i) => i.id === f.item_id) ? { id: f.item_id, name: items.find((i) => i.id === f.item_id).name } : null,
    faq: faqs.find((q) => q.id === f.faq_id) ? { id: f.faq_id, question: faqs.find((q) => q.id === f.faq_id).question } : null,
    attachments: files.filter((a) => a.flag_id === f.id).map(shape.attachment),
  }));
};

// Upload in three steps: signed URLs, the browser sends the files straight to storage, then the server
// re-checks them. Only after that can the reply be sent (replyFlag).
export const uploadProofs = async (flagId, files, { alreadyAttached = 0 } = {}) => {
  const check = checkProofBatch(files, alreadyAttached);
  if (check.error) throw new ApiError(check.error, undefined, { file: check.file });
  const { uploads } = await fn("seller-proof-upload-url", { flagId, files: files.map((f) => ({ name: f.name, size: f.size, type: f.type })) });
  for (let i = 0; i < files.length; i++) {
    const { error } = await need().storage.from("seller-proofs").uploadToSignedUrl(uploads[i].path, uploads[i].token, files[i], { contentType: files[i].type });
    if (error) throw new ApiError("file_not_uploaded");
  }
  const { attachments } = await fn("seller-proof-finalize", { flagId, attachmentIds: uploads.map((u) => u.attachmentId) });
  return attachments;
};

const ON_REQUEST = ["items", "item_history"];
const TABLES = ["payments", "businesses", "messages", "message_attachments", "flags", "flag_attachments", "flash_sales"];
/** Row-level security applies to realtime, so a seller only ever receives their own rows. */
export const subscribe = (tables, onEvent) => {
  const client = need();
  const list = (tables?.length ? tables : TABLES).filter((t) => TABLES.includes(t) || ON_REQUEST.includes(t));
  const channel = client.channel(`seller-${list.join("-")}-${Math.random().toString(36).slice(2, 8)}`);
  for (const table of list) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, (p) => onEvent({ table, type: p.eventType, row: p.new && Object.keys(p.new).length ? p.new : p.old }));
  }
  channel.subscribe();
  return () => { client.removeChannel(channel); };
};

// Opening-hours exceptions: [{ id, date: "YYYY-MM-DD", kind: "closed" | "special" | "break", intervals: [["09:00","13:00"]], note, until?, weekdays? }]
export const listExceptions = async () => {
  const b = await rows(need().from("businesses").select("exceptions").maybeSingle());
  return b?.exceptions ?? [];
};
export const saveException = ({ id = null, date, kind, intervals = [], note = null, until = null, weekdays = null }) =>
  rpc("seller_save_exception", { p_id: id, p_date: date, p_kind: kind, p_intervals: intervals, p_note: note, p_until: until, p_weekdays: weekdays });
export const deleteException = (id) => rpc("seller_delete_exception", { p_id: id });

const FLASH_CONSTRAINTS = {
  flash_sales_value: "invalid_discount",
  flash_sales_headline_check: "invalid_headline",
  flash_sales_quantity_note_check: "invalid_note",
  flash_sales_window: "invalid_window",
  flash_sales_duration: "duration_too_long",
  "row-level security": "not_found",
};
const flashFail = (error) => {
  const message = error.message ?? "request_failed";
  const hit = Object.keys(FLASH_CONSTRAINTS).find((k) => message.includes(k));
  if (hit) return new ApiError(FLASH_CONSTRAINTS[hit], message);
  const [code] = message.split(":");
  return new ApiError(code.trim().replace(/\s+/g, "_"), message);
};
const flashRows = async (q) => {
  const { data, error } = await q;
  if (error) throw flashFail(error);
  return data;
};

export const getServerTime = async () => {
  const { data, error } = await need().rpc("get_server_time");
  if (error) throw flashFail(error);
  return { now: new Date(data).toISOString() };
};
export const listItems = async () =>
  (await flashRows(need().from("items").select("id, name, price, price_type, availability, visible, hidden_by_admin, removed_by_admin").order("name"))).map(shape.ownItem);
export const getCatalog = async () => shape.catalog(await rpc("seller_catalog_items"));
const itemRow = (f) => ({
  name: f.name, description: f.description || null, section: f.section || null, price_type: f.priceType, price: f.price, price_max: f.priceMax ?? null,
  sale_price: f.salePrice ?? null, unit: f.unit || null, availability: f.availability,
  track_stock: Boolean(f.trackStock), stock_count: f.trackStock ? f.stockCount : null, low_stock_threshold: f.lowStockThreshold ?? 3, show_stock_count: Boolean(f.showStockCount),
  ...(Array.isArray(f.specs) && { specs: f.specs }),
  // Only what the form carried goes to the database; a missing key keeps the stored value.
  ...(f.brand !== undefined && { brand: f.brand }), ...(f.shortDescription !== undefined && { short_description: f.shortDescription }),
  ...(f.packSize !== undefined && { pack_size: f.packSize }), ...(f.terms !== undefined && { terms: f.terms }),
  ...(Array.isArray(f.includes) && { includes: f.includes }), ...(Array.isArray(f.highlights) && { highlights: f.highlights }),
  // Options and the size chart (migration 0084): same rule, a missing key keeps what is stored. options: null clears them.
  ...(f.options !== undefined && { options: f.options }), ...(f.sizeChartId !== undefined && { size_chart_id: f.sizeChartId }),
  ...(f.sizeChartOverride !== undefined && { size_chart_override: f.sizeChartOverride }),
  ...(Array.isArray(f.variants) && { variants: f.variants }),
  // The product type (migration 0091) is read from camelCase `productTypeId`: absent keeps the stored type, null is "Other goods".
  ...(f.productTypeId !== undefined && { productTypeId: f.productTypeId }),
  // Quantity prices (migration 0094): priceTiers null clears them; absent keeps what is stored.
  ...(f.priceTiers !== undefined && { priceTiers: f.priceTiers }), ...(f.priceTierMode !== undefined && { priceTierMode: f.priceTierMode }),
});
export const getShopPreview = async () => {
  const [b, catalog, flashSales, offers, server] = await Promise.all([
    rows(need().from("businesses").select("id, slug, name, category_id, plan_key, status, verification_level, tagline, description, phone, whatsapp, socials, county, town, address, lat, lng, logo_path, cover_path, tags, hours, exceptions, timezone").maybeSingle()),
    getCatalog(),
    listFlashSales(),
    listOffers().catch(() => []),
    getServerTime(),
  ]);
  if (!b) throw new ApiError("not_a_seller");
  const category = await rows(need().from("categories").select("name").eq("id", b.category_id).maybeSingle());
  return shape.preview(b, { categoryName: category?.name, catalog, flashSales, offers, nowMs: Date.parse(server.now) });
};
export const saveItem = async (id, fields) => rpc("seller_save_item", { p_id: id ?? null, p_fields: itemRow(fields) });
// The issues a save would raise, without saving (migration 0088): { ok, issues: [{ code }] }. Same arguments as saveItem.
export const checkItem = (id, fields) => rpc("seller_check_item", { p_id: id ?? null, p_fields: itemRow(fields) });
// The editor's read of an item's options: { axes, variants (with stock counts), availability, sizeChartId, sizeChartOverride }.
export const getItemOptions = (id) => rpc("seller_item_options", { p_id: id });
// The seller's own size guide for one item (migration 0103): { unit, columns, rows } or null.
export const getItemSizeGuide = (id) => rpc("seller_item_size_guide", { p_id: id });
export const saveItemSizeGuide = (id, guide) => rpc("seller_set_item_size_guide", { p_id: id, p_guide: guide ?? null });
// The photo next to each "What's included" line (migration 0137): [mediaId | null, ...] in the order of the saved lines.
export const saveItemIncludeMedia = (id, list) => rpc("seller_set_item_include_media", { p_id: id, p_media: list ?? null });
// Page sections (migration 0138). "Extra" pictures are for What's included, the gallery and From the brand: they never take a photo slot
// of the plan and never show among the photos. listItemExtras -> [{ id, path, width, height, size }].
export const listItemExtras = (itemId) => rpc("seller_item_extras", { p_item: itemId });
export const uploadItemExtra = async (itemId, file, opts = {}) => {
  try {
    const r = await uploadMedia3d(itemId, { role: "extra-image", file }, opts);
    if (r.id) return r;
    const again = await listItemExtras(itemId);   // finalize ran before but its answer was lost: find the row by its path
    return { path: r.path, id: (again ?? []).find((x) => x.path === r.path)?.id ?? null };
  } catch (e) {
    throw e?.code === "media3d_limit" ? new ApiError("extras_limit") : e;
  }
};
// page: any of { delivery, notices, gallery, brand, includeMedia }; a missing key keeps what is stored. Unused extra pictures are deleted.
export const saveItemPage = (id, page) => rpc("seller_set_item_page", { p_id: id, p_page: page });
// The made-to-measure setting of one item (migration 0125): the saved config or null. saveItemCustomSize(id, null) clears it.
export const getItemCustomSize = (id) => rpc("seller_item_custom_size", { p_id: id });
export const saveItemCustomSize = (id, config) => rpc("seller_set_item_custom_size", { p_id: id, p_config: config ?? null });
// The size chart library (active charts). Admin keeps it; sellers copy one as the starting table of their own guide.
export const listSizeCharts = async () => rows(need().from("public_size_charts").select("id, name, category, unit, columns, rows").order("name"));
export const bulkItems = (action, ids, args = {}) => rpc("seller_bulk_items", { p_action: action, p_ids: ids, p_args: args });
// Gives items that have no type a type. Only the type changes: price and stock are never touched. Returns { updated, skipped: [{ id, reason }] },
// reason being has_type, needs_details (a live item the type's required rows would block) or not_found.
export const setItemTypes = (ids, typeId) => rpc("seller_set_item_types", { p_ids: ids, p_type: typeId });
// 'sold_out' marks an item out of stock. 'restock' lists it again; a counted item needs its new count.
export const itemStock = (id, action, count = null) => rpc("seller_item_stock", { p_id: id, p_action: action, p_count: count });
export const reorderItems = (ids) => rpc("seller_reorder_items", { p_ids: ids });
// Makes the draft copy, then gives it its own copy of the pictures and videos. The draft is kept even if some files fail to copy;
// the editor opens on the copy and shows exactly what it has.
export const duplicateItem = async (id) => {
  const copyId = await rpc("seller_duplicate_item", { p_id: id });
  try {
    await fn("seller-item-copy-media", { fromItemId: id, toItemId: copyId });
  } catch {
    /* the copy exists without (some of) its media */
  }
  try {
    // The seller's own size guide (migration 0103) comes with the copy; seller_duplicate_item itself does not know about it.
    const g = await rpc("seller_item_size_guide", { p_id: id });
    if (g) await rpc("seller_set_item_size_guide", { p_id: copyId, p_guide: g });
  } catch {
    /* the copy exists without it; the seller can add one in the editor */
  }
  return copyId;
};
// Performance: views and WhatsApp, call and directions taps from the daily rollup (log_business_event feeds it). Same for every plan.
// Pass an item id to look at one item. Ranges: 7d, 1m, 6m, 12m, 24m, 36m, all.
export const getPerformance = async (range = "1m", itemId = null) => normalizePerformance(await rpc("seller_performance", { p_range: range, p_item_id: itemId }));
// History: { limit, total, locked, entries }. The server applies the plan gate (limit key historyEntries).
export const getItemHistory = (itemId) => rpc("seller_item_history", { p_item_id: itemId });
// Deals: per flash sale and offer numbers. Premium only (limit key flashAttribution); others get { locked: true } and no numbers.
export const getItemDeals = (itemId) => rpc("seller_item_deals", { p_item_id: itemId });
export const importItems = (rows) => rpc("seller_import_items", { p_rows: rows });
export const getSavedViews = () => rpc("seller_get_views");
export const saveSavedViews = (views) => rpc("seller_save_views", { p_views: views });
export const listFlashSales = async () =>
  (await flashRows(need().from("flash_sales").select("*, items(name, price)").order("starts_at", { ascending: false }).limit(100))).map(shape.flashSale);
export const getFlashQuota = async () => {
  const [sub, sales] = await Promise.all([getSubscription(), listFlashSales()]);
  const { now } = await getServerTime();
  return flashQuota(sales, sub.limits[sub.business.planKey], Date.parse(now));
};
export const createFlashSale = async ({ itemId, discountType, discountValue, startsAt, endsAt, headline, quantityNote, afterEnd, variantTarget, variantOverrides }) => {
  const business = await flashRows(need().from("businesses").select("id").maybeSingle());
  if (!business) throw new ApiError("not_a_seller");
  const row = await flashRows(need().from("flash_sales").insert({
    business_id: business.id, item_id: itemId, discount_type: discountType, discount_value: discountValue, starts_at: startsAt ?? new Date().toISOString(),
    ends_at: endsAt, headline: headline || null, quantity_note: quantityNote || null, after_end: afterEnd,
    ...(variantTarget === "chosen" && { variant_target: "chosen", variant_overrides: variantOverrides ?? [] }),
  }).select("*, items(name, price)").single());
  return shape.flashSale(row);
};
export const updateFlashSale = async (id, { headline, quantityNote }) => {
  // Same text rules as the mock and the database, so a bad headline is refused before the round trip.
  const bad = flashTextProblem("headline", headline) ?? flashTextProblem("note", quantityNote);
  if (bad) throw new ApiError(bad);
  return shape.flashSale(await flashRows(need().from("flash_sales").update({ headline: headline || null, quantity_note: quantityNote || null }).eq("id", id).select("*, items(name, price)").single()));
};
// A running or scheduled sale can be pushed later, never earlier, and never past 7 days from its start (checked in the database).
export const extendFlashSale = async (id, endsAt) => {
  const { error } = await need().rpc("extend_flash_sale", { p_id: id, p_ends_at: endsAt });
  if (error) throw flashFail(error);
  return true;
};
export const endFlashSale = async (id) => {
  const { error } = await need().rpc("seller_end_flash_sale", { p_id: id });
  if (error) throw flashFail(error);
  return true;
};

const OFFER_FIELDS = (f) => ({
  scope: f.scope === "store" ? "store" : "product", kind: f.kind, config: f.config ?? {}, conditions: f.conditions ?? {}, title: f.title || null, description: f.description || null,
  chip_text: f.chipText || null, code: f.code || null, terms: f.terms || null, starts_at: f.startsAt || null, ends_at: f.endsAt || null,
});
export const listOffers = async () =>
  (await flashRows(need().from("offers").select("*, offer_items(item_id, role, sort)").order("created_at", { ascending: false }).limit(200))).map(shape.offer);
export const getOfferQuota = async () => {
  const [sub, offers] = await Promise.all([getSubscription(), listOffers()]);
  return offerQuota(offers, sub.limits[sub.business.planKey], Date.now());
};
export const saveOffer = async (id, f) => {
  const newId = await rpc("seller_save_offer", { p_id: id ?? null, p_fields: OFFER_FIELDS(f), p_items: f.scope === "store" ? [] : (f.items ?? []).map((e) => ({ item_id: e.itemId, role: e.role ?? "main" })) });
  const rows = await listOffers();
  return rows.find((o) => o.id === (newId ?? id)) ?? null;
};
export const setOfferActive = (id, active) => rpc("seller_set_offer_active", { p_id: id, p_active: !!active });
export const endOffer = (id) => rpc("seller_end_offer", { p_id: id });
export const deleteOffer = (id) => rpc("seller_delete_offer", { p_id: id });

// ---- Settings, help and onboarding ----
// The few business columns the settings and setup screens read that the shared business shape does not carry.
export const getBusinessFacts = async () => {
  const b = await rows(need().from("businesses").select("id, seller_id, name, status, plan_key, category_id, phone, email, logo_path, cover_path, county, town, address, lat, lng, delivers, delivery_fee, delivery_radius_km, delivery_area, delivery_min_order, delivery_notes").maybeSingle());
  if (!b) throw new ApiError("not_a_seller");
  return b;
};
export const getSettings = async () => {
  const row = await rows(need().from("seller_settings").select("settings").maybeSingle());
  return resolveSettings(row?.settings ?? {});
};
export const saveSettings = async (patch) => resolveSettings(await rpc("seller_save_settings", { p_patch: patch }));
export const loginHistory = async () => {
  const data = await rows(need().from("login_events").select("id, success, user_agent, created_at").order("created_at", { ascending: false }).limit(200));
  return summarizeLogins(data ?? []);
};
export const signOutOthers = () => fn("seller-signout-others", {});
// Contact details come from the admin-edited "support" site setting, with the build-time values as a fallback.
export const supportContacts = async () => {
  const env = import.meta.env ?? {};
  const base = { whatsapp: env.VITE_CONTACT_WHATSAPP || "", phone: env.VITE_CONTACT_PHONE || "", email: env.VITE_CONTACT_EMAIL || "", hours: env.VITE_SUPPORT_HOURS || "" };
  try {
    const { data } = await need().from("site_config").select("value").eq("key", "support").maybeSingle();
    const v = data?.value && typeof data.value === "object" ? data.value : {};
    return { ...base, ...Object.fromEntries(Object.entries(v).filter(([k, x]) => k in base && typeof x === "string" && x.trim())) };
  } catch {
    return base;
  }
};

// ---------------------------------------------------------------------------
// Gallery, team and class timetable
// ---------------------------------------------------------------------------
const adminState = (r) => (r.removed_by_admin || r.admin_status === "removed" ? "removed" : r.hidden_by_admin || r.admin_status === "hidden" ? "hidden" : "ok");
const galleryPhoto = (r) => ({
  id: r.id, path: r.path, caption: r.caption ?? null, pairId: r.pair_id ?? null, pairRole: r.pair_role ?? null, sort: r.sort ?? 0,
  width: r.width ?? null, height: r.height ?? null, adminState: adminState(r), adminReason: r.admin_hide_reason ?? r.admin_reason ?? null,
});
export const listGallery = async () => (await rows(need().from("gallery_photos").select("*").is("deleted_at", null).order("sort").order("created_at"))).map(galleryPhoto);
// One picture: ask for a Cloudinary ticket, send the file, tell the server what Cloudinary answered. The server adds the row.
export const addGalleryPhoto = async ({ file, caption, pairId, pairRole }) => {
  if (!PHOTO_EXT[file?.type]) throw new ApiError("unsupported_type");
  const body = await shrinkIfHuge(file);
  let signed;
  try {
    signed = await signUpload({ purpose: "gallery" });
  } catch (e) {
    throw e?.code === "limit_reached" ? new ApiError("limit_reached", "limit_reached:gallery_photos") : e;
  }
  const hosted = await sendToCloudinary(signed, body);
  try {
    const done = await finalizeGallery({ path: signed.publicId, cloudinary: hostedFacts(hosted), caption: caption || undefined, pairId, pairRole });
    return { id: done.id, path: signed.publicId };
  } catch (e) {
    throw e?.code === "limit_reached" ? new ApiError("limit_reached", "limit_reached:gallery_photos") : e;
  }
};
const finalizeGallery = (body) => fn("seller-media-finalize", body);
export const updateGalleryCaption = async (ids, caption) => rows(need().from("gallery_photos").update({ caption: caption?.trim() || null }).in("id", ids));
// Delete is two steps so Undo works: hide now (deleted_at), remove for good when the Undo time runs out.
export const deleteGalleryPhotos = async (ids) => rows(need().from("gallery_photos").update({ deleted_at: new Date().toISOString() }).in("id", ids));
export const restoreGalleryPhotos = async (ids) => rows(need().from("gallery_photos").update({ deleted_at: null }).in("id", ids));
export const purgeGalleryPhotos = async (ids) => {
  await rows(need().from("gallery_photos").delete().in("id", ids).not("deleted_at", "is", null));
  await purgeRemoved();
};
export const reorderGallery = (ids) => rpc("seller_reorder_gallery", { p_ids: ids });

const staffMember = (r) => ({
  id: r.id, name: r.name, role: r.role ?? null, specialties: r.specialties ?? [], photoPath: r.photo_path ?? null, sort: r.sort ?? 0, socials: r.socials ?? {},
  serviceIds: (r.staff_services ?? []).map((x) => x.item_id), adminState: adminState(r), adminReason: r.admin_hide_reason ?? r.admin_reason ?? null,
});
export const listStaff = async () => (await rows(need().from("staff_members").select("*, staff_services(item_id)").order("sort").order("created_at"))).map(staffMember);
export const uploadStaffPhoto = async (file) => {
  if (!PHOTO_EXT[file?.type]) throw new ApiError("unsupported_type");
  const signed = await signUpload({ purpose: "staff" });
  const hosted = await sendToCloudinary(signed, await shrinkIfHuge(file));
  await finalizeMedia({ path: signed.publicId, cloudinary: hostedFacts(hosted) });
  return { path: signed.publicId };
};
export const saveStaff = async (id, draft) => {
  const db = need();
  const businessId = (await rows(db.from("businesses").select("id").maybeSingle()))?.id;
  if (!businessId) throw new ApiError("not_a_seller");
  // Only the cleaned canonical links are stored (the database refuses anything else), so a bad one is explained here and nothing is sent.
  const socials = normalizeSocials(draft.socials);
  if (!socials.ok) throw new ApiError("invalid_staff");
  const fields = { name: draft.name.trim(), role: draft.role?.trim() || null, specialties: draft.specialties ?? [], photo_path: draft.photoPath ?? null, socials: socials.value };
  const row = id
    ? await rows(db.from("staff_members").update(fields).eq("id", id).select().single())
    : await rows(db.from("staff_members").insert({ ...fields, business_id: businessId }).select().single());
  if (draft.serviceIds) {
    const have = (await rows(db.from("staff_services").select("item_id").eq("staff_id", row.id))).map((x) => x.item_id);
    const drop = have.filter((x) => !draft.serviceIds.includes(x));
    const add = draft.serviceIds.filter((x) => !have.includes(x));
    if (drop.length) await rows(db.from("staff_services").delete().eq("staff_id", row.id).in("item_id", drop));
    if (add.length) await rows(db.from("staff_services").insert(add.map((item_id) => ({ staff_id: row.id, item_id, business_id: businessId }))));
  }
  // A replaced or removed picture is queued by the database; ask for it to be deleted now.
  if (id) await purgeRemoved();
  return { id: row.id };
};
export const deleteStaff = async (id) => {
  await rows(need().from("staff_members").delete().eq("id", id));
  await purgeRemoved();
};

const slot = (r) => ({
  id: r.id, dayOfWeek: r.day_of_week, startTime: String(r.start_time).slice(0, 5), endTime: String(r.end_time).slice(0, 5), className: r.class_name,
  staffId: r.staff_id ?? null, adminState: adminState(r), adminReason: r.admin_hide_reason ?? r.admin_reason ?? null,
});
export const listTimetable = async () => (await rows(need().from("timetable_slots").select("*").order("day_of_week").order("start_time"))).map(slot);
export const saveSlot = async (id, draft) => {
  const db = need();
  const fields = { day_of_week: Number(draft.dayOfWeek), start_time: draft.startTime, end_time: draft.endTime, class_name: draft.className.trim(), staff_id: draft.staffId || null };
  try {
    if (id) return slot(await rows(db.from("timetable_slots").update(fields).eq("id", id).select().single()));
    const businessId = (await rows(db.from("businesses").select("id").maybeSingle()))?.id;
    return slot(await rows(db.from("timetable_slots").insert({ ...fields, business_id: businessId }).select().single()));
  } catch (e) {
    throw /no_overlap/.test(e?.message ?? "") ? new ApiError("trainer_busy") : e;
  }
};
export const deleteSlot = async (id) => rows(need().from("timetable_slots").delete().eq("id", id));

// ---- Open values dictionary (A18, migration 0090) ----
// -> { kind, query, matches: [{id, kind, label, key, status, hex, tags, uses}], canAdd, addLabel }
export const findOptionValues = (kind, query = "", limit = 8) => rpc("seller_option_values", { p_kind: kind, p_query: query, p_limit: limit });
// -> { created, value }. A value is usable at once; a new one is queued for review.
export const addOptionValue = (kind, label, hex = null) => rpc("seller_add_option_value", { p_kind: kind, p_label: label, p_hex: hex });
// Replaces the dictionary links of one item: uses = [{ slot: "brand" | "spec" | "axis", valueId }]. Call after saveItem.
export const linkItemValues = (itemId, uses) => rpc("seller_link_item_values", { p_item: itemId, p_uses: uses });
