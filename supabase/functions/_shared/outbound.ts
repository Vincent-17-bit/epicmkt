import { createClient } from "npm:@supabase/supabase-js@2";
import { escapeHtml, json } from "./http.ts";
import { requireAdmin } from "./admin.ts";
import { isHttpError } from "./errors.ts";
import { deliverEmail, deliverSms, isMockMode } from "./providers.ts";
import { adminRateKey, hitRateLimit } from "./ratelimit.ts";
import type { AdminRole } from "./roles.ts";
import type { Db } from "./seller.ts";

export type SendResult = { ok: true; providerId: string; cost?: number } | { ok: false; error: string };
export type { AdminRole };
export type Actor = { kind: "system" } | { kind: "admin"; userId: string; email?: string; role: AdminRole };

// Everything the messaging functions touch from the outside world, so tests can replace it.
export type OutboundDeps = {
  db: Db;
  cronSecret?: string;
  // Dev mode (messaging mode "mock": the default outside production, or MESSAGING_MODE=mock) sends nothing:
  // the dispatcher marks messages 'sent' with provider_id 'dev'.
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
    dev: isMockMode(),
    now: () => new Date(),
    sendSms,
    sendEmail,
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
  try {
    const ctx = await requireAdmin(req, db, roles);
    return { kind: "admin", userId: ctx.user.id, email: ctx.user.email, role: ctx.admin.role };
  } catch (e) {
    if (isHttpError(e)) return json({ error: e.code, ...e.extra }, e.status);
    throw e;
  }
}

export async function cronOrRole(req: Request, d: OutboundDeps, roles: AdminRole[]): Promise<Actor | Response> {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== null) {
    return d.cronSecret && safeEqual(secret, d.cronSecret) ? { kind: "system" } : json({ error: "unauthorized" }, 401);
  }
  return requireRole(req, d.db, roles);
}

// Rate limits for the messaging functions (owner decision D1): [max calls, window in seconds], one bucket per
// action and admin. Admin callers only: the scheduler is never limited.
export const MESSAGING_LIMITS = {
  message: [30, 60],
  export: [10, 60],
  dispatch: [10, 60],
  lifecycle: [5, 3600],
} as const satisfies Record<string, readonly [number, number]>;

/**
 * A 429 `Response` once an admin is over the limit for `action`, otherwise null. Cron (`kind: "system"`) always passes.
 * It answers the 429 itself instead of throwing, because `wrap` turns every thrown error into a 500.
 * A limiter failure still throws (500): the limiter being down must not let the request through.
 */
export async function limitAdmin(d: OutboundDeps, actor: Actor, action: keyof typeof MESSAGING_LIMITS): Promise<Response | null> {
  if (actor.kind !== "admin") return null;
  const [max, windowSeconds] = MESSAGING_LIMITS[action];
  const ok = await hitRateLimit(d.db, adminRateKey(action, actor.userId), max, windowSeconds);
  return ok ? null : json({ error: "rate_limited", retryAfter: windowSeconds }, 429);
}

// ---------------------------------------------------------------------------
// Providers: the shared deliverSms / deliverEmail (Africa's Talking, Resend) in live mode
// ---------------------------------------------------------------------------
const toResult = (d: { ok: boolean; providerId?: string; costKes?: number; error?: string }, fallback: string): SendResult =>
  d.ok ? { ok: true, providerId: d.providerId ?? fallback, cost: d.costKes } : { ok: false, error: d.error ?? "send_failed" };

export async function sendSms(to: string, message: string): Promise<SendResult> {
  return toResult(await deliverSms(to, message), "at");
}

export async function sendEmail(to: string, subject: string, body: string): Promise<SendResult> {
  const html = `<p>${escapeHtml(body).replace(/\r?\n/g, "<br>")}</p>`;
  return toResult(await deliverEmail(to, subject, html), "resend");
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
