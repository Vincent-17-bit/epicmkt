// The real (Deno) wiring of the STK Push flow. Tests build StkDeps by hand with a fake Daraja instead.
import { createClient } from "npm:@supabase/supabase-js@2";
import { clientIp, escapeHtml, sendMail, sha256Hex } from "./http.ts";
import { authenticate } from "./seller.ts";
import { sessionApp } from "./status.ts";
import { realAdminDeps } from "./adminKit.ts";
import { autoActivate } from "./activate.ts";
import { createDaraja, darajaConfigFromEnv } from "./daraja.ts";
import type { StkDeps } from "./stk.ts";

export function realStkDeps(): StkDeps {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const cfg = darajaConfigFromEnv((n) => Deno.env.get(n));
  return {
    db,
    daraja: cfg ? createDaraja(cfg) : null,
    verify: cfg?.verify ?? true,
    salt: Deno.env.get("IP_HASH_SALT") ?? "",
    sha256Hex,
    ip: clientIp,
    sessionApp: (token) => sessionApp(db, sha256Hex, token),
    authenticate: (req) => authenticate(req, db),
    activate: (applicationId) => autoActivate(realAdminDeps(), applicationId),
    alert: (subject, lines) => sendMail(Deno.env.get("ADMIN_EMAIL"), subject, lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("")),
    now: () => new Date(),
    cronSecret: Deno.env.get("CRON_SECRET") ?? undefined,
  };
}
