// Admin request scaffolding: auth (JWT -> admins row -> role), JSON parsing, rate limit and error mapping.
// Browser code never sees the service role key; every admin write goes through a function built on this.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, isDbDown, json, serverError } from "./http.ts";
import { HttpError, isHttpError } from "./errors.ts";
import { ADMIN_ROLES, type AdminRole, isAdminRole, roleAllowed } from "./roles.ts";
import { adminRateKey, enforceRateLimit } from "./ratelimit.ts";
import { parseBody, z } from "./schemas.ts";

export { ADMIN_ROLES, corsHeaders, HttpError, json, z };
export type { AdminRole };
// Older handlers import this from here.
export { parseBody as parseJsonBody };

export type DbClient = ReturnType<typeof createClient>;

export type AdminContext = {
  user: { id: string; email?: string };
  admin: { user_id: string; role: AdminRole };
};

export const bearerToken = (req: Request): string => {
  const header = req.headers.get("authorization") ?? "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
};

/**
 * Who is calling, and may they do this?
 *   no / bad token            -> 401 unauthorized
 *   valid user, not an admin  -> 403 forbidden
 *   admin without the role    -> 403 forbidden   (owner passes every list; no list means any admin)
 *   database trouble          -> 500 server_error (never a misleading 403)
 */
export async function requireAdmin(req: Request, db: DbClient, allowed?: readonly AdminRole[]): Promise<AdminContext> {
  const jwt = bearerToken(req);
  if (!jwt) throw new HttpError(401, "unauthorized");

  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data?.user?.id) throw new HttpError(401, "unauthorized");

  const { data: row, error: adminErr } = await db
    .from("admins")
    .select("user_id, role")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (adminErr && isDbDown(adminErr)) throw new HttpError(503, "unavailable", { retryAfter: 30 });
  if (adminErr) throw new HttpError(500, "server_error");
  const admin = row as { user_id: string; role: unknown } | null;
  if (!admin || !isAdminRole(admin.role)) throw new HttpError(403, "forbidden");
  if (!roleAllowed(admin.role, allowed)) throw new HttpError(403, "forbidden");

  return { user: { id: data.user.id, email: data.user.email ?? undefined }, admin: { user_id: admin.user_id, role: admin.role } };
}

export async function adminDb(): Promise<DbClient> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("missing_supabase_env");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type AdminHandlerOptions = {
  /** Roles allowed besides the owner. Leave out to allow every admin. */
  roles?: readonly AdminRole[];
  /** Name of the action, used for the rate limit bucket (admin:<name>:<userId>). */
  name: string;
  /** Requests allowed per window per admin. Default 60 per minute. */
  rate?: { max: number; windowSeconds: number };
  /** Tests inject a fake database. */
  getDb?: () => Promise<DbClient> | DbClient;
};

export type AdminCall = AdminContext & { req: Request; db: DbClient };

/**
 * Turns a handler into a Deno.serve callback: CORS preflight, POST only, auth, rate limit, JSON answer,
 * and one place that maps errors. Order matters: the caller is authenticated before any input is read,
 * so an anonymous request learns nothing about the expected body.
 * A handler returns a Response, or a plain object which becomes a 200 JSON answer.
 * Unexpected errors answer 500 server_error; their text is logged, never returned.
 */
export function adminHandler(opts: AdminHandlerOptions, fn: (call: AdminCall) => Promise<Response | unknown>) {
  const rate = opts.rate ?? { max: 60, windowSeconds: 60 };
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    try {
      const db = await (opts.getDb ?? adminDb)();
      const ctx = await requireAdmin(req, db, opts.roles);
      await enforceRateLimit(db, adminRateKey(opts.name, ctx.user.id), rate.max, rate.windowSeconds);
      const result = await fn({ ...ctx, req, db });
      return result instanceof Response ? result : json(result ?? { ok: true });
    } catch (e) {
      if (isHttpError(e)) return json({ error: e.code, ...e.extra }, e.status);
      console.error(`[${opts.name}]`, e instanceof Error ? e.message : "unknown error");
      return serverError(e);
    }
  };
}
