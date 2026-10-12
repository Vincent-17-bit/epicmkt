import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { adminDb, requireAdmin } from "../_shared/admin.ts";
import { corsHeaders, json } from "../_shared/http.ts";

const schema = z.object({
  applicationId: z.string().uuid().optional(),
  businessId: z.string().uuid().optional(),
  mpesaCode: z.string().min(3).max(64),
  amount: z.number().int().positive(),
  months: z.number().int().min(1).max(24).default(1),
  action: z.enum(["confirm", "reject"]),
  reason: z.string().max(500).optional(),
  acknowledgeWarnings: z.boolean().default(false),
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
    if (!["owner", "reviewer", "finance"].includes(admin.role)) return json({ error: "forbidden" }, 403);

    const { applicationId, businessId, mpesaCode, amount, months, action, reason, acknowledgeWarnings } = parsed.data;
    const warnings = [] as string[];

    const existing = await db.from("payments").select("id,amount,mpesa_code,status").eq("mpesa_code", mpesaCode).not("status", "eq", "rejected").maybeSingle();
    if (existing.data && existing.data.status !== "rejected") warnings.push("Duplicate M-Pesa code already recorded");

    if (!acknowledgeWarnings && warnings.length) return json({ ok: false, warnings }, 409);

    const targetId = applicationId ?? businessId;
    if (!targetId) return json({ error: "application_or_business_required" }, 422);

    const payment = {
      business_id: businessId ?? null,
      application_id: applicationId ?? null,
      amount,
      plan_key: "standard",
      months,
      mpesa_code: mpesaCode,
      phone: null,
      status: action === "confirm" ? "confirmed" : "rejected",
      submitted_at: new Date().toISOString(),
      confirmed_by: action === "confirm" ? user.id : null,
      confirmed_at: action === "confirm" ? new Date().toISOString() : null,
      receipt_no: action === "confirm" ? `EPM-${Date.now()}` : null,
      notes: action === "confirm" ? "Confirmed by admin" : reason ?? null,
      reject_reason: action === "reject" ? reason ?? null : null,
    };

    const { data: created } = await db.from("payments").insert(payment).select("id, receipt_no").single();
    if (!created) return json({ error: "server_error" }, 500);

    if (action === "confirm") {
      await db.from("audit_log").insert({
        actor_id: user.id,
        actor_email: user.email,
        action: "payment.confirm",
        target_type: "payment",
        target_id: created.id,
        before: null,
        after: { status: "confirmed", receipt_no: created.receipt_no },
        reason: reason ?? null,
      });
    }

    return json({ ok: true, paymentId: created.id, receiptNo: created.receipt_no, warnings }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    if (message === "unauthorized") return json({ error: "unauthorized" }, 401);
    if (message === "forbidden") return json({ error: "forbidden" }, 403);
    return json({ error: message }, 500);
  }
});
