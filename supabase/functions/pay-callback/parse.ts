// Pure helpers for the Safaricom C2B callback. No Deno or network APIs here, so they can be tested anywhere.
// Safaricom does not allow "mpesa", "safaricom" and similar words in callback URLs, so this function is named pay-callback.
// All parsing of the payment itself happens in the database (mpesa_ingest), so a payload we did not expect is
// still stored raw instead of being dropped here.

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
  try {
    return { secret: decodeURIComponent(parts[i + 1]), kind: parts[i + 2] };
  } catch {
    return null;
  }
}

/** The body as JSON, or { _raw } holding the text when it is not JSON. Never throws, so nothing is lost. */
export function bodyOf(text: string): Record<string, unknown> {
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? v : { _raw: text.slice(0, 5000) };
  } catch {
    return { _raw: text.slice(0, 5000) };
  }
}

export const ACCEPTED = { ResultCode: 0, ResultDesc: "Accepted" };

/** Which outcomes deserve an e-mail to the admin, and what it says. Routine renewals do not. */
export function alertFor(r: { outcome?: string; note?: string | null; business_name?: string | null; reference_no?: string | null; balance?: number },
                         tx: { amount?: number; code?: string; account?: string }): { subject: string; lines: string[] } | null {
  const money = `KES ${Number(tx.amount ?? 0).toLocaleString("en-KE")}`;
  switch (r.outcome) {
    case "needs_assignment":
      return {
        subject: `M-Pesa payment needs assigning: ${tx.code}`,
        lines: [`${money} arrived with the account “${tx.account ?? ""}” and could not be matched to one business (${r.note ?? "no match"}).`, "Open Payments in the admin site and assign it. The money is recorded and safe."],
      };
    case "ready":
      return {
        subject: `M-Pesa payment ready to confirm: ${r.business_name ?? tx.code}`,
        lines: [`${money} (code ${tx.code}) was paid for ${r.business_name ?? "an application"} (${r.reference_no ?? ""}).`, "Open Payments in the admin site and press Confirm to activate the seller."],
      };
    case "error":
      return {
        subject: `M-Pesa callback could not be processed: ${tx.code ?? ""}`,
        lines: ["A callback from Safaricom was saved but could not be processed. Open Payments in the admin site to reprocess or dismiss it."],
      };
    default:
      return null;
  }
}
