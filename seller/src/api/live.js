import { supabase } from "./client.js";
import { ApiError } from "./errors.js";
import * as shape from "./shape.js";
import { checkProofBatch, checkReply, flashQuota, flashTextProblem, isCloudinaryId, offerQuota } from "@epicmkt/shared";
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

// `identifier` is the seller's Seller ID, or their verified sign-in email.
export const login = async (identifier, password) => {
  const { session } = await fn("seller-login", { identifier, sellerId: identifier, password });
  const { error } = await need().auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  if (error) throw new ApiError("session_failed");
  return { expiresAt: session.expires_at };
};
export const logout = async () => { await need().auth.signOut(); };
// `channel` is where the code goes: "sms" (Africa's Talking, to the phone on the listing) or "email" (the verified sign-in email).
export const forgotRequest = ({ identifier, channel = "sms" }) => fn("seller-forgot-request", { identifier, sellerId: identifier, channel });
export const forgotVerify = ({ identifier, code, newPassword }) => fn("seller-forgot-verify", { identifier, sellerId: identifier, code, newPassword });
// A code to confirm a password change ("change_password", by `channel`), or to prove a new email is theirs ("verify_email", sent to `email`).
export const requestOtp = ({ purpose = "change_password", channel = "sms", email } = {}) =>
  fn("seller-otp-request", purpose === "verify_email" ? { purpose, email } : { purpose, channel });
export const changePassword = ({ code, newPassword }) => fn("seller-change-password", { code, newPassword });
// Saves the email the last "verify_email" code was sent to. Needs that code and the seller's current password.
export const setLoginEmail = ({ code, currentPassword }) => fn("seller-set-email", { code, currentPassword });
export const updateProfile = (patch) => rpc("seller_update_profile", { p_patch: patch });
export const setTimezone = (timezone) => rpc("seller_set_timezone", { p_timezone: timezone });
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
export const getMediaLimits = async () => {
  const sub = await getSubscription();
  const l = sub.limits[sub.business.planKey] ?? {};
  const cap = (n) => (n == null ? null : Number(n));
  return { photos: { used: 0, max: cap(l.photosPerItem) }, videos: { used: 0, max: cap(l.videosPerItem) } };
};
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

const TABLES = ["payments", "businesses", "messages", "message_attachments", "flags", "flag_attachments", "flash_sales"];
/** Row-level security applies to realtime, so a seller only ever receives their own rows. */
export const subscribe = (tables, onEvent) => {
  const client = need();
  const list = (tables?.length ? tables : TABLES).filter((t) => TABLES.includes(t));
  const channel = client.channel(`seller-${list.join("-")}-${Math.random().toString(36).slice(2, 8)}`);
  for (const table of list) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, (p) => onEvent({ table, type: p.eventType, row: p.new && Object.keys(p.new).length ? p.new : p.old }));
  }
  channel.subscribe();
  return () => { client.removeChannel(channel); };
};

// Weekly opening hours: { mon: ["08:00","18:00"], ... }. A day that is null or missing is closed; the database checks every rule
// and returns the hours it stored (open days only).
export const setHours = (hours) => rpc("seller_set_hours", { p_hours: hours });

// Opening-hours exceptions: [{ id, date: "YYYY-MM-DD", kind: "closed" | "special", intervals: [["09:00","13:00"]], note }]
export const listExceptions = async () => {
  const b = await rows(need().from("businesses").select("exceptions").maybeSingle());
  return b?.exceptions ?? [];
};
export const saveException = ({ id = null, date, kind, intervals = [], note = null }) =>
  rpc("seller_save_exception", { p_id: id, p_date: date, p_kind: kind, p_intervals: intervals, p_note: note });
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
export const bulkItems = (action, ids, args = {}) => rpc("seller_bulk_items", { p_action: action, p_ids: ids, p_args: args });
// 'sold_out' marks an item out of stock. 'restock' lists it again; a counted item needs its new count.
export const itemStock = (id, action, count = null) => rpc("seller_item_stock", { p_id: id, p_action: action, p_count: count });
export const reorderItems = (ids) => rpc("seller_reorder_items", { p_ids: ids });
export const duplicateItem = (id) => rpc("seller_duplicate_item", { p_id: id });
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
export const createFlashSale = async ({ itemId, discountType, discountValue, startsAt, endsAt, headline, quantityNote, afterEnd }) => {
  const business = await flashRows(need().from("businesses").select("id").maybeSingle());
  if (!business) throw new ApiError("not_a_seller");
  const row = await flashRows(need().from("flash_sales").insert({
    business_id: business.id, item_id: itemId, discount_type: discountType, discount_value: discountValue, starts_at: startsAt ?? new Date().toISOString(),
    ends_at: endsAt, headline: headline || null, quantity_note: quantityNote || null, after_end: afterEnd,
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
