// SMS (Africa's Talking) and email (Resend) delivery with an explicit mock mode.
//
// Mode: MESSAGING_MODE=mock|live wins; otherwise live in production and mock everywhere else.
//   mock  never touches the network, returns ok with a "mock-" provider id (used in development, tests, the seed).
//   live  needs the provider secrets; if one is missing the result is a clear failure, never a fake success.
// Secrets are read here, on the server, and never leave it. Message bodies are never logged.
import { countSms } from "./sms.ts";

export type Delivery = {
  ok: boolean;
  mock: boolean;
  providerId?: string;
  costKes?: number;
  error?: string;
};

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export type DeliveryDeps = { fetch?: FetchLike };

export const isProduction = () => Deno.env.get("APP_ENV") === "production";

export function messagingMode(): "live" | "mock" {
  const forced = Deno.env.get("MESSAGING_MODE");
  if (forced === "live" || forced === "mock") return forced;
  return isProduction() ? "live" : "mock";
}
export const isMockMode = () => messagingMode() === "mock";

/**
 * The development shortcut for one-time codes: the fixed code 123456 and no SMS.
 * Only when this is NOT production AND messaging is in mock mode. Production always issues a random code, and any
 * environment with MESSAGING_MODE=live sends a real SMS, so an OTP can never be both "live" and silently unsent.
 */
export const useDevOtp = () => !isProduction() && isMockMode();

/** KES per SMS part in mock mode, close to the real Africa's Talking price, so cost columns look plausible. */
export const MOCK_SMS_COST_KES = 0.8;

const TIMEOUT_MS = 10_000;
const E164 = /^\+[1-9]\d{7,14}$/;

const AT_OK = new Set([100, 101, 102]); // Processed, Sent, Queued

export const withBrand = (message: string) => (/^\s*EpicMKT\b/i.test(message) ? message.trim() : `EpicMKT: ${message.trim()}`);

/** Africa's Talking answers HTTP 201 even when a recipient fails, so the per-recipient status decides. */
export async function deliverSms(to: string, raw: string, deps: DeliveryDeps = {}): Promise<Delivery> {
  if (!E164.test(to)) return { ok: false, mock: false, error: "invalid_phone" };
  if (!raw.trim()) return { ok: false, mock: false, error: "empty_message" };
  const message = withBrand(raw);

  if (messagingMode() === "mock") {
    return { ok: true, mock: true, providerId: `mock-${crypto.randomUUID()}`, costKes: Math.round(countSms(message).segments * MOCK_SMS_COST_KES * 100) / 100 };
  }

  const key = Deno.env.get("AT_API_KEY");
  const username = Deno.env.get("AT_USERNAME");
  if (!key || !username) return { ok: false, mock: false, error: "sms_not_configured" };
  const sender = Deno.env.get("AT_SENDER");
  const host = username === "sandbox" ? "api.sandbox.africastalking.com" : "api.africastalking.com";
  const body = new URLSearchParams({ username, to, message });
  if (sender) body.set("from", sender);

  try {
    const r = await (deps.fetch ?? fetch)(`https://${host}/version1/messaging`, {
      method: "POST",
      headers: { apiKey: key, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) return { ok: false, mock: false, error: `provider_http_${r.status}` };
    const data = await r.json().catch(() => null);
    const recipient = data?.SMSMessageData?.Recipients?.[0];
    if (!recipient) return { ok: false, mock: false, error: "provider_no_recipient" };
    if (!AT_OK.has(Number(recipient.statusCode))) {
      return { ok: false, mock: false, error: `at_${String(recipient.status ?? recipient.statusCode ?? "failed").replace(/[^A-Za-z0-9_]/g, "")}` };
    }
    const cost = Number(String(recipient.cost ?? "").replace(/[^0-9.]/g, ""));
    return {
      ok: true,
      mock: false,
      providerId: typeof recipient.messageId === "string" ? recipient.messageId : undefined,
      costKes: Number.isFinite(cost) && String(recipient.cost ?? "").trim() !== "" ? cost : undefined,
    };
  } catch {
    return { ok: false, mock: false, error: "provider_unreachable" };
  }
}

export async function deliverEmail(to: string | undefined, subject: string, html: string, deps: DeliveryDeps = {}): Promise<Delivery> {
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { ok: false, mock: false, error: "invalid_email" };

  if (messagingMode() === "mock") return { ok: true, mock: true, providerId: `mock-${crypto.randomUUID()}` };

  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("MAIL_FROM");
  if (!key || !from) return { ok: false, mock: false, error: "email_not_configured" };

  try {
    const r = await (deps.fetch ?? fetch)("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) return { ok: false, mock: false, error: `provider_http_${r.status}` };
    const data = await r.json().catch(() => null);
    return { ok: true, mock: false, providerId: typeof data?.id === "string" ? data.id : undefined };
  } catch {
    return { ok: false, mock: false, error: "provider_unreachable" };
  }
}
