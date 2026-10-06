import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, sha256Hex } from "../_shared/http.ts";
import { sessionApp, viewApplication } from "../_shared/status.ts";

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
  return json({ application: await viewApplication(db, app) });
});
