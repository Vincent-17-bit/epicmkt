import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { adminDb, requireAdmin } from "../_shared/admin.ts";
import { corsHeaders, json } from "../_shared/http.ts";

const schema = z.object({
  limit: z.number().int().min(1).max(50).default(20),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const db = await adminDb();
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body ?? {});
    if (!parsed.success) return json({ error: "invalid_input", issues: parsed.error.issues }, 422);

    const { user, admin } = await requireAdmin(req, db);
    if (!["owner", "reviewer", "support"].includes(admin.role)) return json({ error: "forbidden" }, 403);

    const { data, error } = await db.from("messages").select("*").order("created_at", { ascending: false }).limit(parsed.data.limit);
    if (error) throw new Error(error.message);

    await db.from("audit_log").insert({
      actor_id: user.id,
      actor_email: user.email,
      action: "messages.list",
      target_type: "message",
      target_id: null,
      after: { count: Array.isArray(data) ? data.length : 0 },
      reason: null,
    });

    return json({ ok: true, messages: data ?? [] }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    if (message === "unauthorized") return json({ error: "unauthorized" }, 401);
    if (message === "forbidden") return json({ error: "forbidden" }, 403);
    return json({ error: message }, 500);
  }
});
