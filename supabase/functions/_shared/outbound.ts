import { createClient } from "npm:@supabase/supabase-js@2";
import { isProduction, json } from "./http.ts";
import type { Db } from "./seller.ts";

export type SendResult = { ok: true; providerId: string; cost?: number } | { ok: false; error: string };
export type AdminRole = "owner" | "reviewer" | "finance" | "support";
export type Actor = { kind: "system" } | { kind: "admin"; userId: string; role: AdminRole };

// Everything the messaging functions touch from the outside world, so tests can replace it.
export type OutboundDeps = {
  db: Db;
  cronSecret?: string;
  // Dev mode sends nothing: the dispatcher marks messages 'sent' with provider_id 'dev'.
  dev: boolean;
  now: () => Date;
  sendSms: (to: string, message: string) => Promise<SendResult>;
  sendEmail: (to: string, subject: string, body: string) => Promise<SendResult>;
};

export function realOutboundDeps(): OutboundDeps {
  return {
    db: createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    cronSecret: Deno.env.get("CRON_SECRET") || undefined,
    dev: !isProduction(),
    now: () => new Date(),
    sendSms: atSendSms,
    sendEmail: resendSendEmail,
  };
}

// ---------------------------------------------------------------------------
// Auth: pg_cron presents x-cron-secret; people present an admin JWT.
// ---------------------------------------------------------------------------
export const isResponse = (v: unknown): v is Response => v instanceof Response;

export function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function requireRole(req: Request, db: Db, roles: AdminRole[]): Promise<Extract<Actor, { kind: "admin" }> | Response> {
  const header = req.headers.get("authorization") ?? "";
  const jwt = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!jwt) return json({ error: "unauthorized" }, 401);
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data?.user?.id) return json({ error: "unauthorized" }, 401);
  const { data: admin } = await db.from("admins").select("role").eq("user_id", data.user.id).maybeSingle();
  if (!admin) return json({ error: "forbidden" }, 403);
  if (!roles.includes(admin.role)) return json({ error: "forbidden" }, 403);
  return { kind: "admin", userId: data.user.id, role: admin.role };
}

export async function cronOrRole(req: Request, d: OutboundDeps, roles: AdminRole[]): Promise<Actor | Response> {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== null) {
    return d.cronSecret && safeEqual(secret, d.cronSecret) ? { kind: "system" } : json({ error: "unauthorized" }, 401);
  }
  return requireRole(req, d.db, roles);
}

export const auditWho = (a: Actor) => (a.kind === "system" ? { actor_role: "system" } : { actor_role: "admin", actor_id: a.userId });

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------
const TIMEOUT_MS = 15_000;

// Africa's Talking: statusCode 100 processed, 101 sent, 102 queued.
export async function atSendSms(to: string, message: string): Promise<SendResult> {
  const key = Deno.env.get("AT_API_KEY");
  const username = Deno.env.get("AT_USERNAME");
  const sender = Deno.env.get("AT_SENDER");
  if (!key || !username || !sender) return { ok: false, error: "sms_not_configured" };
  try {
    const host = username === "sandbox" ? "api.sandbox.africastalking.com" : "api.africastalking.com";
    const r = await fetch(`https://${host}/version1/messaging`, {
      method: "POST",
      headers: { apiKey: key, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username, to, message, from: sender }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) return { ok: false, error: `sms_http_${r.status}` };
    const data = await r.json();
    const rec = data?.SMSMessageData?.Recipients?.[0];
    if (!rec || ![100, 101, 102].includes(Number(rec.statusCode))) return { ok: false, error: `sms_${String(rec?.status ?? "rejected").slice(0, 60)}` };
    const cost = parseFloat(String(rec.cost ?? "").replace(/[^0-9.]/g, ""));
    return { ok: true, providerId: String(rec.messageId ?? "at"), cost: Number.isFinite(cost) ? cost : undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? `sms_${e.name}` : "sms_failed" };
  }
}

export async function resendSendEmail(to: string, subject: string, body: string): Promise<SendResult> {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("MAIL_FROM");
  if (!key || !from) return { ok: false, error: "email_not_configured" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text: body }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data?.id) return { ok: false, error: `email_http_${r.status}` };
    return { ok: true, providerId: String(data.id) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? `email_${e.name}` : "email_failed" };
  }
}

// ---------------------------------------------------------------------------
// Rendering: {{variable}} placeholders. A placeholder with no value is reported, never sent blank.
// ---------------------------------------------------------------------------
export function renderTemplate(tpl: string, vars: Record<string, string>): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const text = tpl.replace(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi, (_m, k: string) => {
    const v = vars[k];
    if (v === undefined) {
      missing.add(k);
      return "";
    }
    return v;
  });
  return { text, missing: [...missing] };
}

export const fmtDay = (iso: string | null | undefined): string =>
  iso
    ? new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", day: "2-digit", month: "short", year: "numeric" })
      .format(new Date(iso)).replace(/,/g, "")
    : "";

export const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

// ---------------------------------------------------------------------------
// CSV (RFC 4180) with spreadsheet formula-injection protection
// ---------------------------------------------------------------------------
const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/;

export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "object" ? JSON.stringify(v) : String(v);
  // A text cell starting with = + - @ (or a tab/CR) is run as a formula by Excel/Sheets; prefix it.
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s) && !PLAIN_NUMBER.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const lines = [columns.join(",")];
  for (const r of rows) lines.push(columns.map((c) => csvCell(r[c])).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
