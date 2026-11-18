// "Pay now": the M-Pesa STK Push flow shared by pay-stk-start, pay-stk-status, pay-callback (route /stk) and pay-reconcile.
//
//   1. pay-stk-start   checks who is paying (seller login, or applicant status session), lets the database work out the amount
//                      (mpesa_stk_prepare), sends the PIN prompt to the phone, records Safaricom's CheckoutRequestID.
//   2. the payer enters the PIN on the phone. Nothing is typed on the site except (optionally) a different phone number.
//   3. pay-callback/<secret>/stk  Safaricom's answer. Stored raw first; a success is checked with Safaricom's status query
//                      before anything is credited, then credited to exactly the shop that asked, for what it asked.
//   4. pay-stk-status  the page polls it every few seconds; if the callback is late it asks Safaricom itself.
//   5. pay-reconcile   every 2 minutes: finishes stored callbacks, asks Safaricom about late prompts, expires dead ones.
// The browser never sends an amount and never sees a secret.
import { z } from "npm:zod@3";
import { json } from "./http.ts";
import { prepareError, verificationOf, type Daraja } from "./daraja.ts";

type Db = any;
type Row = Record<string, any>;

export type StkDeps = {
  db: Db;
  daraja: Daraja | null;
  verify: boolean;
  salt: string;
  sha256Hex: (s: string) => Promise<string>;
  ip: (req: Request) => string;
  sessionApp: (token: unknown) => Promise<Row | null>;
  authenticate: (req: Request) => Promise<{ userId: string; business: Row } | Response>;
  activate: (applicationId: string) => Promise<{ activated: boolean }>;
  alert: (subject: string, lines: string[]) => Promise<void>;
  now: () => Date;
  cronSecret?: string;
};

const months = z.coerce.number().int().min(1).max(24);
export const startSchema = z.object({
  token: z.string().min(32).max(200).optional(),
  phone: z.string().trim().min(9).max(20),
  months: months.optional(),
  purpose: z.enum(["first", "renewal", "upgrade", "category_change"]).optional(),
  targetPlan: z.enum(["standard", "premium"]).optional(),
  category: z.string().trim().min(1).max(60).optional(),
  changeId: z.string().uuid().optional(),
}).strict();
export const statusSchema = z.object({
  token: z.string().min(32).max(200).optional(),
  requestId: z.string().uuid(),
}).strict();

type Payer = { type: "application"; id: string; app: Row; actor: null; by: "applicant" } | { type: "business"; id: string; business: Row; actor: string; by: "seller" };

/** An applicant proves themselves with their status session token; a seller with their login. */
async function payerOf(req: Request, body: { token?: string }, d: StkDeps): Promise<Payer | Response> {
  if (body.token) {
    const app = await d.sessionApp(body.token);
    if (!app) return json({ error: "session_expired", message: "Your session has ended. Sign in to your application again." }, 401);
    // Once the shop is live the applicant page is not where renewals are paid.
    if (app.status === "activated") return json({ error: "already_activated", message: "Your page is already live. Sign in to the seller portal to renew." }, 409);
    return { type: "application", id: app.id, app, actor: null, by: "applicant" };
  }
  const ctx = await d.authenticate(req);
  if (ctx instanceof Response) return ctx;
  return { type: "business", id: ctx.business.id, business: ctx.business, actor: ctx.userId, by: "seller" };
}

async function rate(db: Db, key: string, max: number, seconds: number): Promise<boolean> {
  const r = await db.rpc("hit_rate_limit", { p_key: key, p_max: max, p_window_seconds: seconds });
  return r.error ? true : r.data === true; // a rate-limit table hiccup must not block a payment
}

/** What the browser may see of a request. */
export function publicView(r: Row | null) {
  if (!r) return null;
  const { checkoutRequestId: _c, queryCount: _q, lastQueryAt: _l, applicationId: _a, businessId: _b, targetType: _t, description: _d, ...rest } = r;
  return rest;
}

async function stkEnabled(db: Db): Promise<boolean> {
  const { data } = await db.from("site_settings").select("value").eq("key", "mpesa").maybeSingle();
  return data?.value?.stk === true && !!String(data?.value?.number ?? "").trim();
}

const NOT_CONFIGURED = { error: "stk_not_configured", message: "Paying by phone prompt is not available right now. Pay with Paybill instead." };

// ------------------------------------------------------------------ start
export const startStk = (d: StkDeps) => async (req: Request, raw: unknown): Promise<Response> => {
  const parsed = startSchema.safeParse(raw ?? {});
  if (!parsed.success) return json({ error: "bad_request", message: "Check the phone number and try again." }, 400);
  const input = parsed.data;
  const p = await payerOf(req, input, d);
  if (p instanceof Response) return p;
  if (!d.daraja || !(await stkEnabled(d.db))) return json(NOT_CONFIGURED, 503);

  const ipHash = await d.sha256Hex(d.salt + d.ip(req));
  const phoneKey = await d.sha256Hex(d.salt + input.phone.replace(/\D/g, "").slice(-9));
  if (!(await rate(d.db, `stk:start:${p.id}`, 6, 900)) || !(await rate(d.db, `stk:phone:${phoneKey}`, 6, 900)) || !(await rate(d.db, `stk:ip:${ipHash}`, 30, 3600))) {
    return json({ error: "rate_limited", message: "Too many payment requests. Wait a few minutes and try again.", retryAfter: 900 }, 429);
  }

  const prep = await d.db.rpc("mpesa_stk_prepare", {
    p_type: p.type, p_id: p.id,
    p_purpose: p.type === "business" ? input.purpose ?? null : null,
    p_target_plan: input.targetPlan ?? null, p_category: input.category ?? null, p_change_id: input.changeId ?? null,
    p_months: input.months ?? 1, p_phone: input.phone, p_by: p.by, p_actor: p.actor, p_ip_hash: ipHash,
  });
  if (prep.error) {
    const e = prepareError(prep.error.message);
    if (e.status >= 500) console.error("pay-stk-start: prepare failed", prep.error.message);
    return json({ error: e.error, message: e.message }, e.status);
  }
  const r = prep.data.request as Row;
  if (prep.data.reused) return json({ request: publicView(r), reused: true });

  const push = await d.daraja.stkPush({ amount: r.amount, phone: r.phone, accountRef: r.account, description: r.description ?? "EpicMKT" });
  if (push.ok) {
    const sent = await d.db.rpc("mpesa_stk_mark_sent", { p_id: r.id, p_merchant: push.merchantRequestId, p_checkout: push.checkoutRequestId, p_message: push.customerMessage });
    if (sent.error) {
      // The prompt IS on the phone; only our bookkeeping failed. The callback for an unknown CheckoutRequestID is still matched
      // (amount + phone + time) and never lost, so tell the payer to go ahead.
      console.error("pay-stk-start: could not record the CheckoutRequestID", sent.error.message);
      return json({ request: { ...publicView(r), status: "pending", message: "A payment request is on your phone. Enter your M-Pesa PIN there to pay." } });
    }
    return json({ request: publicView(sent.data) });
  }
  const failed = await d.db.rpc("mpesa_stk_mark_error", { p_id: r.id, p_code: push.code, p_desc: push.message });
  console.error("pay-stk-start: Safaricom refused the prompt", push.code, push.message);
  return json({ error: "stk_send_failed", message: failed.data?.message ?? "We could not send the payment request. Try again, or pay with Paybill.", request: publicView(failed.data ?? null) }, 502);
};

// ------------------------------------------------------------------ status
export const stkStatus = (d: StkDeps) => async (req: Request, raw: unknown): Promise<Response> => {
  const parsed = statusSchema.safeParse(raw ?? {});
  if (!parsed.success) return json({ error: "bad_request" }, 400);
  const input = parsed.data;
  let p: Payer | Response;
  if (input.token) {
    // The application may have just become a business: still let the applicant page see its own request.
    const app = await d.sessionApp(input.token);
    if (!app) return json({ error: "session_expired" }, 401);
    p = { type: "application", id: app.id, app, actor: null, by: "applicant" };
  } else {
    p = await payerOf(req, input, d);
  }
  if (p instanceof Response) return p;

  const get = async () => (await d.db.rpc("mpesa_stk_get", { p_id: input.requestId, p_target: p.id })).data as Row | null;
  let r = await get();
  if (!r) return json({ error: "not_found" }, 404);

  // The callback is late: ask Safaricom ourselves (not more than every 15 seconds per prompt).
  const sentAgo = r.sentAt ? d.now().getTime() - Date.parse(r.sentAt) : 0;
  const askedAgo = r.lastQueryAt ? d.now().getTime() - Date.parse(r.lastQueryAt) : Infinity;
  if (d.daraja && r.checkoutRequestId && (r.status === "pending" || r.status === "expired") && sentAgo > 25_000 && askedAgo > 15_000 && (r.queryCount ?? 0) < 8
      && await rate(d.db, `stk:query:${r.id}`, 8, 600)) {
    const q = await d.daraja.stkQuery(r.checkoutRequestId);
    if (q.state !== "unavailable") {
      await d.db.rpc("mpesa_stk_apply_query", { p_id: r.id, p_code: q.state === "processing" ? null : q.code, p_desc: q.desc, p_processing: q.state === "processing" });
      r = (await get()) ?? r;
    }
  }

  // Paid and the application is waiting: activation normally ran from the callback; this is its second chance.
  if (r.status === "paid" && r.targetType === "application" && p.type === "application" && p.app.status === "payment_confirming") {
    try { await d.activate(p.app.id); } catch (e) { console.error("pay-stk-status: activation", e instanceof Error ? e.message : e); }
  }
  return json({ request: publicView(r) });
};

// ------------------------------------------------------------------ callback
/** After the database has handled a callback: activate a paid applicant, e-mail the admin about anything needing a person. */
export async function afterStk(d: StkDeps, r: Row | null) {
  if (!r || r.duplicate) return;
  let live = false;
  if (r.outcome === "ready" && r.application_id) {
    try {
      live = (await d.activate(r.application_id)).activated;
    } catch (e) {
      console.error("stk: automatic activation failed", e instanceof Error ? e.message : e);
    }
  }
  const money = `KES ${Number(r.amount ?? 0).toLocaleString("en-KE")}`;
  let alert: { subject: string; lines: string[] } | null = null;
  if (r.outcome === "disputed") {
    alert = { subject: "M-Pesa phone payment needs checking", lines: [`A phone-prompt payment did not check out: ${r.note ?? "unknown reason"}.`, "Nothing was credited. Open Payments > Phone prompts in the admin site, compare with the M-Pesa statement, then credit or close it."] };
  } else if (r.outcome === "needs_assignment") {
    alert = { subject: `M-Pesa payment needs assigning: ${r.code ?? ""}`, lines: [`${money} arrived by phone prompt but could not be credited (${r.note ?? "no match"}).`, "Open Payments in the admin site and assign it. The money is recorded and safe."] };
  } else if (r.outcome === "ready" && !live) {
    alert = { subject: "M-Pesa payment ready to confirm", lines: [`${money} (code ${r.code ?? ""}) was paid by phone prompt for an application, but the automatic activation did not finish.`, "Open Payments in the admin site and press Confirm to activate the seller."] };
  } else if (r.outcome === "error") {
    alert = { subject: "M-Pesa callback could not be processed", lines: ["A phone-prompt callback from Safaricom was saved but could not be processed. It is retried every 2 minutes; if it stays, open Payments to reprocess or dismiss it."] };
  }
  if (alert) {
    try { await d.alert(alert.subject, alert.lines); } catch (_) { /* the payment is recorded; a failed e-mail changes nothing */ }
  }
}

/** Check a stored success callback with Safaricom, then let the database process it. */
export async function verifyAndProcess(d: StkDeps, callbackId: string, checkoutRequestId: string | null): Promise<Row | null> {
  let verification = "not_checked";
  if (d.verify && d.daraja && checkoutRequestId) verification = verificationOf(await d.daraja.stkQuery(checkoutRequestId));
  else if (d.verify) verification = "query_unavailable";
  const res = await d.db.rpc("mpesa_stk_process", { p_callback: callbackId, p_verification: verification });
  if (res.error) {
    console.error("stk: could not process callback", callbackId, res.error.message);
    return null;
  }
  return res.data as Row;
}

/** Safaricom's STK callback. Always answers "Accepted" once the raw body is stored (500 only when even that failed). */
export async function stkCallback(d: StkDeps, body: unknown, ip: string | null): Promise<{ stored: boolean; result: Row | null }> {
  const first = await d.db.rpc("mpesa_stk_ingest", { p_body: body, p_ip: ip, p_verification: null });
  if (first.error) {
    console.error("pay-callback: could not store the STK callback", first.error.message);
    return { stored: false, result: null };
  }
  let r = first.data as Row;
  if (r?.needs_verification) r = (await verifyAndProcess(d, r.callback_id, r.checkout_request_id ?? null)) ?? r;
  await afterStk(d, r);
  return { stored: true, result: r };
}

// ------------------------------------------------------------------ reconcile (cron)
export const reconcileStk = (d: StkDeps) => async (req: Request): Promise<Response> => {
  const secret = req.headers.get("x-cron-secret") ?? "";
  if (!d.cronSecret || secret !== d.cronSecret) return json({ error: "unauthorized" }, 401);
  const out = { callbacks: 0, queried: 0, settled: 0, expired: 0, errors: 0, alerted: 0, skipped: !d.daraja };

  // 1. success callbacks stored but not processed (the function stopped between storing and processing)
  const waiting = ((await d.db.rpc("mpesa_stk_unprocessed", { p_limit: 20 })).data ?? []) as Row[];
  for (const w of waiting) {
    const r = await verifyAndProcess(d, w.callback_id, w.checkout_request_id ?? null);
    await afterStk(d, r);
    out.callbacks += 1;
  }

  // 2. prompts whose callback is late: ask Safaricom
  if (d.daraja) {
    const due = ((await d.db.rpc("mpesa_stk_to_query", { p_limit: 20 })).data ?? []) as Row[];
    for (const s of due) {
      const q = await d.daraja.stkQuery(s.checkout_request_id);
      if (q.state === "unavailable") continue;
      await d.db.rpc("mpesa_stk_apply_query", { p_id: s.id, p_code: q.state === "processing" ? null : q.code, p_desc: q.desc, p_processing: q.state === "processing" });
      out.queried += 1;
      if (q.state === "paid") out.settled += 1;
    }
  }

  // 3. expire what nobody answered; report "paid but no receipt" once
  const ex = (await d.db.rpc("mpesa_stk_expire_stale")).data as Row | null;
  out.expired = ex?.expired ?? 0;
  out.errors = ex?.errors ?? 0;
  out.alerted = ex?.alerted ?? 0;
  if (out.alerted > 0) {
    try {
      await d.alert("M-Pesa: paid by phone prompt, receipt missing", [
        `${out.alerted} phone-prompt payment(s) were confirmed by Safaricom's status query over 30 minutes ago, but no receipt arrived.`,
        "Open Payments > Phone prompts in the admin site, find the receipt on the M-Pesa statement and credit it.",
      ]);
    } catch (_) { /* noted in the admin list either way */ }
  }
  return json({ ok: true, ...out });
};
