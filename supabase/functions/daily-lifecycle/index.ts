import { createClient } from "npm:@supabase/supabase-js@2";
import { adminDb, requireAdmin } from "../_shared/admin.ts";
import { corsHeaders, json } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const db: any = await adminDb();
  try {
    const { user, admin } = await requireAdmin(req, db);
    if (!["owner"].includes(admin.role)) return json({ error: "forbidden" }, 403);

    const { data: businesses } = await db.from("businesses").select("id,name,paid_until").neq("status", "deleted").limit(100);
    const reminders = businesses ? businesses.length : 0;

    await db.from("audit_log").insert({
      actor_id: user.id,
      actor_email: user.email,
      action: "daily.lifecycle",
      target_type: "system",
      target_id: null,
      after: { reminders },
      reason: "scheduled lifecycle run",
    });

    return json({ ok: true, reminders }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    if (message === "unauthorized") return json({ error: "unauthorized" }, 401);
    if (message === "forbidden") return json({ error: "forbidden" }, 403);
    return json({ error: message }, 500);
  }
});
