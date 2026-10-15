import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { adminDb, requireAdmin } from "../_shared/admin.ts";
import { corsHeaders, json } from "../_shared/http.ts";

const schema = z.object({
  target: z.object({
    businessIds: z.array(z.string().uuid()).optional(),
    segment: z.string().optional(),
    applicationId: z.string().uuid().optional(),
  }).refine((v) => !!(v.businessIds?.length || v.segment || v.applicationId), "target_required"),
  channels: z.object({ sms: z.boolean().default(false), email: z.boolean().default(false), inApp: z.boolean().default(false) }).default({ sms: false, email: false, inApp: false }),
  templateKey: z.string().optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
  scheduledAt: z.string().datetime().optional(),
  transactional: z.boolean().default(true),
  preview: z.boolean().default(false),
  variables: z.record(z.string()).default({}),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const db: any = await adminDb();
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return json({ error: "invalid_input", issues: parsed.error.issues }, 422);

    const { user, admin } = await requireAdmin(req, db);
    if (!["owner", "reviewer", "support"].includes(admin.role)) return json({ error: "forbidden" }, 403);

    const { target, channels, templateKey, subject, body: messageBody, scheduledAt, transactional, preview, variables } = parsed.data;
    const rows = [] as any[];
    for (const businessId of target.businessIds ?? []) {
      rows.push({
        business_id: businessId,
        channel: channels.sms ? "sms" : channels.email ? "email" : "in_app",
        subject: subject ?? templateKey ?? "Message",
        body: messageBody ?? JSON.stringify({ ...variables, business_id: businessId }),
        status: preview ? "queued" : "queued",
        scheduled_at: scheduledAt ? scheduledAt : new Date().toISOString(),
        transactional,
        created_by: user.id,
      });
    }

    if (rows.length) {
      const res = await db.from("messages").insert(rows);
      if (res.error) throw new Error(res.error.message);
    }

    return json({ ok: true, queued: rows.length, preview }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    if (message === "unauthorized") return json({ error: "unauthorized" }, 401);
    if (message === "forbidden") return json({ error: "forbidden" }, 403);
    return json({ error: message }, 500);
  }
});
