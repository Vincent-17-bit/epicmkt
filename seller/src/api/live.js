import { supabase } from "./client.js";
import { ApiError } from "./errors.js";
import * as shape from "./shape.js";
import { checkProofBatch, checkReply, flashQuota } from "@epicmkt/shared";

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
export const finalizeMedia = ({ itemId, path }) => fn("seller-media-finalize", { itemId, path });
export const exportData = () => fn("seller-export-data", {});

export const getSubscription = async () => {
  const b = await rows(need().from("businesses").select("*").maybeSingle());
  if (!b) throw new ApiError("not_a_seller");
  const [cat, plans, limits] = await Promise.all([
    rows(need().from("categories").select("id, name").eq("id", b.category_id).maybeSingle()),
    rows(need().from("plans").select("*").eq("category_id", b.category_id)),
    rows(need().from("global_limits").select("*").eq("id", 1).maybeSingle()),
  ]);
  return {
    business: { ...shape.business(b), categoryName: cat?.name ?? b.category_id },
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
  return (await rows(q)).map(shape.message);
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

const TABLES = ["payments", "businesses", "messages", "flags", "flag_attachments", "flash_sales"];
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
});
export const saveItem = async (id, fields) => {
  const business = await rows(need().from("businesses").select("id").maybeSingle());
  if (!business) throw new ApiError("not_a_seller");
  if (id) {
    const row = await rows(need().from("items").update(itemRow(fields)).eq("id", id).select("id").maybeSingle());
    if (!row) throw new ApiError("item_not_found");
    return row.id;
  }
  return (await rows(need().from("items").insert({ ...itemRow(fields), business_id: business.id, draft: true, visible: false }).select("id").single())).id;
};
export const bulkItems = (action, ids, args = {}) => rpc("seller_bulk_items", { p_action: action, p_ids: ids, p_args: args });
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
export const updateFlashSale = async (id, { headline, quantityNote }) =>
  shape.flashSale(await flashRows(need().from("flash_sales").update({ headline: headline || null, quantity_note: quantityNote || null }).eq("id", id).select("*, items(name, price)").single()));
export const endFlashSale = async (id) => {
  const { error } = await need().rpc("seller_end_flash_sale", { p_id: id });
  if (error) throw flashFail(error);
  return true;
};
