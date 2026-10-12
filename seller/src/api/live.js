import { supabase } from "./client.js";
import { ApiError } from "./errors.js";
import * as shape from "./shape.js";
import { checkProofBatch, checkReply } from "@epicmkt/shared";

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
export const itemSignals = () => rpc("seller_item_signals");
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
export const submitPayment = async ({ code, purpose = null, targetPlan = null, category = null, changeId = null }) =>
  shape.payment(await rpc("seller_submit_payment", { p_code: code, p_purpose: purpose, p_target_plan: targetPlan, p_category: category, p_change_id: changeId }));
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

const TABLES = ["payments", "businesses", "messages", "flags", "flag_attachments"];
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
