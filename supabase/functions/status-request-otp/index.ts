import { createClient } from "npm:@supabase/supabase-js@2";
import { normalizePhone } from "../_shared/validate.ts";
import { clientIp, corsHeaders, json, sha256Hex } from "../_shared/http.ts";
import { deliverSms, useDevOtp } from "../_shared/providers.ts";
import { OTP_MINUTES, nowPlus } from "../_shared/status.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const GENERIC = { ok: true, message: "If these details match an application, we have sent a code." };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const ref = String(body?.referenceNo ?? "").trim().toUpperCase();
  const phone = normalizePhone(String(body?.phone ?? ""));
  if (!/^EPM-\d{4}-[A-Z0-9]{6}$/.test(ref) || !phone) return json(GENERIC);

  const ipHash = await sha256Hex((Deno.env.get("IP_HASH_SALT") ?? "") + clientIp(req));
  const resend = await db.rpc("hit_rate_limit", { p_key: `otp:resend:${ref}:${phone}`, p_max: 1, p_window_seconds: 60 });
  if (resend.data !== true) return json({ error: "rate_limited", retryAfter: 60 }, 429);
  const hour = await db.rpc("hit_rate_limit", { p_key: `otp:hour:${ref}:${phone}`, p_max: 5, p_window_seconds: 3600 });
  const ip = await db.rpc("hit_rate_limit", { p_key: `otp:ip:${ipHash}`, p_max: 20, p_window_seconds: 3600 });
  if (hour.data !== true || ip.data !== true) return json({ error: "rate_limited", retryAfter: 3600 }, 429);

  const { data: app } = await db.from("applications").select("id")
    .eq("reference_no", ref).eq("phone", phone).neq("status", "uploading").maybeSingle();
  if (!app) return json(GENERIC);

  const id = crypto.randomUUID();
  const devOtp = useDevOtp();
  const code = devOtp ? "123456" : String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  await db.from("otp_requests").update({ used: true }).eq("reference_no", ref).eq("phone", phone).eq("used", false);
  const ins = await db.from("otp_requests").insert({
    id, reference_no: ref, phone, code_hash: await sha256Hex(`${id}:${code}`), expires_at: nowPlus(OTP_MINUTES),
  });
  if (ins.error) return json(GENERIC);
  // The reply stays generic on purpose (it must not reveal whether an application exists), so the outcome of the
  // SMS is recorded where staff can see it: the application's event log, and the function log. Never the code.
  let delivery: Record<string, unknown> = { sms: "skipped_dev_code" };
  if (!devOtp) {
    const sent = await deliverSms(phone, `Your EpicMKT code is ${code}. It expires in ${OTP_MINUTES} minutes.`);
    delivery = sent.ok ? { sms: sent.mock ? "mock" : "sent", providerId: sent.providerId } : { sms: "failed", error: sent.error };
    if (!sent.ok) console.error("otp_sms_failed", sent.error);
    else if (sent.mock) console.error("otp_sms_mock", "a random code was issued but MESSAGING_MODE is mock, so nothing was sent");
  }
  await db.from("application_events").insert({ application_id: app.id, actor: "seller", type: "otp_requested", data: delivery });
  return json(GENERIC);
});
