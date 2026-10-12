import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { corsHeaders, json } from "./http.ts";

export { corsHeaders, json, z };

export type DbClient = ReturnType<typeof createClient>;

export async function requireAdmin(req: Request, db: DbClient) {
  const header = req.headers.get("authorization") ?? "";
  const jwt = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!jwt) throw new Error("unauthorized");

  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data?.user) throw new Error("unauthorized");

  const { data: admin, error: adminErr } = await db
    .from("admins")
    .select("role, user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (adminErr || !admin) throw new Error("forbidden");
  return { user: data.user, admin };
}

export async function adminDb() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("missing_supabase_env");
  return createClient(url, key, { auth: { persistSession: false } });
}

export function parseJsonBody<T>(req: Request, schema: z.ZodType<T>) {
  return req.json().then((body) => schema.parse(body));
}
