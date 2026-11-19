import { createClient } from "npm:@supabase/supabase-js@2";
import { normalizePhone } from "../_shared/validate.ts";
import { clientIp, corsHeaders, json, sha256Hex } from "../_shared/http.ts";
import { deliverSms } from "../_shared/providers.ts";
import { referenceSms } from "../_shared/messages.ts";

// "Lost your reference?" on the application status page: texts the reference number(s) of the applications made with this phone
// number to that phone. The reply never says whether there were any (it is the same for every number), so the page cannot be used
// to find out who applied. Rate limited per phone and per address, and the SMS only ever goes to the phone on the application.

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const GENERIC = { ok: true, message: "If an application was made with this number, we have sent its reference number to it by SMS." };
const MAX_REFS = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const phone = normalizePhone(String(body?.phone ?? ""));
  if (!phone) return json(GENERIC);

  const ipHash = await sha256Hex((Deno.env.get("IP_HASH_SALT") ?? "") + clientIp(req));
  const minute = await db.rpc("hit_rate_limit", { p_key: `ref:resend:${phone}`, p_max: 1, p_window_seconds: 60 });
  if (minute.data !== true) return json({ error: "rate_limited", retryAfter: 60 }, 429);
  const day = await db.rpc("hit_rate_limit", { p_key: `ref:day:${phone}`, p_max: 3, p_window_seconds: 86400 });
  const ip = await db.rpc("hit_rate_limit", { p_key: `ref:ip:${ipHash}`, p_max: 10, p_window_seconds: 3600 });
  if (day.data !== true || ip.data !== true) return json({ error: "rate_limited", retryAfter: 3600 }, 429);

  const { data: apps } = await db.from("applications").select("id, reference_no, business_name")
    .eq("phone", phone).neq("status", "uploading").not("reference_no", "is", null)
    .order("created_at", { ascending: false }).limit(MAX_REFS);
  if (!apps?.length) return json(GENERIC);

  const sent = await deliverSms(phone, referenceSms(apps.map((a: any) => ({ ref: a.reference_no, business: a.business_name }))));
  const delivery = sent.ok ? { sms: sent.mock ? "mock" : "sent", providerId: sent.providerId } : { sms: "failed", error: sent.error };
  if (!sent.ok) console.error("reference_sms_failed", sent.error);
  // Recorded on each application, where staff can see that the reference was asked for (the reply itself stays generic).
  await db.from("application_events").insert(apps.map((a: any) => ({ application_id: a.id, actor: "seller", type: "reference_requested", data: delivery })));
  return json(GENERIC);
});
