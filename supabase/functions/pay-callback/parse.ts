// Pure helpers for the Safaricom C2B callback. No Deno or network APIs here, so they can be tested anywhere.
// Safaricom does not allow "mpesa", "safaricom" and similar words in callback URLs, so this function is named pay-callback.

export type C2B = {
  transId: string;
  amount: number;
  account: string;
  msisdn: string;
  name: string;
  shortCode: string;
  transTime: string | null;
};

const text = (v: unknown) => (v == null ? "" : String(v)).trim();

/** "20261018143005" is Nairobi time (UTC+3). Returns an ISO string, or null when it cannot be read. */
export function parseTransTime(v: unknown): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(text(v));
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const ms = Date.UTC(+y, +mo - 1, +d, +h - 3, +mi, +s);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Reads a C2B confirmation body. Returns null when it is not a usable payment notice. */
export function parseC2B(body: any): C2B | null {
  if (!body || typeof body !== "object") return null;
  const transId = text(body.TransID).toUpperCase();
  const amount = Number(text(body.TransAmount));
  if (!/^[A-Z0-9]{10}$/.test(transId) || !Number.isFinite(amount) || amount <= 0) return null;
  return {
    transId,
    amount,
    account: text(body.BillRefNumber),
    msisdn: text(body.MSISDN),
    name: [body.FirstName, body.MiddleName, body.LastName].map(text).filter(Boolean).join(" "),
    shortCode: text(body.BusinessShortCode),
    transTime: parseTransTime(body.TransTime),
  };
}

/** Constant-time comparison so the URL secret cannot be guessed from response timing. */
export function sameSecret(a: string, b: string): boolean {
  if (!a || !b) return false;
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** /functions/v1/pay-callback/<secret>/<confirmation|validation> -> { secret, kind } */
export function routeOf(pathname: string): { secret: string; kind: string } | null {
  const parts = pathname.split("/").filter(Boolean);
  const i = parts.indexOf("pay-callback");
  if (i < 0 || parts.length < i + 3) return null;
  return { secret: decodeURIComponent(parts[i + 1]), kind: parts[i + 2] };
}

export const ACCEPTED = { ResultCode: 0, ResultDesc: "Accepted" };
