import { adminFn, audit, json, must, z, type AdminDeps } from "../_shared/adminKit.ts";
import { addCalendarMonth, eatToday, laterDate } from "../_shared/dates.ts";
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
  reason: z.string().trim().max(500).optional(),
  acknowledgeWarnings: z.boolean().default(false),
}).refine((b) => !!b.applicationId !== !!b.businessId, { message: "Send either applicationId or businessId", path: ["applicationId"] });

type Row = Record<string, any>;

const duplicateKey = (e: any) => e?.code === "23505" || /duplicate key/i.test(e?.message ?? "");

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

    if (action === "reject") {
      if (!reason) return json({ error: "reason_required" }, 400);
      const rejected = await must(d.db.from("payments").insert({
        business_id: biz?.id ?? null,
        application_id: app?.id ?? biz?.application_id ?? null,
        amount, plan_key: planKey, months, mpesa_code: mpesaCode, status: "rejected",
        submitted_at: now, reject_reason: reason,
      }).select("id").single());
      if (app) {
        await must(d.db.from("applications").update({ status: "approved", payment_code: null }).eq("id", app.id));
        await must(d.db.from("application_events").insert({ application_id: app.id, actor: "admin", type: "payment_rejected", data: { by: c.admin.user.id, reason, code: mpesaCode } }));
      }
      await audit(c, { action: "payment.reject", targetType: "payment", targetId: rejected.data.id, after: { status: "rejected", mpesaCode }, reason });
      return json({ ok: true, status: "rejected", paymentId: rejected.data.id });
    }

    const warnings: { code: string; message: string }[] = [];
    const dupes = await d.db.from("payments").select("id").eq("mpesa_code", mpesaCode).neq("status", "rejected");
    if (dupes.data?.length > 0) warnings.push({ code: "duplicate_mpesa_code", message: "This M-Pesa code is already recorded on another payment." });
    if (amount !== unit * months) warnings.push({ code: "amount_differs", message: `Expected KES ${unit * months} for ${months} month(s), received KES ${amount}.` });
    if (warnings.length && !acknowledgeWarnings) return json({ ok: false, requiresAcknowledgement: true, warnings }, 409);

    const receipt = (await d.db.rpc("next_rct_no")).data;
    if (typeof receipt !== "string") throw new Error("receipt_failed");

    if (biz) {
      const start = laterDate(today, biz.paid_until ?? today);
      const paidUntil = addCalendarMonth(start, months);
      const pay = await must(d.db.from("payments").insert({
        business_id: biz.id, application_id: biz.application_id ?? null,
        amount, plan_key: planKey, months, mpesa_code: mpesaCode, status: "confirmed",
        period_start: start, period_end: paidUntil, submitted_at: now,
        confirmed_by: c.admin.user.id, confirmed_at: now, receipt_no: receipt,
      }).select("id").single());
      const upd = await d.db.from("businesses").update({ paid_until: paidUntil }).eq("id", biz.id);
      if (upd.error) {
        await d.db.from("payments").delete().eq("id", pay.data.id);
        throw new Error("renewal_failed");
      }
      await audit(c, {
        action: "payment.confirm", targetType: "payment", targetId: pay.data.id,
        before: { paid_until: biz.paid_until ?? null }, after: { receiptNo: receipt, kind: "renewal", paid_until: paidUntil, businessId: biz.id },
        reason: reason ?? null,
      });
      return json({ ok: true, kind: "renewal", businessId: biz.id, paymentId: pay.data.id, receiptNo: receipt, paidUntil, warnings });
    }

    const a = app!;
    const paidUntil = addCalendarMonth(today, months);
    const slotRows = (await d.db.from("application_documents").select("slot_key").eq("application_id", a.id)).data ?? [];
    const profile = {
      ownerName: a.owner_full_name,
      registered: a.registered,
      regType: a.reg_type ?? null,
      yearEstablished: a.year_established,
      website: a.website ?? null,
      altPhone: a.alt_phone ?? null,
      businessPhones: a.business_phones ?? [],
      templateValues: a.template_values ?? {},
      conditionalDocs: a.conditional_docs ?? {},
      documentSlots: slotRows.map((r: Row) => r.slot_key),
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
        application_id: a.id, slug, seller_id: sellerId, owner_user_id: userId, owner_name: a.owner_full_name,
        category_id: a.category_id, plan_key: a.plan_key, monthly_price: unit, name: a.business_name,
        description: a.short_description ?? null, status: "live", paid_until: paidUntil, first_paid_at: now,
        verification_level: a.verification_level, phone: a.business_phones?.[0] ?? a.phone, whatsapp: a.whatsapp ?? null,
        email: a.email, county: a.county, town: a.town, address: a.address, lat: a.lat, lng: a.lng,
        socials: a.socials ?? {}, profile, must_change_password: true,
      }).select("id").single();
      if (inserted.error || !inserted.data?.id) {
        await d.db.auth.admin.deleteUser(userId);
        if (duplicateKey(inserted.error)) continue;
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

    let paymentId: string | undefined;
    try {
      const pay = await must(d.db.from("payments").insert({
        business_id: created.businessId, application_id: a.id,
        amount, plan_key: planKey, months, mpesa_code: mpesaCode, status: "confirmed",
        period_start: today, period_end: paidUntil, submitted_at: now,
        confirmed_by: c.admin.user.id, confirmed_at: now, receipt_no: receipt,
      }).select("id").single());
      paymentId = pay.data.id;
      await must(d.db.from("applications").update({ status: "activated", seller_id: created.sellerId, payment_code: a.payment_code ?? mpesaCode }).eq("id", a.id));
    } catch (e) {
      await undo(paymentId);
      throw e;
    }

    await must(d.db.from("application_events").insert({
      application_id: a.id, actor: "admin", type: "activated",
      data: { by: c.admin.user.id, businessId: created.businessId, sellerId: created.sellerId, receiptNo: receipt, paidUntil },
    }));
    await must(d.db.from("messages").insert(
      [{ channel: "sms", to: a.phone }, { channel: "email", to: a.email }].map((m) => ({
        application_id: a.id, business_id: created!.businessId, channel: m.channel, template_key: "welcome", to_address: m.to,
        subject: m.channel === "email" ? "Welcome to EpicMKT" : null,
        body: `Welcome to EpicMKT, ${a.business_name}! Your business page is live until ${paidUntil}. Log in with your Seller ID to add your items.`,
        status: "queued", transactional: true, scheduled_at: now, created_by: c.admin.user.id,
        dedupe_key: `welcome:${created!.businessId}:${m.channel}`,
      })),
    ));
    await audit(c, {
      action: "payment.confirm", targetType: "payment", targetId: paymentId!,
      after: { receiptNo: receipt, kind: "activation", paid_until: paidUntil, businessId: created.businessId }, reason: reason ?? null,
    });
    await audit(c, {
      action: "business.activate", targetType: "business", targetId: created.businessId,
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
      temporaryPassword: created.password, paidUntil, paymentId, receiptNo: receipt, smsSent, warnings,
    });
  });
