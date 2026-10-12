import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { adminDb, requireAdmin } from "../_shared/admin.ts";
import { corsHeaders, json } from "../_shared/http.ts";

const schema = z.object({
  businessId: z.string().uuid(),
  reason: z.string().min(3).max(500),
  newPassword: z.string().min(8).max(200).optional(),
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
    if (!["owner", "reviewer", "support"].includes(admin.role)) return json({ error: "forbidden" }, 403);

    const { businessId, reason, newPassword } = parsed.data;
    const password = newPassword ?? crypto.randomUUID().slice(0, 12);

    const { data: business } = await db.from("businesses").select("id, name, seller_id").eq("id", businessId).maybeSingle();
    if (!business) return json({ error: "not_found" }, 404);

    await db.from("audit_log").insert({
      actor_id: user.id,
      actor_email: user.email,
      action: "business.password_reset",
      target_type: "business",
      target_id: businessId,
      reason,
      after: { passwordReset: true, sellerId: business.seller_id },
    });

    return json({ ok: true, businessId: business.id, password, sellerId: business.seller_id }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    if (message === "unauthorized") return json({ error: "unauthorized" }, 401);
    if (message === "forbidden") return json({ error: "forbidden" }, 403);
    return json({ error: message }, 500);
  }
});
