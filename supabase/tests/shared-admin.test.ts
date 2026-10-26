// Admin shared modules: auth + role check, rate limit, audit writer, zod helpers, providers (mock mode, Africa's Talking).
import nodeAssert from "node:assert/strict";
import { adminHandler, requireAdmin } from "../functions/_shared/admin.ts";
import { HttpError } from "../functions/_shared/errors.ts";
import { enforceRateLimit, hitRateLimit } from "../functions/_shared/ratelimit.ts";
import { ACTION_RE, redact, writeAudit } from "../functions/_shared/audit.ts";
import { kenyanPhone, mpesaCode, pagination, pageRange, parseBody, reason, z } from "../functions/_shared/schemas.ts";
import { deliverEmail, deliverSms, messagingMode } from "../functions/_shared/providers.ts";
import { roleAllowed } from "../functions/_shared/roles.ts";
import { json } from "../functions/_shared/http.ts";

const assert = (v: unknown, m?: string) => nodeAssert.ok(v, m);
const assertEquals = (a: unknown, b: unknown) => nodeAssert.deepStrictEqual(a, b);
const rejects = async (p: Promise<unknown>, status: number, code: string) => {
  try { await p; } catch (e) {
    assert(e instanceof HttpError, `expected HttpError, got ${e}`);
    assertEquals([(e as HttpError).status, (e as HttpError).code], [status, code]);
    return;
  }
  throw new Error(`expected ${status} ${code}`);
};

// ---- fake database ----------------------------------------------------------------------------
type Fake = ReturnType<typeof fakeDb>;
function fakeDb(opts: { users?: Record<string, { id: string; email?: string }>; admins?: Array<{ user_id: string; role: unknown }>; adminError?: boolean; rpc?: (name: string, args: any) => any; insertError?: boolean } = {}) {
  const inserted: Array<{ table: string; row: any }> = [];
  const rpcs: Array<{ name: string; args: any }> = [];
  const db: any = {
    auth: { getUser: async (jwt: string) => (opts.users?.[jwt] ? { data: { user: opts.users[jwt] }, error: null } : { data: { user: null }, error: { message: "bad jwt" } }) },
    from: (table: string) => ({
      select: () => ({
        eq: (_c: string, v: string) => ({
          maybeSingle: async () =>
            opts.adminError ? { data: null, error: { message: "db down" } } : { data: (opts.admins ?? []).find((a) => a.user_id === v) ?? null, error: null },
        }),
      }),
      insert: async (row: any) => {
        if (opts.insertError) return { error: { message: "nope" } };
        inserted.push({ table, row });
        return { error: null };
      },
    }),
    rpc: async (name: string, args: any) => { rpcs.push({ name, args }); return opts.rpc ? opts.rpc(name, args) : { data: true, error: null }; },
  };
  return Object.assign(db, { inserted, rpcs });
}
const req = (token?: string, body: unknown = {}, method = "POST") =>
  new Request("https://x.test/fn", { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: method === "POST" ? JSON.stringify(body) : undefined });
const world = () => fakeDb({
  users: { T_OWNER: { id: "u-owner", email: "o@epicmkt.app" }, T_FIN: { id: "u-fin" }, T_SUP: { id: "u-sup" }, T_SELLER: { id: "u-seller" }, T_ODD: { id: "u-odd" } },
  admins: [{ user_id: "u-owner", role: "owner" }, { user_id: "u-fin", role: "finance" }, { user_id: "u-sup", role: "support" }, { user_id: "u-odd", role: "superuser" }],
});

// ---- requireAdmin -----------------------------------------------------------------------------
Deno.test("requireAdmin: 401 without a token, 401 for a bad token, 403 for a non-admin", async () => {
  const db = world();
  await rejects(requireAdmin(req(), db), 401, "unauthorized");
  await rejects(requireAdmin(req("nope"), db), 401, "unauthorized");
  await rejects(requireAdmin(new Request("https://x.test", { headers: { authorization: "Bearer " } }), db), 401, "unauthorized");
  await rejects(requireAdmin(req("T_SELLER"), db), 403, "forbidden");
});

Deno.test("requireAdmin: any admin passes with no list; owner passes every list; others need the role", async () => {
  const db = world();
  assertEquals((await requireAdmin(req("T_FIN"), db)).admin.role, "finance");
  const owner = await requireAdmin(req("T_OWNER"), db, ["finance"]);
  assertEquals([owner.user.id, owner.user.email, owner.admin.role], ["u-owner", "o@epicmkt.app", "owner"]);
  assertEquals((await requireAdmin(req("T_FIN"), db, ["finance"])).admin.role, "finance");
  await rejects(requireAdmin(req("T_SUP"), db, ["owner", "finance"]), 403, "forbidden");
  await rejects(requireAdmin(req("T_FIN"), db, ["reviewer"]), 403, "forbidden");
  await rejects(requireAdmin(req("T_ODD"), db), 403, "forbidden"); // an unknown role value is never trusted
});

Deno.test("requireAdmin: a database failure is a 500, not a 403", async () => {
  await rejects(requireAdmin(req("T_OWNER"), fakeDb({ users: { T_OWNER: { id: "u-owner" } }, adminError: true })), 500, "server_error");
});

Deno.test("roleAllowed mirrors public.has_role: owner always, no list means any", () => {
  assert(roleAllowed("owner", ["finance"]));
  assert(roleAllowed("support"));
  assert(!roleAllowed("support", ["reviewer"]));
});

// ---- adminHandler -----------------------------------------------------------------------------
Deno.test("adminHandler: preflight, method, auth before input, rate limit, error mapping", async () => {
  const db = world();
  const h = adminHandler({ name: "test", roles: ["finance"], getDb: () => db }, async ({ req, user }) => {
    const body = await parseBody(req, z.object({ n: z.number().int() }));
    return { n: body.n, by: user.id };
  });
  assertEquals((await h(new Request("https://x.test", { method: "OPTIONS" }))).status, 200);
  assertEquals((await h(req("T_OWNER", {}, "GET"))).status, 405);
  // anonymous callers are told nothing about the body
  const anon = await h(req(undefined, { n: "bad" }));
  assertEquals([anon.status, await anon.json()], [401, { error: "unauthorized" }]);
  assertEquals((await h(req("T_SUP", { n: 1 }))).status, 403);
  const ok = await h(req("T_FIN", { n: 2 }));
  assertEquals([ok.status, await ok.json()], [200, { n: 2, by: "u-fin" }]);
  assertEquals(ok.headers.get("cache-control"), "no-store");
  const bad = await h(req("T_FIN", { n: "x" }));
  const badBody = await bad.json();
  assertEquals([bad.status, badBody.error], [422, "invalid_input"]);
  assert(!JSON.stringify(badBody).includes('"x"'), "the rejected value is not echoed back");
  assertEquals(db.rpcs.at(-1).args.p_key, "admin:test:u-fin");
});

Deno.test("adminHandler: 429 with retryAfter, and unexpected errors never leak their text", async () => {
  const limited = fakeDb({ users: { T: { id: "u" } }, admins: [{ user_id: "u", role: "owner" }], rpc: () => ({ data: false, error: null }) });
  const h = adminHandler({ name: "x", rate: { max: 1, windowSeconds: 90 }, getDb: () => limited }, async () => ({ ok: true }));
  const r = await h(req("T"));
  assertEquals([r.status, await r.json()], [429, { error: "rate_limited", retryAfter: 90 }]);

  const db = fakeDb({ users: { T: { id: "u" } }, admins: [{ user_id: "u", role: "owner" }] });
  const boom = adminHandler({ name: "boom", getDb: () => db }, async () => { throw new Error("relation secret_table does not exist"); });
  const original = console.error;
  const logged: string[] = [];
  console.error = (...a: unknown[]) => { logged.push(a.join(" ")); };
  try {
    const b = await boom(req("T"));
    const text = await b.text();
    assertEquals(b.status, 500);
    assertEquals(JSON.parse(text), { error: "server_error" });
    assert(!text.includes("secret_table"));
  } finally { console.error = original; }
  assertEquals(logged.length, 1);

  const direct = adminHandler({ name: "resp", getDb: () => db }, async () => json({ made: "here" }, 201));
  assertEquals((await direct(req("T"))).status, 201);
});

// ---- rate limit -------------------------------------------------------------------------------
Deno.test("hitRateLimit: true inside the limit, false over it, 500 when the limiter fails", async () => {
  assertEquals(await hitRateLimit(fakeDb({ rpc: () => ({ data: true, error: null }) }), "k", 5, 60), true);
  assertEquals(await hitRateLimit(fakeDb({ rpc: () => ({ data: false, error: null }) }), "k", 5, 60), false);
  await rejects(hitRateLimit(fakeDb({ rpc: () => ({ data: null, error: { message: "x" } }) }), "k", 5, 60), 500, "server_error");
  await rejects(hitRateLimit(fakeDb({ rpc: () => ({ data: null, error: { message: "TypeError: fetch failed" } }) }), "k", 5, 60), 503, "unavailable");
  await rejects(enforceRateLimit(fakeDb({ rpc: () => ({ data: false, error: null }) }), "k", 5, 60), 429, "rate_limited");
  const db = fakeDb();
  await hitRateLimit(db, "k", 5, 60);
  assertEquals(db.rpcs[0], { name: "hit_rate_limit", args: { p_key: "k", p_max: 5, p_window_seconds: 60 } });
  await hitRateLimit(db, "", 5, 60).then(() => { throw new Error("should throw"); }, (e) => assert(e instanceof RangeError));
});

// ---- audit ------------------------------------------------------------------------------------
Deno.test("writeAudit writes the actor, target, redacted before/after, reason and a hashed IP", async () => {
  const db = world() as Fake;
  const r = new Request("https://x.test", { headers: { "x-forwarded-for": "41.90.1.2" } });
  await writeAudit(db, {
    actor: { id: "u-owner", email: "o@epicmkt.app" }, action: "business.suspend", targetType: "business", targetId: "b1", businessId: "b1",
    before: { status: "live", password: "hunter2" }, after: { status: "suspended", token: "abc" }, reason: "  repeated fake prices  ", req: r,
  });
  const row = db.inserted[0];
  assertEquals(row.table, "audit_log");
  assertEquals(row.row.actor_role, "admin");
  assertEquals([row.row.actor_id, row.row.actor_email, row.row.target_type, row.row.target_id, row.row.business_id], ["u-owner", "o@epicmkt.app", "business", "b1", "b1"]);
  assertEquals(row.row.before, { status: "live", password: "[redacted]" });
  assertEquals(row.row.after, { status: "suspended", token: "[redacted]" });
  assertEquals(row.row.reason, "repeated fake prices");
  assert(/^[0-9a-f]{64}$/.test(row.row.ip_hash) && !JSON.stringify(row.row).includes("41.90.1.2"));
});

Deno.test("writeAudit: system actor, bad action, missing actor, failed insert", async () => {
  const db = fakeDb();
  await writeAudit(db, { actorRole: "system", action: "lifecycle.run", targetType: "system" });
  assertEquals([db.inserted[0].row.actor_role, db.inserted[0].row.actor_id, db.inserted[0].row.before], ["system", null, null]);
  await writeAudit(db, { actor: { id: "u" }, action: "x.y", targetType: "t", reason: "r".repeat(900) });
  assertEquals(db.inserted[1].row.reason.length, 500);
  await writeAudit(db, { actor: { id: "u" }, action: "bad action", targetType: "t" }).then(() => { throw new Error("no"); }, (e) => assert(e instanceof RangeError));
  await writeAudit(db, { action: "a.b", targetType: "t" }).then(() => { throw new Error("no"); }, (e) => assert(e instanceof RangeError));
  await rejects(writeAudit(fakeDb({ insertError: true }), { actor: { id: "u" }, action: "a.b", targetType: "t" }), 500, "audit_failed");
  assert(ACTION_RE.test("payment.confirm") && ACTION_RE.test("application.request_changes") && !ACTION_RE.test("Payment") && !ACTION_RE.test("nodot"));
});

Deno.test("redact masks secrets at any depth and caps size", () => {
  assertEquals(redact({ a: { newPassword: "x", list: [{ apiKey: "k", ok: 1 }] }, otp: "123456", mpesaCode: "ABC123DEFG" }),
    { a: { newPassword: "[redacted]", list: [{ apiKey: "[redacted]", ok: 1 }] }, otp: "[redacted]", mpesaCode: "ABC123DEFG" });
  assertEquals(redact(new Date("2026-01-01T00:00:00Z")), "2026-01-01T00:00:00.000Z");
  const deep: any = {}; let cur = deep; for (let i = 0; i < 20; i++) { cur.n = {}; cur = cur.n; }
  assert(JSON.stringify(redact(deep)).includes("[truncated]"));
});

Deno.test("writeAudit stores a marker instead of an oversized snapshot", async () => {
  const db = fakeDb();
  await writeAudit(db, { actor: { id: "u" }, action: "a.b", targetType: "t", after: { blob: "x".repeat(30_000) } });
  assertEquals(db.inserted[0].row.after.truncated, true);
});

// ---- schemas ----------------------------------------------------------------------------------
Deno.test("schemas: M-Pesa codes, phones, reasons, pagination", () => {
  assertEquals(mpesaCode.parse(" shk4a9x2lm "), "SHK4A9X2LM");
  assert(!mpesaCode.safeParse("SHORT").success && !mpesaCode.safeParse("SHK4A9X2L!").success);
  assertEquals(kenyanPhone.parse("0712 345 678"), "+254712345678");
  assertEquals(kenyanPhone.parse("+254112345678"), "+254112345678");
  assert(!kenyanPhone.safeParse("12345").success);
  assertEquals(reason.parse("  too many strikes "), "too many strikes");
  assert(!reason.safeParse("no").success);
  assertEquals(pagination.parse({}), { page: 1, pageSize: 25 });
  assert(!pagination.safeParse({ pageSize: 500 }).success);
  assertEquals(pageRange({ page: 3, pageSize: 25 }), { from: 50, to: 74 });
});

Deno.test("parseBody: bad JSON is 400, empty body is 400 unless allowed, schema failures are 422 without values", async () => {
  const s = z.object({ n: z.number().default(7) });
  await rejects(parseBody(new Request("https://x.test", { method: "POST", body: "{nope" }), s), 400, "bad_request");
  await rejects(parseBody(new Request("https://x.test", { method: "POST", body: "" }), s), 400, "bad_request");
  assertEquals(await parseBody(new Request("https://x.test", { method: "POST", body: "" }), s, { allowEmpty: true }), { n: 7 });
  try { await parseBody(new Request("https://x.test", { method: "POST", body: JSON.stringify({ n: "secret-value" }) }), s); throw new Error("no"); }
  catch (e) { assertEquals((e as HttpError).status, 422); assert(!JSON.stringify((e as HttpError).extra).includes("secret-value")); }
});

// ---- providers --------------------------------------------------------------------------------
async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const keys = ["APP_ENV", "MESSAGING_MODE", "AT_API_KEY", "AT_USERNAME", "AT_SENDER", "RESEND_API_KEY", "MAIL_FROM"];
  const saved = keys.map((k) => [k, Deno.env.get(k)] as const);
  for (const k of keys) Deno.env.delete(k);
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) Deno.env.set(k, v);
  try { return await fn(); } finally { for (const [k, v] of saved) v === undefined ? Deno.env.delete(k) : Deno.env.set(k, v); }
}
const never = () => { throw new Error("network must not be used"); };
const atReply = (r: object, status = 201) => (async () => new Response(JSON.stringify({ SMSMessageData: { Message: "x", Recipients: [r] } }), { status })) as any;

Deno.test("providers: mock mode by default outside production, never touches the network", async () => {
  await withEnv({}, async () => {
    assertEquals(messagingMode(), "mock");
    const sms = await deliverSms("+254712345678", "a".repeat(161), { fetch: never });
    assertEquals([sms.ok, sms.mock, sms.costKes], [true, true, 1.6]);
    assert(sms.providerId?.startsWith("mock-"));
    assertEquals((await deliverEmail("a@b.co", "s", "<p>x</p>", { fetch: never })).mock, true);
  });
  await withEnv({ APP_ENV: "production" }, async () => assertEquals(messagingMode(), "live"));
  await withEnv({ APP_ENV: "production", MESSAGING_MODE: "mock" }, async () => assertEquals(messagingMode(), "mock"));
  await withEnv({ MESSAGING_MODE: "live" }, async () => assertEquals(messagingMode(), "live"));
});

Deno.test("providers: bad input is refused in every mode", async () => {
  await withEnv({}, async () => {
    assertEquals((await deliverSms("0712345678", "hi")).error, "invalid_phone");
    assertEquals((await deliverSms("+254712345678", "   ")).error, "empty_message");
    assertEquals((await deliverEmail("nope", "s", "h")).error, "invalid_email");
    assertEquals((await deliverEmail(undefined, "s", "h")).error, "invalid_email");
  });
});

Deno.test("providers: live SMS needs secrets, uses the sandbox host, and trusts the recipient status, not HTTP 201", async () => {
  await withEnv({ APP_ENV: "production" }, async () => {
    assertEquals((await deliverSms("+254712345678", "hi", { fetch: never })).error, "sms_not_configured");
  });
  await withEnv({ APP_ENV: "production", AT_API_KEY: "k", AT_USERNAME: "sandbox", AT_SENDER: "EpicMKT" }, async () => {
    let seen: { url: string; body: string; key: string } | null = null;
    const ok = await deliverSms("+254712345678", "Hello", {
      fetch: async (url, init) => { seen = { url, body: String(init?.body), key: (init?.headers as any).apiKey }; return atReply({ statusCode: 101, status: "Success", cost: "KES 0.8000", messageId: "ATXid_9" })(); },
    });
    assertEquals([ok.ok, ok.providerId, ok.costKes, ok.mock], [true, "ATXid_9", 0.8, false]);
    assert(seen!.url.startsWith("https://api.sandbox.africastalking.com/"));
    assertEquals(seen!.key, "k");
    assert(seen!.body.includes("from=EpicMKT") && seen!.body.includes("to=%2B254712345678"));

    const rejected = await deliverSms("+254712345678", "Hello", { fetch: atReply({ statusCode: 403, status: "InvalidPhoneNumber" }) });
    assertEquals([rejected.ok, rejected.error], [false, "at_InvalidPhoneNumber"]);
    assertEquals((await deliverSms("+254712345678", "Hello", { fetch: atReply({ statusCode: 405, status: "InsufficientBalance" }) })).error, "at_InsufficientBalance");
    assertEquals((await deliverSms("+254712345678", "Hello", { fetch: async () => new Response("{}", { status: 201 }) })).error, "provider_no_recipient");
    assertEquals((await deliverSms("+254712345678", "Hello", { fetch: async () => new Response("no", { status: 401 }) })).error, "provider_http_401");
    assertEquals((await deliverSms("+254712345678", "Hello", { fetch: async () => { throw new Error("dns"); } })).error, "provider_unreachable");
  });
  await withEnv({ APP_ENV: "production", AT_API_KEY: "k", AT_USERNAME: "epicmkt" }, async () => {
    let url = "", body = "";
    await deliverSms("+254712345678", "Hi", { fetch: async (u, i) => { url = u; body = String(i?.body); return atReply({ statusCode: 100, status: "Processed", cost: "KES 0.8000", messageId: "m" })(); } });
    assert(url.startsWith("https://api.africastalking.com/") && !body.includes("from="), "no sender means no from field");
  });
});

Deno.test("providers: live email through Resend", async () => {
  await withEnv({ APP_ENV: "production" }, async () => assertEquals((await deliverEmail("a@b.co", "s", "h", { fetch: never })).error, "email_not_configured"));
  await withEnv({ APP_ENV: "production", RESEND_API_KEY: "rk", MAIL_FROM: "EpicMKT <no-reply@epicmkt.app>" }, async () => {
    let auth = "";
    const ok = await deliverEmail("a@b.co", "s", "h", { fetch: async (_u, i) => { auth = (i?.headers as any).Authorization; return new Response(JSON.stringify({ id: "em_1" }), { status: 200 }); } });
    assertEquals([ok.ok, ok.providerId, auth], [true, "em_1", "Bearer rk"]);
    assertEquals((await deliverEmail("a@b.co", "s", "h", { fetch: async () => new Response("{}", { status: 422 }) })).error, "provider_http_422");
  });
});
