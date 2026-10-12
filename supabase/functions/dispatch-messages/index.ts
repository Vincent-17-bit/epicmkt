import { createClient } from "npm:@supabase/supabase-js@2";
import { isProduction, sendSms } from "../_shared/http.ts";
import { dispatchMessages } from "./handler.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

const mail = async (to: string, subject: string, html: string) => {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("MAIL_FROM");
  if (!key || !from) return false;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  return r.ok;
};

Deno.serve(dispatchMessages({
  db,
  sms: isProduction() ? sendSms : async () => true,
  mail: isProduction() ? mail : async () => true,
  secret: Deno.env.get("DISPATCH_SECRET") ?? "",
  now: () => new Date(),
}));
