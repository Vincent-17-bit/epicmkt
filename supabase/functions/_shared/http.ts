import { isHttpError } from "./errors.ts";
import { deliverEmail, deliverSms, isProduction } from "./providers.ts";

export const corsHeaders = () => ({
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

export const json = (body: unknown, status = 200) => {
  const retry = (body as { retryAfter?: unknown } | null)?.retryAfter;
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(status === 503 && typeof retry === "number" ? { "Retry-After": String(retry) } : {}),
    },
  });
};

const DOWN_TEXT = /fetch failed|network|timed? ?out|econnrefused|econnreset|enotfound|connection (refused|reset|terminated)|upstream/i;

export function isDbDown(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const x = e as { status?: unknown; code?: unknown; message?: unknown; name?: unknown; cause?: unknown };
  if (x.status === 502 || x.status === 503 || x.status === 504) return true;
  if (typeof x.code === "string" && /^(08|57P0|53300)/.test(x.code)) return true;
  if (x.name === "AbortError" || x.name === "TimeoutError") return true;
  if (typeof x.message === "string" && DOWN_TEXT.test(x.message)) return true;
  return x.cause ? isDbDown(x.cause) : false;
}

export const unavailable = (retryAfter = 30) => json({ error: "unavailable", retryAfter }, 503);

export const serverError = (e: unknown) =>
  isDbDown(e) || (isHttpError(e) && e.status === 503) ? unavailable() : json({ error: "server_error" }, 500);

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const randomToken = () =>
  [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");

export const clientIp = (req: Request) =>
  req.headers.get("cf-connecting-ip") ??
  req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
  "unknown";

export async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  const secret = Deno.env.get("TURNSTILE_SECRET");
  if (!secret) return Deno.env.get("APP_ENV") !== "production";
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token, remoteip: ip });
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  const d = await r.json();
  return d.success === true;
}

export const escapeHtml = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export async function sendMail(to: string | undefined, subject: string, html: string) {
  await deliverEmail(to, subject, html);
}

export async function sendSms(to: string, message: string): Promise<boolean> {
  return (await deliverSms(to, message)).ok;
}

export { isProduction };
