import { createClient } from "npm:@supabase/supabase-js@2";
import { escapeHtml, json, sendMail } from "../_shared/http.ts";
import { ACCEPTED, alertFor, bodyOf, routeOf, sameSecret } from "./parse.ts";
import { realAdminDeps } from "../_shared/adminKit.ts";
import { autoActivate } from "../_shared/activate.ts";

// Safaricom (Daraja C2B) calls this when someone pays the EpicMKT Paybill:
//   POST /functions/v1/pay-callback/<MPESA_CALLBACK_SECRET>/validation
//   POST /functions/v1/pay-callback/<MPESA_CALLBACK_SECRET>/confirmation
// Register both URLs once with scripts/register-mpesa-c2b.mjs. The secret in the path is what proves the call is ours
// (Daraja does not sign its callbacks). Everything else, including the matching, happens in the database.

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  const secret = Deno.env.get("MPESA_CALLBACK_SECRET") ?? "";
  if (!secret) return json({ error: "not_configured" }, 500);
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const route = routeOf(new URL(req.url).pathname);
  if (!route || !sameSecret(route.secret, secret)) return json({ error: "not_found" }, 404);

  // Validation: accept everything. A payer is never blocked; a payment with a wrong account is recorded and shown to the admin.
  if (route.kind === "validation") return json(ACCEPTED);
  if (route.kind !== "confirmation") return json({ error: "not_found" }, 404);

  const body = bodyOf(await req.text());
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  // The raw callback is saved first, inside the database call. If even that fails, answer 500 so Safaricom can retry.
  const res = await db.rpc("mpesa_ingest", { p_kind: "confirmation", p_body: body, p_ip: ip });
  if (res.error) {
    console.error("pay-callback: could not store the callback", res.error.message);
    return json({ ResultCode: 1, ResultDesc: "Try again" }, 500);
  }

  const r = res.data as Record<string, any>;
  let live = false;
  if (!r?.duplicate && r?.outcome === "ready" && r?.application_id) {
    try {
      live = (await autoActivate(realAdminDeps(), r.application_id)).activated;
    } catch (e) {
      console.error("pay-callback: automatic activation failed", e instanceof Error ? e.message : e);
    }
  }
  const alert = r?.duplicate || live ? null : alertFor(r ?? {}, { amount: r?.amount, code: r?.code, account: r?.account });
  if (alert) {
    try {
      await sendMail(Deno.env.get("ADMIN_EMAIL"), alert.subject, alert.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join(""));
    } catch (_) { /* the payment is already recorded; a failed e-mail must not make Safaricom retry */ }
  }
  return json(ACCEPTED);
});
