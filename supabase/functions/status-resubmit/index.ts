import { createClient } from "npm:@supabase/supabase-js@2";
import { withCors, corsHeaders, escapeHtml, json, sendMail, sha256Hex } from "../_shared/http.ts";
import { sessionApp } from "../_shared/status.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

Deno.serve(withCors(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const app = await sessionApp(db, sha256Hex, body?.token);
  if (!app) return json({ error: "session_expired" }, 401);
  if (app.status !== "changes_requested") return json({ error: "not_editable" }, 409);

  const { data: flags } = await db.from("application_flags").select("id, addressed_at").eq("application_id", app.id).eq("status", "open");
  const pending = (flags ?? []).filter((f: any) => !f.addressed_at);
  if (pending.length) return json({ error: "flags_open", count: pending.length }, 409);

  const ids = (flags ?? []).map((f: any) => f.id);
  if (ids.length) await db.from("application_flags").update({ status: "fixed" }).in("id", ids);
  const upd = await db.from("applications").update({ status: "submitted" }).eq("id", app.id).eq("status", "changes_requested");
  if (upd.error) return json({ error: "server_error" }, 500);
  await db.from("application_events").insert({ application_id: app.id, actor: "seller", type: "submitted", data: { resubmitted: true } });
  await sendMail(
    Deno.env.get("ADMIN_EMAIL"),
    `Corrections received for ${app.reference_no}`,
    `<p>${escapeHtml(app.business_name)} has sent corrections and is ready for re-check.</p><p>Reference: ${escapeHtml(app.reference_no)}</p>`,
  );
  return json({ ok: true, status: "submitted" });
}));
