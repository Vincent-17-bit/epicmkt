import { createClient } from "npm:@supabase/supabase-js@2";
import { escapeHtml, json, sendMail } from "../_shared/http.ts";
import { ACCEPTED, parseC2B, routeOf, sameSecret } from "./parse.ts";

// Safaricom (Daraja C2B) calls this when someone pays the EpicMKT Paybill:
//   POST /functions/v1/pay-callback/<MPESA_CALLBACK_SECRET>/validation
//   POST /functions/v1/pay-callback/<MPESA_CALLBACK_SECRET>/confirmation
// Register both URLs once with scripts/register-mpesa-c2b.mjs. The secret in the path is what proves the call is ours.

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  const secret = Deno.env.get("MPESA_CALLBACK_SECRET") ?? "";
  if (!secret) return json({ error: "not_configured" }, 500);
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const route = routeOf(new URL(req.url).pathname);
  if (!route || !sameSecret(route.secret, secret)) return json({ error: "not_found" }, 404);

  // Validation: accept everything. Wrong accounts are not blocked, they are recorded and shown to the admin.
  if (route.kind === "validation") return json(ACCEPTED);
  if (route.kind !== "confirmation") return json({ error: "not_found" }, 404);

  let body: any;
  try { body = await req.json(); } catch { return json(ACCEPTED); }
  const tx = parseC2B(body);
  if (!tx) {
    console.error("pay-callback: unreadable notice", JSON.stringify(body)?.slice(0, 500));
    return json(ACCEPTED);
  }

  const res = await db.rpc("mpesa_record_c2b", {
    p_trans_id: tx.transId,
    p_amount: tx.amount,
    p_account: tx.account,
    p_msisdn: tx.msisdn,
    p_name: tx.name,
    p_short_code: tx.shortCode,
    p_trans_time: tx.transTime,
    p_raw: body,
  });
  if (res.error) {
    console.error("pay-callback: record failed", tx.transId, res.error.message);
    return json({ ResultCode: 1, ResultDesc: "Try again" }, 500);
  }

  const r = res.data as { duplicate?: boolean; status?: string; business_name?: string | null; reference_no?: string | null };
  if (!r?.duplicate) {
    const who = r?.business_name ? `${escapeHtml(r.business_name)} (${escapeHtml(r.reference_no ?? "")})` : `an unknown account “${escapeHtml(tx.account)}”`;
    const note = r?.status === "matched" ? "It is waiting for you to confirm in the admin site."
      : r?.status === "amount_short" ? "The amount is less than the price. Check it in the admin site."
      : r?.status === "extra" ? "This application already had a payment. Check it in the admin site."
      : "No business matched. Check it in the admin site.";
    try {
      await sendMail(
        Deno.env.get("ADMIN_EMAIL"),
        `M-Pesa payment ${tx.transId}`,
        `<p>KES ${escapeHtml(tx.amount)} received from ${who}, code <b>${escapeHtml(tx.transId)}</b>.</p><p>${note}</p>`,
      );
    } catch (_) { /* the payment is already recorded; a failed e-mail must not make Safaricom retry */ }
  }
  return json(ACCEPTED);
});
