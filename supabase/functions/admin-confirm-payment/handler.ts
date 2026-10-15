import { adminFn, audit, json, must, queueMessages, z, type AdminDeps } from "../_shared/adminKit.ts";
import { addCalendarMonth, nairobiDay, nairobiMidnight, eatToday, formatDay, laterDate } from "../_shared/dates.ts";
import { uniqueSlug } from "../_shared/ids.ts";
import { sellerEmail } from "../_shared/seller.ts";
import { escapeHtml } from "../_shared/http.ts";

const Body = z.object({
  applicationId: z.string().uuid().optional(),
  businessId: z.string().uuid().optional(),
  mpesaCode: z.string().trim().transform((s) => s.toUpperCase()).pipe(z.string().regex(/^[A-Z0-9]{10}$/, "Use the 10-character M-Pesa code")),
  amount: z.number().int().positive(),
  months: z.number().int().min(1).max(24).default(1),
  action: z.enum(["confirm", "reject"]),
  reason: z.string().trim().max(300).optional(),
  acknowledgeWarnings: z.boolean().default(false),
}).refine((b) => !!b.applicationId !== !!b.businessId, { message: "Send either applicationId or businessId", path: ["applicationId"] });

type Row = Record<string, any>;

const isDuplicate = (e: any) => e?.code === "23505" || /duplicate key/i.test(e?.message ?? "");

const duplicateCode = () => json({
  error: "duplicate_mpesa_code",
  warnings: [{ code: "duplicate_mpesa_code", message: "This M-Pesa code is already recorded on another payment." }],
}, 409);

export const adminConfirmPayment = (d: AdminDeps) =>
  adminFn(d, { name: "confirm-payment", roles: ["owner", "finance"], max: 30, seconds: 60, schema: Body }, async (c) => {
    const { applicationId, businessId, mpesaCode, amount, months, action, reason, acknowledgeWarnings } = c.input;
    const now = d.now().toISOString();
    const today = eatToday(d.now());

    let app: Row | null = null;
    let biz: Row | null = null;
    if (applicationId) {
      app = (await d.db.from("applications").select("*").eq("id", applicationId).maybeSingle()).data;
      if (!app) return json({ error: "not_found" }, 404);
      if (!["approved", "payment_confirming"].includes(app.status)) return json({ error: "invalid_status", status: app.status }, 409);
    } else {
      biz = (await d.db.from("businesses").select("*").eq("id", businessId).maybeSingle()).data;
      if (!biz || biz.status === "deleted") return json({ error: "not_found" }, 404);
    }

    const unit: number = app ? (app.plan_snapshot?.priceOverride?.amount ?? app.price_at_submission) : biz!.monthly_price;
    const planKey: string = app ? app.plan_key : biz!.plan_key;
    const categoryId: string = app ? app.category_id : biz!.category_id;
    const target = { business_id: biz?.id ?? null, application_id: app?.id ?? biz?.application_id ?? null };

    if (action === "reject") {
      if (!reason) return json({ error: "reason_required" }, 400);
      const rejected = await must(d.db.from("payments").insert({
        ...target, amount_kes: amount, plan_key: planKey, category_id: categoryId, months, mpesa_code: mpesaCode,
        kind: app ? "first" : "renewal", source: "admin", status: "rejected", decline_reason: reason, submitted_at: now,
      }).select("id").single());
      if (app) {
        await must(d.db.from("applications").update({ status: "approved", payment_code: null }).eq("id", app.id));
        await must(d.db.from("application_events").insert({ application_id: app.id, actor: "admin", type: "payment_rejected", data: { by: c.admin.user.id, reason, code: mpesaCode } }));
      }
      await audit(c, { action: "payment.reject", targetType: "payment", targetId: rejected.data.id, businessId: biz?.id, after: { status: "rejected", mpesaCode }, reason });
      return json({ ok: true, status: "rejected", paymentId: rejected.data.id });
    }

    const warnings: { code: string; message: string }[] = [];
    const dupes = await d.db.from("payments").select("id").eq("mpesa_code", mpesaCode).neq("status", "rejected");
    if (dupes.data?.length > 0) return duplicateCode();
    if (amount !== unit * months) warnings.push({ code: "amount_differs", message: `Expected KES ${unit * months} for ${months} month(s), received KES ${amount}.` });
    if (warnings.length && !acknowledgeWarnings) return json({ ok: false, requiresAcknowledgement: true, warnings }, 409);

    const confirmed = (extra: Row) => ({
      ...target, amount_kes: amount, plan_key: planKey, category_id: categoryId, months, mpesa_code: mpesaCode,
      source: "admin", confirmed_via: "admin", status: "confirmed", submitted_at: now, confirmed_by: c.admin.user.id, ...extra,
    });

    if (biz) {
      const start = laterDate(today, nairobiDay(biz.paid_until ?? now));
      const paidUntil = addCalendarMonth(start, months);
      const oldPaidUntil = biz.paid_until ? nairobiDay(biz.paid_until) : null;
      const inserted = await d.db.from("payments").insert(confirmed({ kind: "renewal", period_start: start, period_end: paidUntil })).select("id,receipt_no").single();
      if (inserted.error) {
        if (isDuplicate(inserted.error)) return duplicateCode();
        throw new Error("db_failed");
      }
      const pay = inserted.data;
      const upd = await d.db.from("businesses").update({ paid_until: nairobiMidnight(paidUntil), status: ["pending", "expired"].includes(biz.status) ? "live" : biz.status }).eq("id", biz.id);
      if (upd.error) {
        await d.db.from("payments").delete().eq("id", pay.id);
        throw new Error("renewal_failed");
      }
      const text = `EpicMKT: payment received (KES ${amount}). Your listing is paid until ${formatDay(paidUntil)}. Receipt ${pay.receipt_no}.`;
      await queueMessages(d, [
        { channel: "sms", to_address: biz.phone, subject: null },
        { channel: "email", to_address: biz.email, subject: "Payment received" },
        { channel: "in_app", to_address: null, subject: "Payment received" },
      ].map((m) => ({
        ...m, business_id: biz!.id, application_id: biz!.application_id ?? null, kind: "payment", template_key: "payment_received",
        body: text, status: m.channel === "in_app" ? "delivered" : "queued", transactional: true, scheduled_at: now, created_by: c.admin.user.id,
        data: { payment_id: pay.id, receipt_no: pay.receipt_no, paid_until: paidUntil }, dedupe_key: `payment:${pay.id}:${m.channel}`,
      })));
      await audit(c, {
        action: "payment.confirm", targetType: "payment", targetId: pay.id, businessId: biz.id,
        before: { paid_until: oldPaidUntil }, after: { receiptNo: pay.receipt_no, kind: "renewal", paid_until: paidUntil }, reason: reason ?? null,
      });
      return json({ ok: true, kind: "renewal", businessId: biz.id, paymentId: pay.id, receiptNo: pay.receipt_no, paidUntil, warnings });
    }

    const a = app!;
    const paidUntil = addCalendarMonth(today, months);
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

    let paymentId: string;
    let receiptNo: string;
    const first = await d.db.from("payments").insert(confirmed({
      business_id: created.businessId, application_id: a.id, kind: "first", period_start: today, period_end: paidUntil, phone: a.phone,
    })).select("id,receipt_no").single();
    if (first.error || !first.data?.id) {
      await undo();
      if (isDuplicate(first.error)) return duplicateCode();
      throw new Error("db_failed");
    }
    paymentId = first.data.id;
    receiptNo = first.data.receipt_no;
    try {
      await must(d.db.from("applications").update({ status: "activated", seller_id: created.sellerId, payment_code: a.payment_code ?? mpesaCode }).eq("id", a.id));
    } catch (e) {
      await undo(paymentId);
      throw e;
    }

    await must(d.db.from("application_events").insert({
      application_id: a.id, actor: "admin", type: "activated",
      data: { by: c.admin.user.id, businessId: created.businessId, sellerId: created.sellerId, receiptNo, paidUntil },
    }));
    await queueMessages(d, [{ channel: "sms", to: a.phone }, { channel: "email", to: a.email }].map((m) => ({
      application_id: a.id, business_id: created!.businessId, channel: m.channel, kind: "general", template_key: "welcome", to_address: m.to,
      subject: m.channel === "email" ? "Welcome to EpicMKT" : null,
      body: `Welcome to EpicMKT, ${a.business_name}! Your business page is live until ${formatDay(paidUntil)}. Log in with your Seller ID to add your items.`,
      status: "queued", transactional: true, scheduled_at: now, created_by: c.admin.user.id,
      dedupe_key: `welcome:${created!.businessId}:${m.channel}`,
    })));
    await audit(c, {
      action: "payment.confirm", targetType: "payment", targetId: paymentId, businessId: created.businessId,
      after: { receiptNo, kind: "activation", paid_until: paidUntil }, reason: reason ?? null,
    });
    await audit(c, {
      action: "business.activate", targetType: "business", targetId: created.businessId, businessId: created.businessId,
      after: { sellerId: created.sellerId, slug: created.slug, applicationId: a.id }, reason: null,
    });

    const text = `EpicMKT: your shop is live. Seller ID ${created.sellerId}, temporary password ${created.password}. Log in and change it now.`;
    let smsSent = false;
    try {
      smsSent = await d.sms(a.phone, text);
      await d.mail(a.email, "Your EpicMKT seller login", `<p>Your shop is live.</p><p>Seller ID: <b>${escapeHtml(created.sellerId)}</b><br>Temporary password: <b>${escapeHtml(created.password)}</b></p><p>Log in and change your password now.</p>`);
    } catch (_) {}

    return json({
      ok: true, kind: "activation", businessId: created.businessId, slug: created.slug, sellerId: created.sellerId,
      temporaryPassword: created.password, paidUntil, paymentId, receiptNo, smsSent, warnings,
    });
  });
