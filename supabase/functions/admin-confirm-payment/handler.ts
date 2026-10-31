import { adminFn, audit, json, must, queueMessages, z, type AdminDeps } from "../_shared/adminKit.ts";
import { activateApplication } from "../_shared/activate.ts";
import { paymentConfirmed } from "../_shared/messages.ts";
import { addCalendarMonth, nairobiDay, nairobiMidnight, eatToday, formatDay, laterDate } from "../_shared/dates.ts";

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
      // The money received for this code stops counting toward the application (the ledger keeps the transaction).
      try { await d.db.rpc("mpesa_void_for_code", { p_code: mpesaCode, p_reason: reason }); } catch (_) { /* no M-Pesa transaction behind this code */ }
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
      const note = paymentConfirmed({ business: biz.name, amount, until: formatDay(paidUntil), receipt: pay.receipt_no });
      await queueMessages(d, [
        { channel: "sms", to_address: biz.phone, subject: null, text: note.sms },
        { channel: "email", to_address: biz.email, subject: note.subject, text: note.email },
        { channel: "in_app", to_address: null, subject: note.subject, text: note.inApp },
      ].map(({ text, ...m }) => ({
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

    const out = await activateApplication(d, {
      app: app!, mpesaCode, amount, months, unit, actorId: c.admin.user.id, reason,
      audit: (row) => audit(c, row),
    });
    if (out.duplicate) return duplicateCode();
    return json({
      ok: true, kind: "activation", businessId: out.businessId, slug: out.slug, sellerId: out.sellerId,
      temporaryPassword: out.temporaryPassword, paidUntil: out.paidUntil, paymentId: out.paymentId, receiptNo: out.receiptNo, smsSent: out.smsSent, warnings,
    });
  });
