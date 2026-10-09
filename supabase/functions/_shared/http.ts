import { isAllowedOrigin, resolveAllowList } from "./origins.ts";

export const corsHeaders = () => ({
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

const allowList = () => resolveAllowList(Deno.env.get("ALLOWED_ORIGINS"), Deno.env.get("APP_ENV") === "production");

export const withCors = (handler: (req: Request) => Response | Promise<Response>) => async (req: Request) => {
  const origin = req.headers.get("origin");
  if (origin && !isAllowedOrigin(origin, allowList())) {
    return new Response(JSON.stringify({ error: "origin_not_allowed" }), {
      status: 403,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin" },
    });
  }
  const res = await handler(req);
  const headers = new Headers(res.headers);
  headers.set("Vary", "Origin");
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  return new Response(res.body, { status: res.status, headers });
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

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
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("MAIL_FROM");
  if (!key || !from || !to) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
  } catch (_) {}
}

export async function sendSms(to: string, message: string): Promise<boolean> {
  const key = Deno.env.get("AT_API_KEY");
  const username = Deno.env.get("AT_USERNAME");
  const sender = Deno.env.get("AT_SENDER");
  if (!key || !username || !sender) return false;
  try {
    const host = username === "sandbox" ? "api.sandbox.africastalking.com" : "api.africastalking.com";
    const r = await fetch(`https://${host}/version1/messaging`, {
      method: "POST",
      headers: { apiKey: key, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username, to, message, from: sender }),
    });
    return r.ok;
  } catch (_) {
    return false;
  }
}

export const isProduction = () => Deno.env.get("APP_ENV") === "production";
