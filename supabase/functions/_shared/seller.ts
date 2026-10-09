import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { clientIp, corsHeaders, isProduction, json, sendSms, sha256Hex } from "./http.ts";

export { corsHeaders, json, z };

export type Db = any;
export type Deps = {
  db: Db;
  anon: Db;
  sms: (to: string, message: string) => Promise<boolean>;
  code: () => string;
  salt: string;
};

export const SELLER_EMAIL_DOMAIN = "sellers.epicmkt.app";
export const sellerEmail = (sellerId: string) => `${sellerId.toLowerCase()}@${SELLER_EMAIL_DOMAIN}`;
export const GENERIC_AUTH = "Seller ID or password is incorrect.";
export const GENERIC_CODE = "That code is not valid or has expired.";
export const OTP_MINUTES = 10;

export const sellerIdSchema = z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9-]+$/);
export const codeSchema = z.string().trim().regex(/^[0-9]{6}$/);
export const passwordSchema = z.string().min(1).max(200);

export function realDeps(): Deps {
  const url = Deno.env.get("SUPABASE_URL")!;
  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  const prod = isProduction();
  return {
    db: createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, opts),
    anon: createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, opts),
    sms: prod ? sendSms : async () => true,
    code: () => (prod ? String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0") : "123456"),
    salt: Deno.env.get("IP_HASH_SALT") ?? "",
  };
}

export const wrap = (fn: (req: Request) => Promise<Response>) => async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    return await fn(req);
  } catch (_) {
    return json({ error: "server_error" }, 500);
  }
};

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export const hashIp = (req: Request, salt: string) => sha256Hex(salt + clientIp(req));

export async function rateOk(db: Db, key: string, max: number, seconds: number): Promise<boolean> {
  const r = await db.rpc("hit_rate_limit", { p_key: key, p_max: max, p_window_seconds: seconds });
  return r.data === true;
}

export const rateLimited = (retryAfter = 3600) => json({ error: "rate_limited", retryAfter }, 429);

export function sessionIdOf(jwt: string): string | null {
  try {
    const part = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "=")));
    return typeof claims.session_id === "string" ? claims.session_id : null;
  } catch {
    return null;
  }
}

export type SellerCtx = {
  userId: string;
  sessionId: string | null;
  business: { id: string; seller_id: string; phone: string; name: string; status: string };
};

export async function authenticate(req: Request, db: Db): Promise<SellerCtx | Response> {
  const header = req.headers.get("authorization") ?? "";
  const jwt = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!jwt) return json({ error: "unauthorized" }, 401);
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data?.user?.id) return json({ error: "unauthorized" }, 401);
  const { data: business } = await db.from("businesses")
    .select("id, seller_id, phone, name, status")
    .eq("user_id", data.user.id).neq("status", "deleted").maybeSingle();
  if (!business) return json({ error: "forbidden" }, 403);
  return { userId: data.user.id, sessionId: sessionIdOf(jwt), business };
}

export const maskPhone = (phone: string) => phone.replace(/^(\+254\d)\d{5}(\d{3})$/, "$1*****$2");

export const otpMessage = (code: string) => `Your EpicMKT code is ${code}. It expires in ${OTP_MINUTES} minutes.`;

export const auditInsert = (db: Db, row: { business_id: string; actor_id: string; action: string; entity?: string; entity_id?: string; data?: unknown }) =>
  db.from("audit_log").insert({ actor_role: "seller", entity: "business", entity_id: row.business_id, data: {}, ...row });
