import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { requireAdmin } from "./admin.ts";
import { clientIp, corsHeaders, isProduction, json, sendMail, sendSms } from "./http.ts";
import { generateSellerId, makeTempPassword } from "./ids.ts";
import { rateLimit } from "./rateLimit.ts";
import type { Db } from "./seller.ts";

export { json, z };

export type AdminDeps = {
  db: Db;
  sms: (to: string, message: string) => Promise<boolean>;
  mail: (to: string | undefined, subject: string, html: string) => Promise<void>;
  now: () => Date;
  sellerId: () => string;
  password: () => string;
};

export type Admin = { user: { id: string; email?: string }; role: string };

export function realAdminDeps(): AdminDeps {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return {
    db: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
    sms: isProduction() ? sendSms : async () => true,
    mail: sendMail,
    now: () => new Date(),
    sellerId: () => generateSellerId(),
    password: () => makeTempPassword(),
  };
}

type Config<S extends z.ZodTypeAny> = { name: string; roles: string[]; max: number; seconds: number; schema: S };
type Context<S extends z.ZodTypeAny> = { req: Request; d: AdminDeps; admin: Admin; input: z.infer<S> };

export const adminFn = <S extends z.ZodTypeAny>(d: AdminDeps, cfg: Config<S>, run: (c: Context<S>) => Promise<Response>) =>
  async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    try {
      let who: Awaited<ReturnType<typeof requireAdmin>>;
      try {
        who = await requireAdmin(req, d.db);
      } catch (e) {
        const m = e instanceof Error ? e.message : "";
        if (m === "unauthorized") return json({ error: "unauthorized" }, 401);
        if (m === "forbidden") return json({ error: "forbidden" }, 403);
        throw e;
      }
      const role = (who.admin as { role: string }).role;
      if (!cfg.roles.includes(role)) return json({ error: "forbidden" }, 403);
      if (!(await rateLimit(d.db, `admin:${cfg.name}:${who.user.id}`, cfg.max, cfg.seconds))) {
        return json({ error: "rate_limited", retryAfter: cfg.seconds }, 429);
      }
      const parsed = cfg.schema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
        return json({ error: "invalid_input", issues }, 400);
      }
      const admin: Admin = { user: { id: who.user.id, email: who.user.email }, role };
      return await run({ req, d, admin, input: parsed.data });
    } catch (_) {
      return json({ error: "server_error" }, 500);
    }
  };

export async function audit(
  c: { req: Request; d: AdminDeps; admin: Admin },
  row: { action: string; targetType: string; targetId: string; businessId?: string | null; before?: unknown; after?: unknown; reason?: string | null },
) {
  const r = await c.d.db.from("audit_log").insert({
    business_id: row.businessId ?? null,
    actor_id: c.admin.user.id,
    actor_role: "admin",
    actor_email: c.admin.user.email ?? null,
    action: row.action,
    target_type: row.targetType,
    target_id: row.targetId,
    before: row.before ?? null,
    after: row.after ?? null,
    reason: row.reason ?? null,
    ip: clientIp(c.req),
  });
  if (r?.error) throw new Error("audit_failed");
}

export async function must<T extends { error?: unknown }>(p: PromiseLike<T> | T): Promise<T> {
  const r = await p;
  if (r?.error) throw new Error("db_failed");
  return r;
}

type OutMessage = { business_id: string | null; channel: string; dedupe_key: string } & Record<string, unknown>;

export async function queueMessages(d: AdminDeps, rows: OutMessage[]) {
  if (!rows.length) return;
  const keys = rows.map((r) => r.dedupe_key);
  const seen = await d.db.from("messages").select("business_id,dedupe_key").in("dedupe_key", keys);
  const have = new Set((seen.data ?? []).map((r: { business_id: string; dedupe_key: string }) => `${r.business_id}|${r.dedupe_key}`));
  const fresh = rows.filter((r) => !have.has(`${r.business_id}|${r.dedupe_key}`));
  if (!fresh.length) return;
  const r = await d.db.from("messages").insert(fresh);
  if (r?.error && r.error.code !== "23505") throw new Error("db_failed");
}
