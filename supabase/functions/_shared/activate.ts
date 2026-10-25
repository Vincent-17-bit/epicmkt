import { must, queueMessages, type AdminDeps } from "./adminKit.ts";
import { addCalendarMonth, eatToday, formatDay, nairobiMidnight } from "./dates.ts";
import { uniqueSlug } from "./ids.ts";
import { sellerEmail } from "./seller.ts";
import { escapeHtml } from "./http.ts";

type Row = Record<string, any>;
type AuditRow = { action: string; targetType: string; targetId: string; businessId?: string | null; before?: unknown; after?: unknown; reason?: string | null };

export type Activation = {
  app: Row;
  mpesaCode: string;
  amount: number;
  months: number;
  unit: number;
  actorId: string | null;
  audit: (row: AuditRow) => Promise<void>;
  reason?: string | null;
};

const isDuplicate = (e: any) => e?.code === "23505" || /duplicate key/i.test(e?.message ?? "");

export async function activateApplication(d: AdminDeps, o: Activation) {
  const { app: a, mpesaCode, amount, months, unit, actorId } = o;
  const now = d.now().toISOString();
  const today = eatToday(d.now());
  const paidUntil = addCalendarMonth(today, months);
  const via = actorId ? "admin" : "auto";
  const profile = {
    yearEstablished: a.year_established,
    registered: a.registered,
    website: a.website ?? null,
    businessPhones: a.business_phones ?? [],
    templateValues: a.template_values ?? {},
  };

  let created: { userId: string; sellerId: string; password: string; slug: string; businessId: string } | null = null;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    const slug = await uniqueSlug(a.business_name, async (s) => !!(await d.db.from("businesses").select("id").eq("slug", s).maybeSingle()).data);
    const sellerId = d.sellerId();
    const password = d.password();
    const user = await d.db.auth.admin.createUser({
      email: sellerEmail(sellerId), password, email_confirm: true,
      user_metadata: { must_change_password: true, seller_id: sellerId },
    });
    if (user.error || !user.data?.user?.id) throw new Error("auth_user_failed");
    const userId = user.data.user.id as string;
    const inserted = await d.db.from("businesses").insert({
      application_id: a.id, slug, seller_id: sellerId, user_id: userId, owner_name: a.owner_full_name,
      category_id: a.category_id, plan_key: a.plan_key, monthly_price: unit, name: a.business_name,
      description: a.short_description ?? null, status: "live", paid_until: nairobiMidnight(paidUntil), first_paid_at: now,
      verification_level: a.verification_level, phone: a.business_phones?.[0] ?? a.phone, whatsapp: a.whatsapp ?? null,
      email: a.email, county: a.county, town: a.town, address: a.address, lat: a.lat, lng: a.lng,
      socials: a.socials ?? {}, profile, must_change_password: true,
    }).select("id").single();
    if (inserted.error || !inserted.data?.id) {
      await d.db.auth.admin.deleteUser(userId);
      if (isDuplicate(inserted.error)) continue;
      throw new Error("business_insert_failed");
    }
    created = { userId, sellerId, password, slug, businessId: inserted.data.id };
  }
  if (!created) throw new Error("activation_failed");

  const undo = async (paymentId?: string) => {
    if (paymentId) await d.db.from("payments").delete().eq("id", paymentId);
    await d.db.from("businesses").delete().eq("id", created!.businessId);
    await d.db.auth.admin.deleteUser(created!.userId);
  };

  const first = await d.db.from("payments").insert({
    business_id: created.businessId, application_id: a.id, amount_kes: amount, plan_key: a.plan_key, category_id: a.category_id, months,
    mpesa_code: mpesaCode, source: via, confirmed_via: via, status: "confirmed", submitted_at: now, confirmed_by: actorId,
    kind: "first", period_start: today, period_end: paidUntil, phone: a.phone,
  }).select("id,receipt_no").single();
  if (first.error || !first.data?.id) {
    await undo();
    if (isDuplicate(first.error)) return { duplicate: true as const };
    throw new Error("db_failed");
  }
  const paymentId: string = first.data.id;
  const receiptNo: string = first.data.receipt_no;
  try {
    await must(d.db.from("applications").update({ status: "activated", seller_id: created.sellerId, payment_code: a.payment_code ?? mpesaCode }).eq("id", a.id));
  } catch (e) {
    await undo(paymentId);
    throw e;
  }

  try { await d.db.rpc("mpesa_settle_activation", { p_application: a.id, p_business: created.businessId, p_payment: paymentId, p_consumed: unit * months }); } catch (_) {}

  await must(d.db.from("application_events").insert({
    application_id: a.id, actor: actorId ? "admin" : "system", type: "activated",
    data: { by: actorId, businessId: created.businessId, sellerId: created.sellerId, receiptNo, paidUntil, auto: !actorId },
  }));
  await queueMessages(d, [{ channel: "sms", to: a.phone }, { channel: "email", to: a.email }].map((m) => ({
    application_id: a.id, business_id: created!.businessId, channel: m.channel, kind: "general", template_key: "welcome", to_address: m.to,
    subject: m.channel === "email" ? "Welcome to EpicMKT" : null,
    body: `Welcome to EpicMKT, ${a.business_name}! Your business page is live until ${formatDay(paidUntil)}. Log in with your Seller ID to add your items. Then add your email and choose your own password under Account.`,
    status: "queued", transactional: true, scheduled_at: now, created_by: actorId,
    dedupe_key: `welcome:${created!.businessId}:${m.channel}`,
  })));
  await o.audit({
    action: "payment.confirm", targetType: "payment", targetId: paymentId, businessId: created.businessId,
    after: { receiptNo, kind: "activation", paid_until: paidUntil, auto: !actorId }, reason: o.reason ?? null,
  });
  await o.audit({
    action: "business.activate", targetType: "business", targetId: created.businessId, businessId: created.businessId,
    after: { sellerId: created.sellerId, slug: created.slug, applicationId: a.id, auto: !actorId }, reason: null,
  });

  const text = `EpicMKT: your shop is live. Seller ID ${created.sellerId}, temporary password ${created.password}. Log in and change it now.`;
  let smsSent = false;
  try {
    smsSent = await d.sms(a.phone, text);
    await d.mail(a.email, "Your EpicMKT seller login", `<p>Your shop is live.</p><p>Seller ID: <b>${escapeHtml(created.sellerId)}</b><br>Temporary password: <b>${escapeHtml(created.password)}</b></p><p>Log in and change your password now.</p>`);
  } catch (_) {}

  return {
    duplicate: false as const, businessId: created.businessId, slug: created.slug, sellerId: created.sellerId,
    temporaryPassword: created.password, paidUntil, paymentId, receiptNo, smsSent,
  };
}

export type AutoResult = { activated: true; businessId: string; sellerId: string } | { activated: false; reason: string };

export async function autoActivate(d: AdminDeps, applicationId: string): Promise<AutoResult> {
  const found = await d.db.from("applications").select("*").eq("id", applicationId).maybeSingle();
  const app = found.data as Row | null;
  if (!app) return { activated: false, reason: "not_found" };
  if (!["approved", "payment_confirming"].includes(app.status)) return { activated: false, reason: "invalid_status" };

  const plan = (await d.db.from("plans").select("price_kes").eq("category_id", app.category_id).eq("plan_key", app.plan_key).maybeSingle()).data as Row | null;
  const category = (await d.db.from("categories").select("active").eq("id", app.category_id).maybeSingle()).data as Row | null;
  if (!plan || !category || category.active === false) return { activated: false, reason: "category_unavailable" };

  const unit: number = app.plan_snapshot?.priceOverride?.amount ?? plan.price_kes;
  if (!unit || unit <= 0) return { activated: false, reason: "not_priced" };
  const credit = Number(app.credit_kes ?? 0);
  if (credit < unit) return { activated: false, reason: "amount_short" };
  if (!app.payment_code) return { activated: false, reason: "no_payment_code" };

  const months = Math.max(1, Math.min(24, Math.floor(credit / unit)));
  const system = async (row: AuditRow) => {
    const r = await d.db.from("audit_log").insert({
      business_id: row.businessId ?? null, actor_id: null, actor_role: "system", actor_email: null, action: row.action,
      target_type: row.targetType, target_id: row.targetId, before: row.before ?? null, after: row.after ?? null, reason: row.reason ?? null,
    });
    if (r?.error) throw new Error("audit_failed");
  };
  const out = await activateApplication(d, { app, mpesaCode: app.payment_code, amount: unit * months, months, unit, actorId: null, audit: system, reason: "Paid in full, activated automatically" });
  if (out.duplicate) return { activated: false, reason: "duplicate_mpesa_code" };
  return { activated: true, businessId: out.businessId, sellerId: out.sellerId };
}
