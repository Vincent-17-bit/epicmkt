// Safaricom Daraja: Lipa Na M-Pesa Online (STK Push) and its status query.
// No Deno APIs here (configuration comes in through `env`, the network through `fetch`), so it is tested with a fake fetch.
//
// Secrets (supabase secrets set ...):
//   MPESA_ENV               sandbox (default) or production
//   MPESA_CONSUMER_KEY      the Daraja app's consumer key
//   MPESA_CONSUMER_SECRET   the Daraja app's consumer secret
//   MPESA_STK_SHORTCODE     BusinessShortCode: the Paybill number (for a Till: the head office / store number Safaricom gave you)
//   MPESA_STK_PASSKEY       the Lipa Na M-Pesa Online passkey Safaricom sent for that shortcode
//   MPESA_STK_TYPE          paybill (default) or till
//   MPESA_STK_PARTYB        who receives the money; defaults to the shortcode (for a Till: the till number)
//   MPESA_CALLBACK_SECRET   already used by the Paybill callbacks; the STK callback URL uses it too
//   MPESA_STK_VERIFY        query (default): every success callback is checked with Safaricom's status query before
//                           any money is credited. off: trust the callback (not recommended).
//   MPESA_CALLBACK_BASE     optional: the public base URL of the functions if it is not SUPABASE_URL (custom domain)

import { BUSINESS_TIME_ZONE, zonedParts } from "./synced/time.js";

export type DarajaConfig = {
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  shortCode: string;
  passkey: string;
  partyB: string;
  transactionType: "CustomerPayBillOnline" | "CustomerBuyGoodsOnline";
  callbackUrl: string;
  verify: boolean;
  sandbox: boolean;
};

export const SANDBOX_URL = "https://sandbox.safaricom.co.ke";
export const PRODUCTION_URL = "https://api.safaricom.co.ke";

/** null when something needed is missing: the portal then answers stk_not_configured and shows the Paybill details. */
export function darajaConfigFromEnv(env: (name: string) => string | undefined): DarajaConfig | null {
  const v = (n: string) => (env(n) ?? "").trim();
  const sandbox = v("MPESA_ENV").toLowerCase() !== "production";
  const shortCode = v("MPESA_STK_SHORTCODE");
  const secret = v("MPESA_CALLBACK_SECRET");
  const base = (v("MPESA_CALLBACK_BASE") || v("SUPABASE_URL")).replace(/\/+$/, "");
  const cfg = {
    baseUrl: sandbox ? SANDBOX_URL : PRODUCTION_URL,
    consumerKey: v("MPESA_CONSUMER_KEY"),
    consumerSecret: v("MPESA_CONSUMER_SECRET"),
    shortCode,
    passkey: v("MPESA_STK_PASSKEY"),
    partyB: v("MPESA_STK_PARTYB") || shortCode,
    transactionType: v("MPESA_STK_TYPE").toLowerCase() === "till" ? "CustomerBuyGoodsOnline" as const : "CustomerPayBillOnline" as const,
    callbackUrl: base && secret ? `${base}/functions/v1/pay-callback/${encodeURIComponent(secret)}/stk` : "",
    verify: v("MPESA_STK_VERIFY").toLowerCase() !== "off",
    sandbox,
  };
  if (!cfg.consumerKey || !cfg.consumerSecret || !/^[0-9]{5,8}$/.test(cfg.shortCode) || !cfg.passkey || !/^[0-9]{5,8}$/.test(cfg.partyB)) return null;
  if (!cfg.callbackUrl.startsWith("https://")) return null;
  return cfg;
}

/** YYYYMMDDHHmmss in the business zone (Nairobi), as Daraja wants it. */
export function darajaTimestamp(now: Date): string {
  const t = zonedParts(now, BUSINESS_TIME_ZONE);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.year}${p(t.month)}${p(t.day)}${p(t.hour)}${p(t.minute)}${p(t.second)}`;
}

/** base64(shortcode + passkey + timestamp) */
export const darajaPassword = (shortCode: string, passkey: string, timestamp: string) => btoa(shortCode + passkey + timestamp);

/** 2547XXXXXXXX / 2541XXXXXXXX from 07.., 01.., +254.., 254.., 7..; null otherwise. Same rule as mpesa_stk_phone in SQL. */
export function stkPhone(input: unknown): string | null {
  const s = String(input ?? "").replace(/[^0-9+]/g, "");
  const m = s.match(/^(?:\+?254|0)?([71][0-9]{8})$/);
  return m ? `254${m[1]}` : null;
}

export type PushResult =
  | { ok: true; merchantRequestId: string; checkoutRequestId: string; customerMessage: string }
  | { ok: false; code: string; message: string };

export type QueryResult =
  | { state: "paid"; code: "0"; desc: string }
  | { state: "failed"; code: string; desc: string }
  | { state: "processing"; code: string; desc: string }
  | { state: "unavailable"; code: string; desc: string };

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

// Tokens live for an hour; one per consumer key is kept for 55 minutes.
const tokens = new Map<string, { token: string; until: number }>();
export const forgetDarajaTokens = () => tokens.clear();

async function readJson(res: Response): Promise<Record<string, any>> {
  try {
    const v = await res.json();
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function createDaraja(cfg: DarajaConfig, fetchFn: Fetch = fetch, now: () => Date = () => new Date()) {
  async function token(): Promise<string> {
    const hit = tokens.get(cfg.consumerKey);
    if (hit && hit.until > now().getTime()) return hit.token;
    const res = await fetchFn(`${cfg.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      method: "GET",
      headers: { Authorization: `Basic ${btoa(`${cfg.consumerKey}:${cfg.consumerSecret}`)}` },
      signal: AbortSignal.timeout(10_000),
    });
    const body = await readJson(res);
    if (!res.ok || typeof body.access_token !== "string" || !body.access_token) {
      throw new Error(`daraja_auth_failed: ${res.status} ${body.errorMessage ?? body.error_description ?? ""}`.trim());
    }
    tokens.set(cfg.consumerKey, { token: body.access_token, until: now().getTime() + 55 * 60_000 });
    return body.access_token;
  }

  async function call(path: string, payload: Record<string, unknown>, timeoutMs: number) {
    const send = async (t: string) => fetchFn(`${cfg.baseUrl}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    let res = await send(await token());
    if (res.status === 401) {
      // The cached token was revoked or expired early: get a fresh one once.
      tokens.delete(cfg.consumerKey);
      res = await send(await token());
    }
    return { res, body: await readJson(res) };
  }

  const auth = () => {
    const ts = darajaTimestamp(now());
    return { BusinessShortCode: cfg.shortCode, Password: darajaPassword(cfg.shortCode, cfg.passkey, ts), Timestamp: ts };
  };

  /** Send the PIN prompt. The amount, account and description come from the database (mpesa_stk_prepare), never the browser. */
  async function stkPush(p: { amount: number; phone: string; accountRef: string; description: string }): Promise<PushResult> {
    if (!Number.isInteger(p.amount) || p.amount < 1) return { ok: false, code: "invalid_amount", message: "The amount must be a whole number of shillings." };
    if (!/^254[71][0-9]{8}$/.test(p.phone)) return { ok: false, code: "invalid_phone", message: "Not a Safaricom number." };
    try {
      const { res, body } = await call("/mpesa/stkpush/v1/processrequest", {
        ...auth(),
        TransactionType: cfg.transactionType,
        Amount: p.amount,
        PartyA: p.phone,
        PartyB: cfg.partyB,
        PhoneNumber: p.phone,
        CallBackURL: cfg.callbackUrl,
        AccountReference: p.accountRef.slice(0, 12),
        TransactionDesc: p.description.slice(0, 13),
      }, 20_000);
      if (res.ok && String(body.ResponseCode) === "0" && body.CheckoutRequestID) {
        return { ok: true, merchantRequestId: String(body.MerchantRequestID ?? ""), checkoutRequestId: String(body.CheckoutRequestID), customerMessage: String(body.CustomerMessage ?? "") };
      }
      return { ok: false, code: String(body.errorCode ?? body.ResponseCode ?? res.status), message: String(body.errorMessage ?? body.ResponseDescription ?? "Safaricom refused the request") };
    } catch (e) {
      return { ok: false, code: "network", message: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Ask Safaricom what happened to a prompt. Never throws. */
  async function stkQuery(checkoutRequestId: string): Promise<QueryResult> {
    try {
      const { res, body } = await call("/mpesa/stkpushquery/v1/query", { ...auth(), CheckoutRequestID: checkoutRequestId }, 15_000);
      const err = String(body.errorCode ?? "");
      // "The transaction is being processed": the payer has not answered yet.
      if (err === "500.001.1001" || /being processed|still under processing/i.test(String(body.errorMessage ?? ""))) {
        return { state: "processing", code: err || "processing", desc: String(body.errorMessage ?? "") };
      }
      if (res.ok && String(body.ResponseCode) === "0" && body.ResultCode !== undefined && body.ResultCode !== null) {
        const code = String(body.ResultCode).trim();
        const desc = String(body.ResultDesc ?? "");
        if (code === "0") return { state: "paid", code: "0", desc };
        if (code === "4999") return { state: "processing", code, desc };
        return { state: "failed", code, desc };
      }
      return { state: "unavailable", code: err || String(res.status), desc: String(body.errorMessage ?? "") };
    } catch (e) {
      return { state: "unavailable", code: "network", desc: e instanceof Error ? e.message : String(e) };
    }
  }

  return { token, stkPush, stkQuery };
}

export type Daraja = ReturnType<typeof createDaraja>;

/** What a status query result means for a success callback that claims the same CheckoutRequestID. */
export function verificationOf(q: QueryResult): "query_ok" | "query_failed" | "query_unavailable" {
  if (q.state === "paid") return "query_ok";
  if (q.state === "failed") return "query_failed";
  return "query_unavailable";
}

/** Errors from mpesa_stk_prepare, said the way the payer should hear them. */
export const PREPARE_ERRORS: Record<string, { status: number; message: string }> = {
  invalid_phone: { status: 400, message: "Enter a Safaricom M-Pesa number, like 0712 345 678." },
  invalid_months: { status: 400, message: "Choose between 1 and 12 months." },
  not_payable: { status: 409, message: "This application cannot be paid yet. Wait for approval." },
  already_paid: { status: 409, message: "Your payment is already received. We are setting up your page." },
  already_activated: { status: 409, message: "Your page is already live. Sign in to the seller portal to renew." },
  not_priced: { status: 409, message: "The price for this plan is not set yet. Contact support." },
  nothing_to_pay: { status: 409, message: "There is nothing to pay for this right now." },
  use_credit: { status: 409, message: "Your credit already covers this. Use the credit instead." },
  paid_ahead: { status: 409, message: "You are already paid ahead for the longest time allowed." },
  amount_too_large: { status: 400, message: "That is more than M-Pesa allows in one payment. Choose fewer months." },
  renew_first: { status: 409, message: "Renew your subscription first." },
  invalid_upgrade: { status: 400, message: "This upgrade is not available." },
  invalid_category: { status: 400, message: "That category is not available." },
  change_not_found: { status: 409, message: "The category change request was not found. Request the change again." },
  invalid_purpose: { status: 400, message: "Unknown payment." },
  target_not_found: { status: 404, message: "Business not found." },
};

export function prepareError(message: string | undefined): { status: number; error: string; message: string } {
  const key = Object.keys(PREPARE_ERRORS).find((k) => (message ?? "").includes(k));
  if (!key) return { status: 500, error: "server_error", message: "Something went wrong. Try again." };
  return { status: PREPARE_ERRORS[key].status, error: key, message: PREPARE_ERRORS[key].message };
}
