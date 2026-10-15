import { json, readJson, wrap, z } from "../_shared/seller.ts";
import { writeAudit } from "../_shared/audit.ts";
import { chunk, fmtDay, isResponse, renderTemplate, requireRole, type OutboundDeps } from "../_shared/outbound.ts";

// Queues messages from an admin to sellers (or to one applicant). Nothing is sent here: rows land in `messages`
// as 'queued' and dispatch-messages delivers them, holding promotional SMS/email back during quiet hours.
//
// Promotional is the default (transactional: false) so an admin who forgets the flag cannot wake sellers at night.
// Mark billing or account notices transactional (or use a template that is) to send them at any hour.

export const MAX_RECIPIENTS = 500;
export const SMS_MAX = 612; // four SMS segments

const Body = z.object({
  target: z.object({
    businessIds: z.array(z.string().uuid()).min(1).max(MAX_RECIPIENTS).optional(),
    segment: z.string().trim().min(1).max(80).optional(),
    applicationId: z.string().uuid().optional(),
  }).refine((t) => [t.businessIds, t.segment, t.applicationId].filter(Boolean).length === 1, "exactly_one_target"),
  channels: z.object({
    sms: z.boolean().default(false),
    email: z.boolean().default(false),
    inApp: z.boolean().default(false),
  }).refine((c) => c.sms || c.email || c.inApp, "channel_required"),
  templateKey: z.string().trim().min(2).max(60).optional(),
  subject: z.string().trim().min(1).max(150).optional(),
  body: z.string().trim().min(1).max(4000).optional(),
  lang: z.enum(["en", "sw"]).default("en"),
  variables: z.record(z.string().max(500)).default({}),
  scheduledAt: z.string().datetime().optional(),
  transactional: z.boolean().optional(),
  preview: z.boolean().default(false),
  // Safe retries: the same key never queues the same message to the same recipient twice.
  idempotencyKey: z.string().trim().regex(/^[A-Za-z0-9-]{8,80}$/).optional(),
}).refine((v) => !!(v.templateKey || v.body), "content_required");

type Recipient = { kind: "business" | "application"; id: string; name: string; sellerId: string; phone: string | null; email: string | null; paidUntil: string | null };
type Channel = "sms" | "email" | "in_app";

export const adminMessage = (d: OutboundDeps) => wrap(async (req) => {
  const actor = await requireRole(req, d.db, ["owner", "reviewer", "support"]);
  if (isResponse(actor)) return actor;

  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "bad_request", issues: parsed.error.issues.map((i) => i.message) }, 422);
  const b = parsed.data;

  const channels: Channel[] = [b.channels.sms && "sms", b.channels.email && "email", b.channels.inApp && "in_app"].filter(Boolean) as Channel[];

  // Template
  let tpl: { subject: string | null; body: string; channel: string | null; transactional: boolean } | null = null;
  if (b.templateKey) {
    const { data } = await d.db.from("message_templates").select("key, channel, subject, body_en, body_sw, transactional").eq("key", b.templateKey).maybeSingle();
    if (!data) return json({ error: "unknown_template" }, 422);
    if (data.channel && channels.some((c) => c !== data.channel)) return json({ error: "template_channel_mismatch", channel: data.channel }, 422);
    tpl = { subject: data.subject, body: (b.lang === "sw" && data.body_sw) || data.body_en, channel: data.channel, transactional: data.transactional };
  }
  const bodyTemplate = b.body ?? tpl!.body;
  const subjectTemplate = b.subject ?? tpl?.subject ?? "A message from EpicMKT";
  const transactional = b.transactional ?? tpl?.transactional ?? false;

  // Recipients
  const recipients: Recipient[] = [];
  let notFound = 0;
  if (b.target.applicationId) {
    const { data } = await d.db.from("applications").select("id, business_name, phone, email").eq("id", b.target.applicationId).maybeSingle();
    if (!data) return json({ error: "application_not_found" }, 404);
    recipients.push({ kind: "application", id: data.id, name: data.business_name ?? "", sellerId: "", phone: data.phone ?? null, email: data.email ?? null, paidUntil: null });
  } else {
    let ids = b.target.businessIds ?? [];
    if (b.target.segment) {
      const seg = await d.db.rpc("message_segment", { p_segment: b.target.segment, p_now: d.now().toISOString() });
      if (seg.error) return json({ error: /unknown_segment/.test(seg.error.message ?? "") ? "unknown_segment" : "server_error" }, /unknown_segment/.test(seg.error.message ?? "") ? 422 : 500);
      ids = (seg.data ?? []) as string[];
      if (ids.length > MAX_RECIPIENTS) return json({ error: "too_many_recipients", count: ids.length, max: MAX_RECIPIENTS }, 422);
    }
    for (const part of chunk(ids, 100)) {
      const { data, error } = await d.db.from("businesses").select("id, name, seller_id, phone, email, paid_until").in("id", part).neq("status", "deleted");
      if (error) return json({ error: "server_error" }, 500);
      for (const r of data ?? []) recipients.push({ kind: "business", id: r.id, name: r.name, sellerId: r.seller_id, phone: r.phone ?? null, email: r.email ?? null, paidUntil: r.paid_until ?? null });
    }
    notFound = ids.length - recipients.length;
  }
  if (!recipients.length) return json({ error: "no_recipients" }, 422);

  // Idempotent retry
  if (b.idempotencyKey && !b.preview) {
    const dup = await d.db.from("messages").select("id").like("dedupe_key", `admin:${b.idempotencyKey}:%`).limit(1);
    if (dup.data?.length) return json({ ok: true, queued: 0, duplicate: true });
  }

  // Render one row per recipient and channel
  const now = d.now();
  const scheduled = b.scheduledAt && new Date(b.scheduledAt) > now ? new Date(b.scheduledAt) : now;
  const immediate = scheduled.getTime() <= now.getTime();
  const skipped = { sms: 0, email: 0, inApp: 0 };
  const rows: Record<string, unknown>[] = [];

  for (const r of recipients) {
    const vars = { business_name: r.name, seller_id: r.sellerId, paid_until: fmtDay(r.paidUntil), ...b.variables };
    const text = renderTemplate(bodyTemplate, vars);
    const subj = renderTemplate(subjectTemplate, vars);
    const missing = [...new Set([...text.missing, ...subj.missing])];
    if (missing.length) return json({ error: "missing_variables", missing }, 422);

    for (const channel of channels) {
      const to = channel === "sms" ? r.phone : channel === "email" ? r.email : null;
      if ((channel === "sms" || channel === "email") && !to) { skipped[channel]++; continue; }
      if (channel === "in_app" && r.kind === "application") { skipped.inApp++; continue; } // applicants have no inbox
      if (channel === "sms" && text.text.length > SMS_MAX) return json({ error: "sms_too_long", max: SMS_MAX, length: text.text.length }, 422);

      const deliverNow = channel === "in_app" && immediate; // in-app needs no provider
      rows.push({
        business_id: r.kind === "business" ? r.id : null,
        application_id: r.kind === "application" ? r.id : null,
        channel,
        kind: "general",
        template_key: b.templateKey ?? null,
        to_address: to,
        subject: subj.text.slice(0, 150) || "A message from EpicMKT",
        body: text.text,
        status: deliverNow ? "delivered" : "queued",
        provider_id: deliverNow ? "in_app" : null,
        sent_at: deliverNow ? now.toISOString() : null,
        transactional,
        scheduled_at: scheduled.toISOString(),
        // SMS/email rows are delivery records, not inbox items: keep them out of the seller's unread count.
        read_at: channel === "in_app" ? null : now.toISOString(),
        dedupe_key: b.idempotencyKey ? `admin:${b.idempotencyKey}:${r.id}:${channel}` : null,
        created_by: actor.userId,
      });
    }
  }

  const perChannel = { sms: 0, email: 0, inApp: 0 };
  for (const row of rows) perChannel[row.channel === "in_app" ? "inApp" : (row.channel as "sms" | "email")]++;

  if (b.preview) {
    const samples = rows.slice(0, 3).map((r) => ({ channel: r.channel, subject: r.subject, body: r.body }));
    return json({ ok: true, preview: true, recipients: recipients.length, rows: perChannel, skipped, notFound, transactional, scheduledAt: scheduled.toISOString(), samples });
  }
  if (!rows.length) return json({ error: "nothing_to_send", skipped, notFound }, 422);

  for (const part of chunk(rows, 200)) {
    const ins = await d.db.from("messages").insert(part);
    if (ins.error) {
      if (ins.error.code === "23505") return json({ ok: true, queued: 0, duplicate: true });
      return json({ error: "server_error" }, 500);
    }
  }

  await writeAudit(d.db, {
    actor: { id: actor.userId, email: actor.email },
    action: "message.queue",
    targetType: "message_batch",
    after: {
      target: b.target.applicationId ? "application" : b.target.segment ? `segment:${b.target.segment}` : "businesses",
      recipients: recipients.length, rows: perChannel, skipped, templateKey: b.templateKey ?? null,
      transactional, scheduledAt: scheduled.toISOString(),
    },
    req,
  });

  return json({ ok: true, queued: rows.length, rows: perChannel, skipped, notFound, transactional, scheduledAt: scheduled.toISOString() });
});
