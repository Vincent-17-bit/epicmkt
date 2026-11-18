// The Daraja client and the "Pay now" (STK Push) handlers, with a fake Safaricom and a fake database.
// The database side (amounts, crediting, duplicates, disputes) is tested against Postgres in mpesa-stk.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDaraja, darajaConfigFromEnv, darajaPassword, darajaTimestamp, forgetDarajaTokens, prepareError, stkPhone, verificationOf,
  PRODUCTION_URL, SANDBOX_URL, type DarajaConfig,
} from "../functions/_shared/daraja.ts";
import { afterStk, publicView, reconcileStk, startStk, stkCallback, stkStatus, type StkDeps } from "../functions/_shared/stk.ts";

const ENV: Record<string, string> = {
  MPESA_CONSUMER_KEY: "key", MPESA_CONSUMER_SECRET: "secret", MPESA_STK_SHORTCODE: "174379", MPESA_STK_PASSKEY: "pass",
  MPESA_CALLBACK_SECRET: "s3cret/x", SUPABASE_URL: "https://abc.supabase.co/",
};
const env = (over: Record<string, string> = {}) => (n: string) => ({ ...ENV, ...over })[n];

// ------------------------------------------------------------------ configuration
test("configuration: sandbox by default, production on request, callback URL from the project URL and the secret", () => {
  const c = darajaConfigFromEnv(env())!;
  assert.equal(c.baseUrl, SANDBOX_URL);
  assert.equal(c.sandbox, true);
  assert.equal(c.transactionType, "CustomerPayBillOnline");
  assert.equal(c.partyB, "174379");
  assert.equal(c.callbackUrl, "https://abc.supabase.co/functions/v1/pay-callback/s3cret%2Fx/stk");
  assert.equal(c.verify, true);
  const p = darajaConfigFromEnv(env({ MPESA_ENV: "production", MPESA_STK_TYPE: "till", MPESA_STK_PARTYB: "5123456", MPESA_STK_VERIFY: "off" }))!;
  assert.equal(p.baseUrl, PRODUCTION_URL);
  assert.equal(p.transactionType, "CustomerBuyGoodsOnline");
  assert.equal(p.partyB, "5123456");
  assert.equal(p.verify, false);
  assert.equal(darajaConfigFromEnv(env({ MPESA_CALLBACK_BASE: "https://pay.epicmkt.app" }))!.callbackUrl, "https://pay.epicmkt.app/functions/v1/pay-callback/s3cret%2Fx/stk");
});

test("configuration: anything missing or odd means 'not configured' (the page then shows Paybill only)", () => {
  for (const missing of ["MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET", "MPESA_STK_SHORTCODE", "MPESA_STK_PASSKEY", "MPESA_CALLBACK_SECRET", "SUPABASE_URL"]) {
    assert.equal(darajaConfigFromEnv(env({ [missing]: "" })), null, missing);
  }
  assert.equal(darajaConfigFromEnv(env({ MPESA_STK_SHORTCODE: "abc" })), null);
  assert.equal(darajaConfigFromEnv(env({ SUPABASE_URL: "http://localhost:54321" })), null, "Safaricom only calls https URLs");
});

test("timestamp is Nairobi time and the password is base64(shortcode + passkey + timestamp)", () => {
  assert.equal(darajaTimestamp(new Date("2026-11-16T21:05:09Z")), "20261117000509");
  assert.equal(darajaPassword("174379", "pass", "20261117000509"), btoa("174379pass20261117000509"));
});

test("phones: the same rule as the database", () => {
  for (const [given, want] of [["0712345678", "254712345678"], ["0110 345 678", "254110345678"], ["+254712345678", "254712345678"], ["712345678", "254712345678"]]) {
    assert.equal(stkPhone(given), want, given);
  }
  for (const bad of ["0812345678", "", null, "+255712345678", "07123456789"]) assert.equal(stkPhone(bad), null, String(bad));
});

// ------------------------------------------------------------------ the Daraja client against a fake Safaricom
type Call = { url: string; init: RequestInit; body: any };
function fakeSafaricom(answers: Record<string, (body: any, n: number) => { status?: number; json: unknown }>) {
  const calls: Call[] = [];
  const count: Record<string, number> = {};
  const fetchFn = async (url: string, init: RequestInit = {}) => {
    const path = new URL(url).pathname;
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, init, body });
    count[path] = (count[path] ?? 0) + 1;
    const a = answers[path];
    if (!a) return new Response("{}", { status: 404 });
    const { status = 200, json } = a(body, count[path]);
    return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
  };
  return { calls, fetchFn };
}
const TOKEN = { "/oauth/v1/generate": () => ({ json: { access_token: "tok-1", expires_in: "3599" } }) };
const cfg = (): DarajaConfig => darajaConfigFromEnv(env())!;
const now = () => new Date("2026-11-16T06:00:00Z");

test("STK Push: exactly what Safaricom needs, with the database's amount and a short account", async () => {
  forgetDarajaTokens();
  const s = fakeSafaricom({ ...TOKEN, "/mpesa/stkpush/v1/processrequest": () => ({ json: { MerchantRequestID: "m-1", CheckoutRequestID: "ws_CO_1", ResponseCode: "0", ResponseDescription: "Success", CustomerMessage: "Success. Request accepted for processing" } }) });
  const d = createDaraja(cfg(), s.fetchFn, now);
  const r = await d.stkPush({ amount: 500, phone: "254712345678", accountRef: "ES100001", description: "Renewal" });
  assert.deepEqual(r, { ok: true, merchantRequestId: "m-1", checkoutRequestId: "ws_CO_1", customerMessage: "Success. Request accepted for processing" });
  const auth = s.calls[0];
  assert.equal((auth.init.headers as Record<string, string>).Authorization, `Basic ${btoa("key:secret")}`);
  const push = s.calls[1];
  assert.equal((push.init.headers as Record<string, string>).Authorization, "Bearer tok-1");
  assert.deepEqual(push.body, {
    BusinessShortCode: "174379", Password: btoa("174379pass20261116090000"), Timestamp: "20261116090000",
    TransactionType: "CustomerPayBillOnline", Amount: 500, PartyA: "254712345678", PartyB: "174379", PhoneNumber: "254712345678",
    CallBackURL: "https://abc.supabase.co/functions/v1/pay-callback/s3cret%2Fx/stk", AccountReference: "ES100001", TransactionDesc: "Renewal",
  });
  // the token is reused
  await d.stkPush({ amount: 1, phone: "254712345678", accountRef: "ES100001", description: "Renewal" });
  assert.equal(s.calls.filter((c) => c.url.includes("/oauth/")).length, 1);
});

test("STK Push: refuses bad input before calling Safaricom, reports Safaricom's refusal, survives the network", async () => {
  forgetDarajaTokens();
  const s = fakeSafaricom({ ...TOKEN, "/mpesa/stkpush/v1/processrequest": () => ({ status: 400, json: { requestId: "r", errorCode: "400.002.02", errorMessage: "Bad Request - Invalid PhoneNumber" } }) });
  const d = createDaraja(cfg(), s.fetchFn, now);
  assert.equal((await d.stkPush({ amount: 0, phone: "254712345678", accountRef: "A", description: "x" }) as any).code, "invalid_amount");
  assert.equal((await d.stkPush({ amount: 10.5, phone: "254712345678", accountRef: "A", description: "x" }) as any).code, "invalid_amount");
  assert.equal((await d.stkPush({ amount: 10, phone: "0712345678", accountRef: "A", description: "x" }) as any).code, "invalid_phone");
  assert.equal(s.calls.length, 0);
  assert.deepEqual(await d.stkPush({ amount: 10, phone: "254712345678", accountRef: "A", description: "x" }), { ok: false, code: "400.002.02", message: "Bad Request - Invalid PhoneNumber" });
  const broken = createDaraja(cfg(), async () => { throw new Error("connection reset"); }, now);
  forgetDarajaTokens();
  const r = await broken.stkPush({ amount: 10, phone: "254712345678", accountRef: "A", description: "x" });
  assert.equal((r as any).code, "network");
});

test("a revoked token is replaced once", async () => {
  forgetDarajaTokens();
  let tokenN = 0;
  const s = fakeSafaricom({
    "/oauth/v1/generate": () => ({ json: { access_token: `tok-${++tokenN}` } }),
    "/mpesa/stkpush/v1/processrequest": (_b, n) => (n === 1 ? { status: 401, json: { errorCode: "404.001.03", errorMessage: "Invalid Access Token" } } : { json: { ResponseCode: "0", CheckoutRequestID: "ws_CO_2", MerchantRequestID: "m" } }),
  });
  const r = await createDaraja(cfg(), s.fetchFn, now).stkPush({ amount: 10, phone: "254712345678", accountRef: "A", description: "x" });
  assert.equal(r.ok, true);
  assert.equal(tokenN, 2);
});

test("status query: paid, failed, still processing, Safaricom busy", async () => {
  forgetDarajaTokens();
  const answers: Record<string, { status?: number; json: unknown }> = {
    paid: { json: { ResponseCode: "0", ResultCode: "0", ResultDesc: "The service request is processed successfully." } },
    cancelled: { json: { ResponseCode: "0", ResultCode: "1032", ResultDesc: "Request cancelled by user" } },
    waiting: { status: 500, json: { errorCode: "500.001.1001", errorMessage: "The transaction is being processed" } },
    busy: { status: 429, json: { errorCode: "500.003.02", errorMessage: "System is busy" } },
  };
  const s = fakeSafaricom({ ...TOKEN, "/mpesa/stkpushquery/v1/query": (b) => answers[b.CheckoutRequestID] });
  const d = createDaraja(cfg(), s.fetchFn, now);
  assert.equal((await d.stkQuery("paid")).state, "paid");
  assert.deepEqual(await d.stkQuery("cancelled"), { state: "failed", code: "1032", desc: "Request cancelled by user" });
  assert.equal((await d.stkQuery("waiting")).state, "processing");
  assert.equal((await d.stkQuery("busy")).state, "unavailable");
  assert.equal(verificationOf({ state: "paid", code: "0", desc: "" }), "query_ok");
  assert.equal(verificationOf({ state: "failed", code: "1032", desc: "" }), "query_failed");
  assert.equal(verificationOf({ state: "processing", code: "x", desc: "" }), "query_unavailable");
});

test("database errors become plain messages; unknown ones stay generic", () => {
  assert.deepEqual(prepareError('P0001: invalid_phone'), { status: 400, error: "invalid_phone", message: "Enter a Safaricom M-Pesa number, like 0712 345 678." });
  assert.equal(prepareError("use_credit").status, 409);
  assert.equal(prepareError("relation does not exist").error, "server_error");
});

// ------------------------------------------------------------------ the handlers
type RpcLog = { name: string; args: any }[];
function fakeDb(rpc: Record<string, (args: any) => { data?: unknown; error?: { message: string } | null }>, settings: unknown = { type: "paybill", number: "247247", stk: true }) {
  const log: RpcLog = [];
  return {
    log,
    rpc: async (name: string, args: any) => {
      log.push({ name, args });
      const h = rpc[name] ?? (name === "hit_rate_limit" ? () => ({ data: true }) : () => ({ error: { message: `no fake for ${name}` } }));
      const r = h(args);
      return { data: r.data ?? null, error: r.error ?? null };
    },
    from: (_t: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: settings === null ? null : { value: settings } }) }) }) }),
  };
}
const view = (over: Record<string, unknown> = {}) => ({
  id: "11111111-1111-1111-1111-111111111111", status: "creating", message: "Sending.", amount: 500, months: 1, phone: "254712345678", account: "ES100001",
  description: "Renewal", purpose: "renewal", checkoutRequestId: null, queryCount: 0, ...over,
});
function deps(db: any, over: Partial<StkDeps> = {}) {
  forgetDarajaTokens();
  const pushes: any[] = [];
  const queries: string[] = [];
  const activated: string[] = [];
  const alerts: string[] = [];
  const d: StkDeps = {
    db,
    daraja: {
      token: async () => "t",
      stkPush: async (p) => { pushes.push(p); return { ok: true, merchantRequestId: "m", checkoutRequestId: "ws_CO_9", customerMessage: "Success" }; },
      stkQuery: async (id) => { queries.push(id); return { state: "paid", code: "0", desc: "ok" }; },
    },
    verify: true,
    salt: "salt",
    sha256Hex: async (s) => `h(${s})`,
    ip: () => "1.2.3.4",
    sessionApp: async (token) => (token === "t".repeat(40) ? { id: "app-1", status: "approved" } : null),
    authenticate: async (req) => (req.headers.get("authorization") === "Bearer seller" ? { userId: "user-1", business: { id: "biz-1" } } : new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })),
    activate: async (id) => { activated.push(id); return { activated: true }; },
    alert: async (subject) => { alerts.push(subject); },
    now: () => new Date("2026-11-16T06:00:00Z"),
    cronSecret: "cron-secret-0123456789",
    ...over,
  };
  return { d, pushes, queries, activated, alerts };
}
const req = (auth?: string, headers: Record<string, string> = {}) => new Request("https://x/functions/v1/pay-stk-start", { method: "POST", headers: { ...(auth ? { authorization: auth } : {}), ...headers } });
const body = async (r: Response) => ({ status: r.status, json: await r.json() });

test("start (seller): the database decides the amount; the browser cannot send one", async () => {
  const db = fakeDb({ mpesa_stk_prepare: () => ({ data: { reused: false, request: view() } }), mpesa_stk_mark_sent: (a) => ({ data: view({ status: "pending", checkoutRequestId: a.p_checkout }) }) });
  const { d, pushes } = deps(db);
  const sneaky = await body(await startStk(d)(req("Bearer seller"), { phone: "0712345678", amount: 1 }));
  assert.equal(sneaky.status, 400, "unknown fields such as an amount are refused");
  const r = await body(await startStk(d)(req("Bearer seller"), { phone: "0712345678", months: 2, purpose: "renewal" }));
  assert.equal(r.status, 200);
  assert.equal(r.json.request.status, "pending");
  assert.equal(r.json.request.checkoutRequestId, undefined, "internal ids stay on the server");
  const prep = db.log.find((x) => x.name === "mpesa_stk_prepare")!.args;
  assert.deepEqual([prep.p_type, prep.p_id, prep.p_by, prep.p_actor, prep.p_months, prep.p_purpose], ["business", "biz-1", "seller", "user-1", 2, "renewal"]);
  assert.deepEqual(pushes, [{ amount: 500, phone: "254712345678", accountRef: "ES100001", description: "Renewal" }]);
  assert.equal(db.log.find((x) => x.name === "mpesa_stk_mark_sent")!.args.p_checkout, "ws_CO_9");
});

test("start (applicant): the status session decides who pays; the purpose is always the first payment", async () => {
  const db = fakeDb({ mpesa_stk_prepare: () => ({ data: { reused: false, request: view({ account: "2026ABC234", purpose: "first" }) } }), mpesa_stk_mark_sent: () => ({ data: view({ status: "pending" }) }) });
  const { d } = deps(db);
  const r = await body(await startStk(d)(req(), { token: "t".repeat(40), phone: "0712345678", purpose: "upgrade" }));
  assert.equal(r.status, 200);
  const prep = db.log.find((x) => x.name === "mpesa_stk_prepare")!.args;
  assert.deepEqual([prep.p_type, prep.p_id, prep.p_by, prep.p_purpose, prep.p_actor], ["application", "app-1", "applicant", null, null]);
  const expired = await body(await startStk(d)(req(), { token: "x".repeat(40), phone: "0712345678" }));
  assert.equal(expired.status, 401);
  const nobody = await body(await startStk(d)(req(), { phone: "0712345678" }));
  assert.equal(nobody.status, 401);
});

test("start: not configured, switched off, rate limited, refused by the database, already open, refused by Safaricom", async () => {
  const ok = { mpesa_stk_prepare: () => ({ data: { reused: false, request: view() } }), mpesa_stk_mark_sent: () => ({ data: view({ status: "pending" }) }) };
  assert.equal((await startStk(deps(fakeDb(ok), { daraja: null }).d)(req("Bearer seller"), { phone: "0712345678" })).status, 503);
  assert.equal((await startStk(deps(fakeDb(ok, { type: "paybill", number: "247247", stk: false })).d)(req("Bearer seller"), { phone: "0712345678" })).status, 503);
  assert.equal((await startStk(deps(fakeDb({ ...ok, hit_rate_limit: () => ({ data: false }) })).d)(req("Bearer seller"), { phone: "0712345678" })).status, 429);

  const refused = await body(await startStk(deps(fakeDb({ mpesa_stk_prepare: () => ({ error: { message: "use_credit" } }) })).d)(req("Bearer seller"), { phone: "0712345678" }));
  assert.deepEqual([refused.status, refused.json.error], [409, "use_credit"]);

  const reusedDeps = deps(fakeDb({ mpesa_stk_prepare: () => ({ data: { reused: true, request: view({ status: "pending" }) } }) }));
  const reused = await body(await startStk(reusedDeps.d)(req("Bearer seller"), { phone: "0712345678" }));
  assert.deepEqual([reused.status, reused.json.reused], [200, true]);
  assert.equal(reusedDeps.pushes.length, 0, "no second prompt");

  const db = fakeDb({ ...ok, mpesa_stk_mark_error: (a) => ({ data: view({ status: "error", resultCode: a.p_code, message: "We could not send the payment request." }) }) });
  const bad = deps(db, {});
  bad.d.daraja!.stkPush = async () => ({ ok: false, code: "500.001.1001", message: "Unable to lock subscriber" });
  const r = await body(await startStk(bad.d)(req("Bearer seller"), { phone: "0712345678" }));
  assert.equal(r.status, 502);
  assert.equal(r.json.error, "stk_send_failed");
  assert.equal(db.log.find((x) => x.name === "mpesa_stk_mark_error")!.args.p_code, "500.001.1001");
});

test("status: fresh prompts are not queried; a late one is asked about once and the answer applied", async () => {
  const sent = (sec: number) => new Date(Date.parse("2026-11-16T06:00:00Z") - sec * 1000).toISOString();
  let current = view({ status: "pending", checkoutRequestId: "ws_CO_5", sentAt: sent(10) });
  const db = fakeDb({ mpesa_stk_get: () => ({ data: current }), mpesa_stk_apply_query: (a) => { current = view({ status: a.p_code === "0" ? "confirming" : "failed" }); return { data: current }; } });
  const t = deps(db);
  const fresh = await body(await stkStatus(t.d)(req("Bearer seller"), { requestId: "11111111-1111-1111-1111-111111111111" }));
  assert.equal(fresh.json.request.status, "pending");
  assert.equal(t.queries.length, 0);
  current = view({ status: "pending", checkoutRequestId: "ws_CO_5", sentAt: sent(40) });
  const late = await body(await stkStatus(t.d)(req("Bearer seller"), { requestId: "11111111-1111-1111-1111-111111111111" }));
  assert.deepEqual(t.queries, ["ws_CO_5"]);
  assert.equal(late.json.request.status, "confirming");
  assert.equal(db.log.find((x) => x.name === "mpesa_stk_apply_query")!.args.p_code, "0");
  const notMine = deps(fakeDb({ mpesa_stk_get: () => ({ data: null }) }));
  assert.equal((await stkStatus(notMine.d)(req("Bearer seller"), { requestId: "11111111-1111-1111-1111-111111111111" })).status, 404);
});

test("status: a paid applicant whose activation did not run gets a second chance", async () => {
  const t = deps(fakeDb({ mpesa_stk_get: () => ({ data: view({ status: "paid", targetType: "application" }) }) }));
  t.d.sessionApp = async () => ({ id: "app-7", status: "payment_confirming" });
  await stkStatus(t.d)(req(), { token: "t".repeat(40), requestId: "11111111-1111-1111-1111-111111111111" });
  assert.deepEqual(t.activated, ["app-7"]);
});

test("callback: a success is checked with Safaricom before the database credits it, then the applicant is activated", async () => {
  const db = fakeDb({
    mpesa_stk_ingest: () => ({ data: { needs_verification: true, callback_id: "cb-1", checkout_request_id: "ws_CO_1" } }),
    mpesa_stk_process: (a) => ({ data: { outcome: "ready", application_id: "app-1", verification: a.p_verification, duplicate: false } }),
  });
  const t = deps(db);
  const r = await stkCallback(t.d, { Body: {} }, "196.201.214.200");
  assert.equal(r.stored, true);
  assert.deepEqual(t.queries, ["ws_CO_1"]);
  assert.equal(db.log.find((x) => x.name === "mpesa_stk_process")!.args.p_verification, "query_ok");
  assert.deepEqual(t.activated, ["app-1"]);
  assert.deepEqual(t.alerts, []);
});

test("callback: Safaricom says it failed -> 'query_failed'; Safaricom unreachable -> 'query_unavailable'; nothing stored -> retry", async () => {
  for (const [state, want] of [["failed", "query_failed"], ["unavailable", "query_unavailable"]] as const) {
    const db = fakeDb({ mpesa_stk_ingest: () => ({ data: { needs_verification: true, callback_id: "cb", checkout_request_id: "ws" } }), mpesa_stk_process: () => ({ data: { outcome: "disputed" } }) });
    const t = deps(db);
    t.d.daraja!.stkQuery = async () => ({ state, code: "1032", desc: "" } as any);
    await stkCallback(t.d, {}, null);
    assert.equal(db.log.find((x) => x.name === "mpesa_stk_process")!.args.p_verification, want);
    assert.deepEqual(t.alerts, ["M-Pesa phone payment needs checking"]);
  }
  const down = deps(fakeDb({ mpesa_stk_ingest: () => ({ error: { message: "connection refused" } }) }));
  assert.equal((await stkCallback(down.d, {}, null)).stored, false);
});

test("callback: failures and duplicates need nobody", async () => {
  const t = deps(fakeDb({ mpesa_stk_ingest: () => ({ data: { outcome: "failed", code: "1032" } }) }));
  await stkCallback(t.d, {}, null);
  assert.deepEqual([t.queries, t.alerts, t.activated], [[], [], []]);
  const dup = deps(fakeDb({}));
  await afterStk(dup.d, { duplicate: true, outcome: "ready", application_id: "a" });
  assert.deepEqual(dup.activated, []);
});

test("reconcile: needs the cron secret; finishes stored callbacks, asks about late prompts, expires the rest", async () => {
  const db = fakeDb({
    mpesa_stk_unprocessed: () => ({ data: [{ callback_id: "cb-9", checkout_request_id: "ws_CO_9" }] }),
    mpesa_stk_process: () => ({ data: { outcome: "applied", duplicate: false } }),
    mpesa_stk_to_query: () => ({ data: [{ id: "r-1", checkout_request_id: "ws_CO_1" }, { id: "r-2", checkout_request_id: "ws_CO_2" }] }),
    mpesa_stk_apply_query: () => ({ data: {} }),
    mpesa_stk_expire_stale: () => ({ data: { expired: 3, errors: 1, alerted: 1 } }),
  });
  const t = deps(db);
  assert.equal((await reconcileStk(t.d)(req(undefined, { "x-cron-secret": "nope" }))).status, 401);
  const r = await body(await reconcileStk(t.d)(req(undefined, { "x-cron-secret": "cron-secret-0123456789" })));
  assert.deepEqual(r.json, { ok: true, callbacks: 1, queried: 2, settled: 2, expired: 3, errors: 1, alerted: 1, skipped: false });
  assert.deepEqual(t.queries, ["ws_CO_9", "ws_CO_1", "ws_CO_2"]);
  assert.deepEqual(t.alerts, ["M-Pesa: paid by phone prompt, receipt missing"]);
});

test("the browser never sees internal ids", () => {
  assert.deepEqual(publicView({ id: "x", status: "paid", checkoutRequestId: "ws", queryCount: 2, lastQueryAt: "t", applicationId: "a", businessId: "b", targetType: "business", description: "Renewal" }), { id: "x", status: "paid" });
  assert.equal(publicView(null), null);
});
