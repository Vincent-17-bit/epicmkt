import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, escapeHtml, json, sendMail, sha256Hex } from "../_shared/http.ts";
import { sessionApp } from "../_shared/status.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const app = await sessionApp(db, sha256Hex, body?.token);
  if (!app) return json({ error: "session_expired" }, 401);
  if (app.status !== "approved") return json({ error: "not_editable" }, 409);

  const lim = await db.rpc("hit_rate_limit", { p_key: `paycode:${app.id}`, p_max: 5, p_window_seconds: 3600 });
  if (lim.data !== true) return json({ error: "rate_limited" }, 429);

  const code = String(body?.code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(code)) return json({ error: "invalid_code_format" }, 422);

  const upd = await db.from("applications").update({ payment_code: code, status: "payment_confirming" })
    .eq("id", app.id).eq("status", "approved");
  if (upd.error) return json({ error: "server_error" }, 500);
  await db.from("application_events").insert({ application_id: app.id, actor: "seller", type: "payment_submitted", data: { code } });
  await sendMail(
    Deno.env.get("ADMIN_EMAIL"),
    `Payment code from ${app.reference_no}`,
    `<p>${escapeHtml(app.business_name)} submitted M-Pesa code <b>${escapeHtml(code)}</b> for KES ${escapeHtml(app.price_at_submission)}.</p>`,
  );
  return json({ ok: true, status: "payment_confirming" });
});
