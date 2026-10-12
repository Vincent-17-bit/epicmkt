import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { adminDb, requireAdmin } from "../_shared/admin.ts";
import { corsHeaders, json } from "../_shared/http.ts";

const schema = z.object({
  applicationId: z.string().uuid(),
  action: z.enum(["request_changes", "approve", "reject", "set_verification", "return_to_queue"]),
  reason: z.string().max(500).optional(),
  note: z.string().max(500).optional(),
  channels: z.object({
    sms: z.boolean().default(false),
    email: z.boolean().default(false),
    inApp: z.boolean().default(false),
  }).default({ sms: false, email: false, inApp: false }),
  verificationLevel: z.enum(["unverified", "verified"]).optional(),
  priceOverride: z.number().int().optional(),
  preview: z.boolean().default(false),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const db = await adminDb();
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return json({ error: "invalid_input", issues: parsed.error.issues }, 422);

    const { user, admin } = await requireAdmin(req, db);
    if (!["owner", "reviewer"].includes(admin.role)) return json({ error: "forbidden" }, 403);

    const { applicationId, action, reason, note, channels, verificationLevel, priceOverride, preview } = parsed.data;
    const appResult = await db.from("applications").select("id,status,reference_no,business_name,email,phone,plan_key,price_at_submission").eq("id", applicationId).maybeSingle();
    if (!appResult.data) return json({ error: "not_found" }, 404);

    const app = appResult.data;
    const messages = [] as string[];
    if (action === "request_changes") {
      if (!reason && !note) return json({ error: "reason_required" }, 422);
      await db.from("applications").update({ status: "changes_requested", admin_note: note ?? reason ?? null, reviewer_id: user.id, review_started_at: new Date().toISOString() }).eq("id", applicationId);
      messages.push(`Changes requested for ${app.reference_no}`);
    }
    if (action === "approve") {
      await db.from("applications").update({ status: "approved", verification_level: verificationLevel ?? app.verification_level ?? "unverified", reviewer_id: user.id, review_started_at: new Date().toISOString() }).eq("id", applicationId);
      messages.push(`Approved ${app.reference_no}`);
    }
    if (action === "reject") {
      if (!reason) return json({ error: "reason_required" }, 422);
      await db.from("applications").update({ status: "rejected", rejection_reason: reason, reviewer_id: user.id, review_started_at: new Date().toISOString() }).eq("id", applicationId);
      messages.push(`Rejected ${app.reference_no}`);
    }
    if (action === "set_verification") {
      const next = verificationLevel ?? "verified";
      await db.from("applications").update({ verification_level: next, reviewer_id: user.id }).eq("id", applicationId);
      messages.push(`Verification set to ${next}`);
    }
    if (action === "return_to_queue") {
      await db.from("applications").update({ status: "submitted", reviewer_id: null, review_started_at: null }).eq("id", applicationId);
      messages.push(`Returned ${app.reference_no} to queue`);
    }

    await db.from("application_events").insert({
      application_id: applicationId,
      actor: "admin",
      type: action,
      data: { by: user.id, reason: reason ?? null, note: note ?? null, channels, verificationLevel: verificationLevel ?? null, priceOverride: priceOverride ?? null },
    });

    await db.from("audit_log").insert({
      actor_id: user.id,
      actor_email: user.email,
      action: `application.${action}`,
      target_type: "application",
      target_id: applicationId,
      after: { status: action === "approve" ? "approved" : action === "reject" ? "rejected" : app.status },
      reason: reason ?? note ?? null,
    });

    if (preview) {
      return json({ ok: true, preview: { channels, messages, applicant: { email: app.email, phone: app.phone } } }, 200);
    }

    if (channels.sms || channels.email || channels.inApp) {
      await db.from("messages").insert({
        application_id: applicationId,
        channel: channels.sms ? "sms" : channels.email ? "email" : "in_app",
        to_address: channels.sms ? app.phone : app.email,
        subject: `EpicMKT: ${action}`,
        body: `${messages.join("; ")} ${reason ? `Reason: ${reason}` : ""}`.trim(),
        status: "queued",
        transactional: true,
        scheduled_at: new Date().toISOString(),
        created_by: user.id,
      });
    }

    return json({ ok: true, action, messages }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    if (message === "unauthorized") return json({ error: "unauthorized" }, 401);
    if (message === "forbidden") return json({ error: "forbidden" }, 403);
    return json({ error: message }, 500);
  }
});
