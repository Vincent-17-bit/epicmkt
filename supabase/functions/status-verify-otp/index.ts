import { createClient } from "npm:@supabase/supabase-js@2";
import { normalizePhone } from "../_shared/validate.ts";
import { withCors, clientIp, corsHeaders, json, randomToken, sha256Hex } from "../_shared/http.ts";
import { SESSION_MINUTES, nowPlus } from "../_shared/status.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const MAX_ATTEMPTS = 5;

Deno.serve(withCors(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const ref = String(body?.referenceNo ?? "").trim().toUpperCase();
  const phone = normalizePhone(String(body?.phone ?? ""));
  const code = String(body?.code ?? "").trim();
  if (!/^EPM-\d{4}-[A-Z0-9]{6}$/.test(ref) || !phone || !/^\d{6}$/.test(code)) return json({ error: "invalid_code" }, 401);

  const ipHash = await sha256Hex((Deno.env.get("IP_HASH_SALT") ?? "") + clientIp(req));
  const ipOk = await db.rpc("hit_rate_limit", { p_key: `otpverify:ip:${ipHash}`, p_max: 30, p_window_seconds: 3600 });
  if (ipOk.data !== true) return json({ error: "rate_limited" }, 429);

  const { data: otp } = await db.from("otp_requests").select("*")
    .eq("reference_no", ref).eq("phone", phone).eq("used", false)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!otp) return json({ error: "invalid_code" }, 401);
  if (otp.attempts >= MAX_ATTEMPTS) return json({ error: "too_many_attempts" }, 429);

  const attempts = otp.attempts + 1;
  await db.from("otp_requests").update({ attempts }).eq("id", otp.id);
  if (otp.code_hash !== (await sha256Hex(`${otp.id}:${code}`)))
    return json({ error: "invalid_code", attemptsLeft: MAX_ATTEMPTS - attempts }, 401);

  const { data: app } = await db.from("applications").select("id")
    .eq("reference_no", ref).eq("phone", phone).neq("status", "uploading").maybeSingle();
  if (!app) return json({ error: "invalid_code" }, 401);

  await db.from("otp_requests").update({ used: true }).eq("id", otp.id);
  const token = randomToken();
  const expiresAt = nowPlus(SESSION_MINUTES);
  const ins = await db.from("status_sessions").insert({
    token_hash: await sha256Hex(token), application_id: app.id, expires_at: expiresAt,
  });
  if (ins.error) return json({ error: "server_error" }, 500);
  await db.from("application_events").insert({ application_id: app.id, actor: "seller", type: "session_started", data: {} });
  return json({ token, expiresAt });
}));
