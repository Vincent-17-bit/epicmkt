import { adminFn, audit, json, must, z, type AdminDeps } from "../_shared/adminKit.ts";

const Body = z.object({
  applicationId: z.string().uuid(),
  action: z.enum(["request_changes", "approve", "reject", "set_verification", "return_to_queue"]),
  reason: z.string().trim().max(500).optional(),
  note: z.string().trim().max(1000).optional(),
  channels: z.object({
    sms: z.boolean().default(false),
    email: z.boolean().default(false),
    inApp: z.boolean().default(false),
  }).default({}),
  verificationLevel: z.enum(["unverified", "verified"]).optional(),
  priceOverride: z.number().int().min(0).max(100000).optional(),
  preview: z.boolean().default(false),
});

type Action = z.infer<typeof Body>["action"];

const FROM: Record<Action, string[]> = {
  request_changes: ["submitted", "under_review"],
  approve: ["submitted", "under_review"],
  reject: ["submitted", "under_review", "changes_requested"],
  set_verification: ["submitted", "under_review", "changes_requested", "approved"],
  return_to_queue: ["under_review"],
};

type Mpesa = { type?: string; number?: string; name?: string; account?: string };

// Paybill: the account number is the application reference (a short code that is unique to this applicant, so two shops
// with the same name can never be confused). The payment is recognised automatically; nobody sends a code.
const payTo = (m: Mpesa, ref: string) =>
  m.type === "paybill"
    ? `Paybill ${m.number}, Account ${ref}`
    : `Till ${m.number}${m.name ? ` (${m.name})` : ""}`;

const bad = (error: string) => json({ error }, 400);

export const adminDecideApplication = (d: AdminDeps) =>
  adminFn(d, { name: "decide", roles: ["owner", "reviewer"], max: 60, seconds: 60, schema: Body }, async (c) => {
    const { applicationId, action, reason, note, channels, verificationLevel, priceOverride, preview } = c.input;
    const now = d.now().toISOString();

    const found = await d.db.from("applications")
      .select("id,status,reference_no,business_name,email,phone,price_at_submission,plan_snapshot,verification_level,admin_note,review_started_at")
      .eq("id", applicationId).maybeSingle();
    const app = found.data;
    if (!app) return json({ error: "not_found" }, 404);
    if (!FROM[action].includes(app.status)) return json({ error: "invalid_status", status: app.status }, 409);

    let patch: Record<string, unknown> = {};
    let next: string = app.status;
    let text = "";
    let subject = "";
    const ref = app.reference_no;

    if (action === "request_changes") {
      const flags = await d.db.from("application_flags").select("id").eq("application_id", applicationId).eq("status", "open");
      if (!note && !(flags.data?.length > 0)) return bad("flag_or_note_required");
      next = "changes_requested";
      patch = { status: next, admin_note: note ?? null, reviewer_id: c.admin.user.id, review_started_at: app.review_started_at ?? now };
      subject = `Changes needed on your EpicMKT application ${ref}`;
      text = `EpicMKT: changes are needed on your application ${ref}. ${note ? `${note} ` : ""}Open your status page to fix them.`;
    }

    if (action === "reject") {
      if (!reason) return bad("reason_required");
      next = "rejected";
      patch = { status: next, rejection_reason: reason, reviewer_id: c.admin.user.id };
      subject = `Your EpicMKT application ${ref}`;
      text = `EpicMKT: your application ${ref} was not approved. Reason: ${reason}`;
    }

    if (action === "approve") {
      if (priceOverride !== undefined && !reason) return bad("override_reason_required");
      const setting = await d.db.from("site_settings").select("value").eq("key", "mpesa").maybeSingle();
      const mpesa = (setting.data?.value ?? {}) as Mpesa;
      if (!mpesa.number) return json({ error: "mpesa_not_configured" }, 409);
      const amount = priceOverride ?? app.price_at_submission;
      // Someone may have paid before the approval. Their money is already credited on the application.
      const alreadyPaid = Number(app.credit_kes ?? 0) >= amount;
      next = alreadyPaid ? "payment_confirming" : "approved";
      patch = {
        status: next,
        verification_level: verificationLevel ?? app.verification_level,
        reviewer_id: c.admin.user.id,
        review_started_at: app.review_started_at ?? now,
      };
      if (priceOverride !== undefined) {
        patch.plan_snapshot = { ...(app.plan_snapshot ?? {}), priceOverride: { amount: priceOverride, reason, by: c.admin.user.id, at: now } };
      }
      subject = `Your EpicMKT application ${ref} is approved`;
      text = alreadyPaid
        ? `EpicMKT: ${app.business_name} is approved and your payment is received. We are confirming it and will send your login shortly.`
        : `EpicMKT: ${app.business_name} is approved. Pay KES ${amount} to M-Pesa ${payTo(mpesa, ref)}. We recognise your payment automatically, no code needed. You may pay several months at once.`;
    }

    if (action === "set_verification") {
      if (!verificationLevel) return bad("verification_level_required");
      patch = { verification_level: verificationLevel, reviewer_id: c.admin.user.id };
      subject = `Verification update for ${ref}`;
      text = `EpicMKT: the verification level of your application ${ref} is now ${verificationLevel}.`;
    }

    if (action === "return_to_queue") {
      next = "submitted";
      patch = { status: next, reviewer_id: null, review_started_at: null };
      subject = `Your EpicMKT application ${ref}`;
      text = `EpicMKT: your application ${ref} is back in the review queue.`;
    }

    const outbox: { channel: "sms" | "email"; to: string | null; subject: string | null; body: string }[] = [];
    if (channels.sms) outbox.push({ channel: "sms", to: app.phone, subject: null, body: text });
    if (channels.email) outbox.push({ channel: "email", to: app.email, subject, body: text });

    if (preview) {
      const messages = Object.fromEntries(outbox.map((m) => [m.channel, { to: m.to, subject: m.subject, body: m.body }]));
      return json({ ok: true, preview: true, action, nextStatus: next, messages });
    }

    await must(d.db.from("applications").update(patch).eq("id", applicationId));
    await must(d.db.from("application_events").insert({
      application_id: applicationId,
      actor: "admin",
      type: action,
      data: {
        by: c.admin.user.id,
        reason: reason ?? null,
        note: note ?? null,
        channels,
        verificationLevel: verificationLevel ?? null,
        priceOverride: priceOverride ?? null,
        from: app.status,
        to: next,
      },
    }));
    if (outbox.length) {
      await must(d.db.from("messages").insert(outbox.map((m) => ({
        application_id: applicationId,
        channel: m.channel,
        kind: action === "approve" ? "approval" : "general",
        template_key: `application.${action}`,
        to_address: m.to,
        subject: m.subject,
        body: m.body,
        status: "queued",
        transactional: true,
        scheduled_at: now,
        created_by: c.admin.user.id,
      }))));
    }
    await audit(c, {
      action: `application.${action}`,
      targetType: "application",
      targetId: applicationId,
      before: { status: app.status, verification_level: app.verification_level },
      after: { status: next, verification_level: (patch.verification_level as string | undefined) ?? app.verification_level, priceOverride: priceOverride ?? null },
      reason: reason ?? note ?? null,
    });

    return json({ ok: true, action, status: next, queued: outbox.map((m) => m.channel) });
  });
