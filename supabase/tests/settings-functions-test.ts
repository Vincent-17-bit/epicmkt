import nodeAssert from "node:assert/strict";
import { sellerSignoutOthers } from "../functions/seller-signout-others/handler.ts";
import { dispatchMessages } from "../functions/dispatch-messages/handler.ts";
import { runReminders } from "../functions/run-reminders/handler.ts";

const assertEquals = (a: unknown, b: unknown) => nodeAssert.deepStrictEqual(a, b);
for (const k of ["log", "info", "warn", "error", "debug"] as const) (console as any)[k] = () => {};

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const jwt = (claims: Record<string, unknown> = {}) => `${b64({ alg: "HS256" })}.${b64({ sub: "u1", ...claims })}.sig`;
const BIZ = { id: "b1", seller_id: "ES100001", phone: "+254712345678", name: "Shop A", status: "live", user_id: "u1" };
const post = (headers: Record<string, string> = {}) => new Request("http://x/", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: "{}" });

function fakeDb(opts: { claimed?: any[]; users?: Map<string, any> } = {}) {
  const calls: { name: string; args: any }[] = [];
  const audits: any[] = [];
  const users = opts.users ?? new Map([[jwt({ session_id: "s1" }), { id: "u1" }], [jwt(), { id: "u1" }]]);
  const db: any = {
    rpc: (name: string, args: any) => {
      calls.push({ name, args });
      if (name === "hit_rate_limit") return Promise.resolve({ data: true, error: null });
      if (name === "revoke_user_sessions") return Promise.resolve({ data: 3, error: null });
      if (name === "outbox_claim") return Promise.resolve({ data: opts.claimed ?? [], error: null });
      if (name === "seller_run_reminders") return Promise.resolve({ data: 2, error: null });
      return Promise.resolve({ data: null, error: null });
    },
    from: (t: string) => {
      const api: any = {
        select: () => api, eq: () => api, neq: () => api,
        maybeSingle: () => Promise.resolve({ data: t === "businesses" ? BIZ : null, error: null }),
        insert: (row: any) => (audits.push(row), Promise.resolve({ error: null })),
      };
      return api;
    },
    auth: { getUser: (t: string) => Promise.resolve(users.has(t) ? { data: { user: users.get(t) }, error: null } : { data: { user: null }, error: { message: "bad" } }) },
  };
  return { db, calls, audits };
}

const deps = (db: any) => ({ db, anon: db, sms: () => Promise.resolve(true), code: () => "123456", salt: "s" });

Deno.test("sign out others: keeps this session, audits, and needs a signed-in seller", async () => {
  const { db, calls, audits } = fakeDb();
  const handler = sellerSignoutOthers(deps(db));
  const ok = await handler(post({ authorization: `Bearer ${jwt({ session_id: "s1" })}` }));
  assertEquals(ok.status, 200);
  assertEquals(await ok.json(), { ok: true, signedOut: 3 });
  assertEquals(calls.find((c) => c.name === "revoke_user_sessions")!.args, { p_user: "u1", p_keep: "s1" });
  assertEquals(audits[0].action, "signed_out_other_devices");

  assertEquals((await handler(post())).status, 401);
  assertEquals((await handler(post({ authorization: "Bearer nope" }))).status, 401);
});

Deno.test("sign out others: refuses when the current session cannot be identified", async () => {
  const { db, calls } = fakeDb();
  const r = await sellerSignoutOthers(deps(db))(post({ authorization: `Bearer ${jwt()}` }));
  assertEquals(r.status, 400);
  assertEquals(calls.some((c) => c.name === "revoke_user_sessions"), false);
});

const row = (over: Record<string, unknown>) => ({ id: 1, business_id: "b1", event: "change_decision", channel: "sms", kind: "normal", to_address: "+254712345678", subject: "S", body: "Hello", attempts: 1, settings: null, ...over });
const NIGHT = new Date("2026-10-11T19:00:00Z"); // 22:00 in Nairobi
const DAY = new Date("2026-10-11T09:00:00Z");

function dispatch(claimed: any[], now: Date, send: { sms?: boolean; mail?: boolean } = {}) {
  const f = fakeDb({ claimed });
  const sent: string[] = [];
  const handler = dispatchMessages({
    db: f.db,
    sms: (to) => (sent.push(`sms:${to}`), Promise.resolve(send.sms ?? true)),
    mail: (to) => (sent.push(`mail:${to}`), Promise.resolve(send.mail ?? true)),
    secret: "top-secret",
    now: () => now,
  });
  return { ...f, sent, handler };
}
const auth = { "x-dispatch-secret": "top-secret" };
const finishes = (calls: { name: string; args: any }[]) => calls.filter((c) => c.name === "outbox_finish").map((c) => c.args);

Deno.test("dispatch: needs the shared secret", async () => {
  const d = dispatch([row({})], DAY);
  assertEquals((await d.handler(post())).status, 401);
  assertEquals((await d.handler(post({ "x-dispatch-secret": "wrong" }))).status, 401);
  assertEquals(d.calls.length, 0);
  const empty = dispatchMessages({ db: fakeDb().db, sms: async () => true, mail: async () => true, secret: "", now: () => DAY });
  assertEquals((await empty(post({ "x-dispatch-secret": "" }))).status, 401);
});

Deno.test("dispatch: sends in the daytime and marks the row sent", async () => {
  const d = dispatch([row({}), row({ id: 2, channel: "email", to_address: "a@shop.test", settings: { notifications: { events: { change_decision: { email: true } } } } })], DAY);
  const r = await (await d.handler(post(auth))).json();
  assertEquals(r, { ok: true, claimed: 2, sent: 2, skipped: 0, delayed: 0, failed: 0 });
  assertEquals(d.sent, ["sms:+254712345678", "mail:a@shop.test"]);
  assertEquals(finishes(d.calls).map((f) => f.p_status), ["sent", "sent"]);
});

Deno.test("dispatch: holds non-critical SMS during quiet hours but sends critical and transactional", async () => {
  const d = dispatch([
    row({ id: 1 }),
    row({ id: 2, event: "expiry" }),
    row({ id: 3, kind: "transactional" }),
    row({ id: 4, channel: "email", to_address: "a@shop.test", settings: { notifications: { events: { change_decision: { email: true } } } } }),
  ], NIGHT);
  const r = await (await d.handler(post(auth))).json();
  assertEquals([r.sent, r.delayed], [3, 1]);
  const f = finishes(d.calls);
  assertEquals(f[0].p_status, "pending");
  assertEquals(f[0].p_deliver_after, "2026-10-12T04:00:00.000Z");
  assertEquals(d.sent.includes("sms:+254712345678"), true);
  assertEquals(d.sent.length, 3);
});

Deno.test("dispatch: preferences changed after queueing are honoured", async () => {
  const off = { notifications: { events: { change_decision: { sms: false } }, quiet_hours: { enabled: false } } };
  const d = dispatch([row({ settings: off }), row({ id: 2, settings: { notifications: { quiet_hours: { enabled: false } } } })], NIGHT);
  const r = await (await d.handler(post(auth))).json();
  assertEquals([r.skipped, r.sent, r.delayed], [1, 1, 0]);
  assertEquals(finishes(d.calls)[0].p_status, "skipped");
});

Deno.test("dispatch: failures retry until the fifth attempt, then fail for good", async () => {
  const d = dispatch([row({ attempts: 2, event: "expiry" }), row({ id: 2, attempts: 5, event: "expiry" })], DAY, { sms: false });
  const r = await (await d.handler(post(auth))).json();
  assertEquals(r.failed, 2);
  assertEquals(finishes(d.calls).map((f) => f.p_status), ["pending", "failed"]);
});

Deno.test("dispatch: a thrown send error does not stop the batch", async () => {
  const f = fakeDb({ claimed: [row({ event: "expiry" }), row({ id: 2, event: "expiry" })] });
  let n = 0;
  const handler = dispatchMessages({ db: f.db, sms: () => { n += 1; if (n === 1) throw new Error("network"); return Promise.resolve(true); }, mail: async () => true, secret: "k", now: () => DAY });
  const r = await (await handler(post({ "x-dispatch-secret": "k" }))).json();
  assertEquals([r.sent, r.failed], [1, 1]);
});

Deno.test("run-reminders: needs the secret and reports how many were queued", async () => {
  const f = fakeDb();
  const handler = runReminders({ db: f.db, secret: "k", now: () => DAY });
  assertEquals((await handler(post())).status, 401);
  const r = await handler(post({ "x-dispatch-secret": "k" }));
  assertEquals(await r.json(), { ok: true, queued: 2 });
  assertEquals(f.calls.find((c) => c.name === "seller_run_reminders")!.args, { p_now: DAY.toISOString() });
});
