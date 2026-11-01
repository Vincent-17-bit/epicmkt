import nodeAssert from "node:assert/strict";
import { dispatchMessages } from "../functions/dispatch-messages/handler.ts";
import { dailyLifecycle } from "../functions/daily-lifecycle/handler.ts";
import { adminMessage } from "../functions/admin-message/handler.ts";
import { adminExport } from "../functions/admin-export/handler.ts";
import { csvCell, renderTemplate, type OutboundDeps, type SendResult } from "../functions/_shared/outbound.ts";

const assert = (v: unknown, m?: string) => nodeAssert.ok(v, m);
const assertEquals = (a: unknown, b: unknown, m?: string) => nodeAssert.deepStrictEqual(a, b, m);

const NOW = new Date("2026-10-14T09:00:00Z");
const ADMIN = "admin-jwt";
const BIZ_A = "10000000-0000-0000-0000-0000000000a1";
const BIZ_B = "10000000-0000-0000-0000-0000000000b1";

type W = {
  tables: Record<string, any[]>;
  rpc: Record<string, (a: any) => any>;
  rpcCalls: { name: string; args: any }[];
  sms: { to: string; message: string }[];
  emails: { to: string; subject: string }[];
  smsResult: () => SendResult;
  role: string | null;
};

const world = (): W => ({
  tables: {
    businesses: [
      { id: BIZ_A, name: "Shop A", seller_id: "ES100001", phone: "+254712345678", email: "a@x.test", paid_until: "2026-10-20T21:00:00Z", status: "live" },
      { id: BIZ_B, name: "Shop B", seller_id: "ES100002", phone: "+254722345678", email: null, paid_until: null, status: "live" },
    ],
    message_templates: [
      { key: "renewal_help", channel: null, subject: "Renewing", body_en: "Hi {{business_name}}, runs to {{paid_until}}", body_sw: null, transactional: true },
    ],
    messages: [], audit_log: [], admins: [], payments: [],
  },
  // The limiter allows by default; the rate-limit tests replace it.
  rpc: { hit_rate_limit: () => ({ data: true, error: null }) }, rpcCalls: [], sms: [], emails: [],
  smsResult: () => ({ ok: true, providerId: "at-1" }),
  role: "owner",
});

function makeDeps(w: W, over: Partial<OutboundDeps> = {}): OutboundDeps {
  const from = (t: string) => {
    const f: ((r: any) => boolean)[] = [];
    let lo = 0, hi = Infinity;
    const api: any = {
      select: () => api, order: () => api, limit: () => api,
      eq: (c: string, v: unknown) => (f.push((r) => r[c] === v), api),
      neq: (c: string, v: unknown) => (f.push((r) => r[c] !== v), api),
      in: (c: string, vs: unknown[]) => (f.push((r) => vs.includes(r[c])), api),
      like: (c: string, p: string) => (f.push((r) => new RegExp("^" + p.replace(/%/g, ".*") + "$").test(r[c] ?? "")), api),
      gte: (c: string, v: string) => (f.push((r) => r[c] >= v), api),
      lt: (c: string, v: string) => (f.push((r) => r[c] < v), api),
      range: (a: number, b: number) => ((lo = a), (hi = b + 1), api),
      maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      insert: (v: any) => ((w.tables[t] ??= []).push(...(Array.isArray(v) ? v : [v])), Promise.resolve({ error: null })),
      then: (res: any, rej: any) => Promise.resolve({ data: rows(), error: null }).then(res, rej),
    };
    const rows = () => (w.tables[t] ?? []).filter((r) => f.every((p) => p(r))).slice(lo, hi);
    return api;
  };
  const db = {
    from,
    rpc: (name: string, args: any) => {
      w.rpcCalls.push({ name, args });
      return Promise.resolve(w.rpc[name] ? w.rpc[name](args) : { data: null, error: null });
    },
    auth: {
      getUser: (jwt: string) => Promise.resolve(jwt === ADMIN ? { data: { user: { id: "u-admin" } }, error: null } : { data: { user: null }, error: { message: "bad" } }),
    },
  };
  // admins lookup depends on the role under test
  const realFrom = db.from;
  db.from = (t: string) => (t === "admins" ? realFrom("admins") : realFrom(t));
  w.tables.admins = w.role ? [{ user_id: "u-admin", role: w.role }] : [];
  return {
    db, cronSecret: "s3cret", dev: false, now: () => NOW,
    sendSms: (to, message) => (w.sms.push({ to, message }), Promise.resolve(w.smsResult())),
    sendEmail: (to, subject) => (w.emails.push({ to, subject }), Promise.resolve({ ok: true, providerId: "em-1" } as SendResult)),
    ...over,
  };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://x", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const cron = { "x-cron-secret": "s3cret" };
const bearer = { authorization: `Bearer ${ADMIN}` };

const claimed = (...rows: Partial<{ id: string; channel: string; to_address: string | null; subject: string; body: string }>[]) =>
  ({ data: rows.map((r, i) => ({ id: `m${i + 1}`, channel: "sms", to_address: "+254700000000", subject: "S", body: "B", ...r })), error: null });

// ---------------------------------------------------------------------------
// dispatch-messages
// ---------------------------------------------------------------------------
Deno.test("dispatch: dev mode sends nothing and marks sms/email 'sent' with provider_id 'dev'", async () => {
  const w = world();
  w.rpc.claim_due_messages = () => claimed({ id: "m1", channel: "sms" }, { id: "m2", channel: "email", to_address: "a@x.test" });
  w.rpc.record_message_result = () => ({ data: "sent", error: null });
  const res = await dispatchMessages(makeDeps(w, { dev: true }))(post({}, cron));
  const out = await res.json();
  assertEquals(res.status, 200);
  assertEquals(out.dev, true);
  assertEquals(out.sent, 2);
  assertEquals(w.sms.length, 0);
  assertEquals(w.emails.length, 0);
  const recs = w.rpcCalls.filter((c) => c.name === "record_message_result").map((c) => c.args);
  assertEquals(recs.map((r) => [r.p_ok, r.p_provider_id, r.p_final_status]), [[true, "dev", "sent"], [true, "dev", "sent"]]);
});

Deno.test("dispatch: in-app messages are recorded 'delivered' with no provider call", async () => {
  const w = world();
  w.rpc.claim_due_messages = () => claimed({ id: "m1", channel: "in_app", to_address: null });
  w.rpc.record_message_result = () => ({ data: "sent", error: null });
  await dispatchMessages(makeDeps(w))(post({}, cron));
  const rec = w.rpcCalls.find((c) => c.name === "record_message_result")!.args;
  assertEquals([rec.p_ok, rec.p_final_status], [true, "delivered"]);
  assertEquals(w.sms.length + w.emails.length, 0);
});

Deno.test("dispatch: production sends through the provider and records its id and cost", async () => {
  const w = world();
  w.smsResult = () => ({ ok: true, providerId: "ATXid_9", cost: 0.8 });
  w.rpc.claim_due_messages = () => claimed({ id: "m1", channel: "sms", body: "hello" });
  w.rpc.record_message_result = () => ({ data: "sent", error: null });
  await dispatchMessages(makeDeps(w))(post({}, cron));
  assertEquals(w.sms, [{ to: "+254700000000", message: "hello" }]);
  const rec = w.rpcCalls.find((c) => c.name === "record_message_result")!.args;
  assertEquals([rec.p_ok, rec.p_provider_id, rec.p_cost], [true, "ATXid_9", 0.8]);
});

Deno.test("dispatch: a provider failure or throw is reported as a failed attempt; the SQL decides retry vs failed", async () => {
  const w = world();
  w.smsResult = () => ({ ok: false, error: "sms_http_500" });
  w.rpc.claim_due_messages = () => claimed({ id: "m1", channel: "sms" }, { id: "m2", channel: "email", to_address: "a@x.test" });
  const outcomes = ["retry", "failed"];
  w.rpc.record_message_result = () => ({ data: outcomes.shift(), error: null });
  const deps = makeDeps(w, { sendEmail: () => Promise.reject(new TypeError("boom")) });
  const out = await (await dispatchMessages(deps)(post({}, cron))).json();
  assertEquals([out.retried, out.failed, out.sent], [1, 1, 0]);
  const recs = w.rpcCalls.filter((c) => c.name === "record_message_result").map((c) => c.args);
  assertEquals(recs.map((r) => [r.p_ok, r.p_error]), [[false, "sms_http_500"], [false, "provider_TypeError"]]);
});

Deno.test("dispatch: a message with no address fails the attempt instead of sending to nobody", async () => {
  const w = world();
  w.rpc.claim_due_messages = () => claimed({ id: "m1", channel: "sms", to_address: null });
  w.rpc.record_message_result = () => ({ data: "retry", error: null });
  await dispatchMessages(makeDeps(w))(post({}, cron));
  assertEquals(w.sms.length, 0);
  assertEquals(w.rpcCalls.find((c) => c.name === "record_message_result")!.args.p_error, "no_recipient_address");
});

Deno.test("dispatch: asks SQL for due messages using the injected clock", async () => {
  const w = world();
  w.rpc.claim_due_messages = () => ({ data: [], error: null });
  const out = await (await dispatchMessages(makeDeps(w))(post({ limit: 10 }, cron))).json();
  assertEquals(out.claimed, 0);
  const call = w.rpcCalls.find((c) => c.name === "claim_due_messages")!.args;
  assertEquals([call.p_now, call.p_limit], [NOW.toISOString(), 10]);
});

Deno.test("dispatch and daily-lifecycle: reject a bad or missing credential, accept the right role", async () => {
  const w = world();
  w.rpc.claim_due_messages = () => ({ data: [], error: null });
  w.rpc.queue_billing_notices = () => ({ data: { inApp: 0, queued: 0 }, error: null });
  for (const handler of [dispatchMessages, dailyLifecycle]) {
    assertEquals((await handler(makeDeps(w))(post({}))).status, 401);
    assertEquals((await handler(makeDeps(w))(post({}, { "x-cron-secret": "wrong" }))).status, 401);
    assertEquals((await handler(makeDeps(w, { cronSecret: undefined }))(post({}, { "x-cron-secret": "" }))).status, 401);
    assertEquals((await handler(makeDeps(w))(post({}, { authorization: "Bearer nope" }))).status, 401);
    assertEquals((await handler(makeDeps(w))(post({}, cron))).status, 200);
    assertEquals((await handler(makeDeps(w))(post({}, bearer))).status, 200);
  }
  const reviewer = world();
  reviewer.role = "reviewer";
  reviewer.rpc.claim_due_messages = () => ({ data: [], error: null });
  assertEquals((await dispatchMessages(makeDeps(reviewer))(post({}, bearer))).status, 403);
  const support = world();
  support.role = "support";
  support.rpc.queue_billing_notices = () => ({ data: { inApp: 0, queued: 0 }, error: null });
  assertEquals((await dailyLifecycle(makeDeps(support))(post({}, bearer))).status, 403);
});

// ---------------------------------------------------------------------------
// daily-lifecycle
// ---------------------------------------------------------------------------
Deno.test("daily-lifecycle: runs the billing notices once with the clock and audits the run; re-running reports zero new", async () => {
  const w = world();
  const results = [{ inApp: 2, queued: 3 }, { inApp: 0, queued: 0 }];
  w.rpc.queue_billing_notices = () => ({ data: results.shift(), error: null });
  const first = await (await dailyLifecycle(makeDeps(w))(post({}, cron))).json();
  const second = await (await dailyLifecycle(makeDeps(w))(post({}, cron))).json();
  assertEquals([first.inApp, first.queued], [2, 3]);
  assertEquals([second.inApp, second.queued], [0, 0]);
  assertEquals(w.rpcCalls[0].args.p_now, NOW.toISOString());
  assertEquals(w.tables.audit_log.map((a) => [a.action, a.actor_role]), [["lifecycle.daily", "system"], ["lifecycle.daily", "system"]]);
});

Deno.test("daily-lifecycle: stores the day's health snapshots after the notices and reports how many", async () => {
  const w = world();
  w.rpc.queue_billing_notices = () => ({ data: { inApp: 1, queued: 1 }, error: null });
  w.rpc.snapshot_business_health = () => ({ data: 42, error: null });
  const body = await (await dailyLifecycle(makeDeps(w))(post({}, cron))).json();
  assertEquals(body.healthSnapshots, 42);
  assertEquals(w.rpcCalls.map((c) => c.name).filter((n) => n !== "hit_rate_limit"), ["queue_billing_notices", "snapshot_business_health"]);
  assertEquals(w.tables.audit_log[0].after.healthSnapshots, 42);
});

Deno.test("daily-lifecycle: a failing health snapshot never fails the billing run", async () => {
  for (const snapshot of [() => ({ data: null, error: { message: "boom" } }), () => { throw new Error("down"); }]) {
    const w = world();
    w.rpc.queue_billing_notices = () => ({ data: { inApp: 2, queued: 3 }, error: null });
    w.rpc.snapshot_business_health = snapshot;
    const res = await dailyLifecycle(makeDeps(w))(post({}, cron));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals([body.inApp, body.queued, body.healthSnapshots], [2, 3, null]);
    assertEquals(w.tables.audit_log.length, 1);
  }
});

Deno.test("daily-lifecycle: a database error is a 500 and writes no audit row", async () => {
  const w = world();
  w.rpc.queue_billing_notices = () => ({ data: null, error: { message: "x" } });
  assertEquals((await dailyLifecycle(makeDeps(w))(post({}, cron))).status, 500);
  assertEquals(w.tables.audit_log.length, 0);
});

// ---------------------------------------------------------------------------
// admin-message
// ---------------------------------------------------------------------------
const ids = { businessIds: [BIZ_A, BIZ_B] };

Deno.test("admin-message: needs an admin; reviewer and support may send, finance may not", async () => {
  const w = world();
  assertEquals((await adminMessage(makeDeps(w))(post({ target: ids, channels: { sms: true }, body: "hi" }))).status, 401);
  w.role = "finance";
  assertEquals((await adminMessage(makeDeps(w))(post({ target: ids, channels: { sms: true }, body: "hi" }, bearer))).status, 403);
  w.role = "support";
  assertEquals((await adminMessage(makeDeps(w))(post({ target: ids, channels: { sms: true }, body: "hi" }, bearer))).status, 200);
});

Deno.test("admin-message: queues one row per recipient and channel, promotional by default, skipping missing addresses", async () => {
  const w = world();
  const out = await (await adminMessage(makeDeps(w))(post({ target: ids, channels: { sms: true, email: true }, body: "Hello {{business_name}}" }, bearer))).json();
  assertEquals(out.queued, 3); // B has no email
  assertEquals(out.skipped, { sms: 0, email: 1, inApp: 0 });
  assertEquals(out.transactional, false);
  const rows = w.tables.messages;
  assertEquals(rows.map((r) => [r.business_id, r.channel, r.status, r.transactional, r.body]).sort(), [
    [BIZ_A, "email", "queued", false, "Hello Shop A"],
    [BIZ_A, "sms", "queued", false, "Hello Shop A"],
    [BIZ_B, "sms", "queued", false, "Hello Shop B"],
  ]);
  assert(rows.every((r) => r.read_at), "delivery records stay out of the unread count");
  assertEquals(w.tables.audit_log[0].action, "message.queue");
  assertEquals(w.sms.length, 0, "admin-message never sends; the dispatcher does");
});

Deno.test("admin-message: a transactional template is transactional; in-app is delivered immediately, a scheduled one waits", async () => {
  const w = world();
  const out = await (await adminMessage(makeDeps(w))(post({ target: { businessIds: [BIZ_A] }, channels: { sms: true, inApp: true }, templateKey: "renewal_help" }, bearer))).json();
  assertEquals(out.transactional, true);
  const sms = w.tables.messages.find((r) => r.channel === "sms");
  assertEquals(sms.body, "Hi Shop A, runs to 20 Oct 2026".replace("20 Oct", "21 Oct")); // 21:00Z is already 21 Oct in Nairobi
  const inApp = w.tables.messages.find((r) => r.channel === "in_app");
  assertEquals([inApp.status, inApp.read_at], ["delivered", null]);

  const w2 = world();
  const later = new Date(NOW.getTime() + 3 * 86_400_000).toISOString();
  await adminMessage(makeDeps(w2))(post({ target: { businessIds: [BIZ_A] }, channels: { inApp: true }, body: "later", scheduledAt: later }, bearer));
  assertEquals([w2.tables.messages[0].status, w2.tables.messages[0].scheduled_at], ["queued", later]);
});

Deno.test("admin-message: preview shows what would go out and writes nothing", async () => {
  const w = world();
  const out = await (await adminMessage(makeDeps(w))(post({ target: ids, channels: { sms: true }, body: "Hi {{business_name}}", preview: true }, bearer))).json();
  assertEquals([out.preview, out.recipients, out.rows.sms], [true, 2, 2]);
  assertEquals(out.samples[0].body, "Hi Shop A");
  assertEquals(w.tables.messages.length + w.tables.audit_log.length, 0);
});

Deno.test("admin-message: rejects bad input before touching the database", async () => {
  const w = world();
  const send = (b: unknown) => adminMessage(makeDeps(w))(post(b, bearer));
  assertEquals((await send({ target: ids, channels: {}, body: "x" })).status, 422);                          // no channel
  assertEquals((await send({ target: ids, channels: { sms: true } })).status, 422);                          // no content
  assertEquals((await send({ target: {}, channels: { sms: true }, body: "x" })).status, 422);                // no target
  assertEquals((await send({ target: { ...ids, segment: "all_live" }, channels: { sms: true }, body: "x" })).status, 422); // two targets
  assertEquals((await send({ target: ids, channels: { sms: true }, body: "Hi {{nope}}" })).status, 422);     // missing variable
  assertEquals((await send({ target: ids, channels: { sms: true }, body: "x".repeat(700) })).status, 422);   // too long for SMS
  assertEquals((await send({ target: ids, channels: { sms: true }, templateKey: "ghost" })).status, 422);    // unknown template
  assertEquals((await send({ target: { businessIds: ["not-a-uuid"] }, channels: { sms: true }, body: "x" })).status, 422);
  assertEquals(w.tables.messages.length, 0);
});

Deno.test("admin-message: an unknown segment is a 422 and a segment resolves through SQL", async () => {
  const w = world();
  w.rpc.message_segment = (a: any) => (a.p_segment === "all_live" ? { data: [BIZ_A], error: null } : { data: null, error: { message: "unknown_segment" } });
  assertEquals((await adminMessage(makeDeps(w))(post({ target: { segment: "everyone" }, channels: { sms: true }, body: "x" }, bearer))).status, 422);
  const out = await (await adminMessage(makeDeps(w))(post({ target: { segment: "all_live" }, channels: { sms: true }, body: "x" }, bearer))).json();
  assertEquals(out.queued, 1);
});

Deno.test("admin-message: the same idempotencyKey never queues twice", async () => {
  const w = world();
  const body = { target: ids, channels: { sms: true }, body: "x", idempotencyKey: "retry-key-0001" };
  const first = await (await adminMessage(makeDeps(w))(post(body, bearer))).json();
  const second = await (await adminMessage(makeDeps(w))(post(body, bearer))).json();
  assertEquals([first.queued, second.queued, second.duplicate], [2, 0, true]);
  assertEquals(w.tables.messages.length, 2);
});

// ---------------------------------------------------------------------------
// admin-export
// ---------------------------------------------------------------------------
Deno.test("admin-export: roles are enforced per dataset and every export is audited", async () => {
  const w = world();
  w.role = "reviewer";
  assertEquals((await adminExport(makeDeps(w))(post({ dataset: "payments" }, bearer))).status, 403);
  w.role = "finance";
  assertEquals((await adminExport(makeDeps(w))(post({ dataset: "businesses" }, bearer))).status, 403);
  assertEquals((await adminExport(makeDeps(w))(post({ dataset: "audit" }, bearer))).status, 403);
  assertEquals((await adminExport(makeDeps(w))(post({ dataset: "payments" }, bearer))).status, 200);
  assertEquals((await adminExport(makeDeps(w))(post({ dataset: "payments" }))).status, 401);
  assertEquals(w.tables.audit_log.map((a) => [a.action, a.target_type, a.after.rows]), [["export.run", "payments", 0]]);
});

Deno.test("admin-export: CSV has a header, only allow-listed columns, and neutralises spreadsheet formulas", async () => {
  const w = world();
  w.tables.businesses = [
    { id: "1", name: '=HYPERLINK("http://evil","x")', phone: "+254712345678", status: "live", seller_id: "ES1", pin: "secret-hash", created_at: "2026-10-01T00:00:00Z" },
    { id: "2", name: "Mama, Njeri's \"Place\"", phone: "0712", status: "live", seller_id: "ES2", created_at: "2026-10-02T00:00:00Z" },
  ];
  const res = await adminExport(makeDeps(w))(post({ dataset: "businesses" }, bearer));
  assertEquals(res.status, 200);
  assert(res.headers.get("content-type")!.startsWith("text/csv"));
  assertEquals(res.headers.get("content-disposition"), 'attachment; filename="epicmkt-businesses-20261014.csv"');
  assertEquals(res.headers.get("x-export-rows"), "2");
  const text = await res.text();
  assert(text.startsWith("﻿id,seller_id,slug,name,"), "header row, BOM for Excel");
  assert(!text.includes("secret-hash") && !text.includes("pin"), "columns outside the allow-list are never exported");
  assert(text.includes(`"'=HYPERLINK(""http://evil"",""x"")"`), "formula cell is prefixed and quoted");
  assert(text.includes(`"Mama, Njeri's ""Place"""`), "commas and quotes are escaped");
});

Deno.test("admin-export: Nairobi day range is inclusive and bad ranges are rejected", async () => {
  const w = world();
  w.tables.payments = [
    { id: "a", created_at: "2026-10-01T20:59:59Z", amount_kes: 1 }, // 23:59:59 on 1 Oct in Nairobi
    { id: "b", created_at: "2026-10-01T21:00:00Z", amount_kes: 2 }, // 00:00 on 2 Oct
    { id: "c", created_at: "2026-10-02T20:59:59Z", amount_kes: 3 }, // last second of 2 Oct
    { id: "d", created_at: "2026-10-02T21:00:00Z", amount_kes: 4 }, // 3 Oct
  ];
  w.role = "finance";
  const out = await (await adminExport(makeDeps(w))(post({ dataset: "payments", format: "json", from: "2026-10-02", to: "2026-10-02" }, bearer))).json();
  assertEquals(out.rows.map((r: any) => r.id).sort(), ["b", "c"]);
  assertEquals((await adminExport(makeDeps(w))(post({ dataset: "payments", from: "2026-10-05", to: "2026-10-01" }, bearer))).status, 422);
  assertEquals((await adminExport(makeDeps(w))(post({ dataset: "payments", from: "10/01/2026" }, bearer))).status, 422);
  assertEquals((await adminExport(makeDeps(w))(post({ dataset: "secrets" }, bearer))).status, 422);
});

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------
Deno.test("csvCell: formulas are neutralised but real numbers and empty values are left alone", () => {
  assertEquals(csvCell("=1+1"), "'=1+1");
  assertEquals(csvCell("+254712345678"), "+254712345678"); // a plain number-looking string
  assertEquals(csvCell("-5"), "-5");
  assertEquals(csvCell("@SUM(A1)"), "'@SUM(A1)");
  assertEquals(csvCell(null), "");
  assertEquals(csvCell(42), "42");
  assertEquals(csvCell({ a: 1 }), '"{""a"":1}"');
});

Deno.test("renderTemplate: fills known variables and reports missing ones instead of sending blanks", () => {
  assertEquals(renderTemplate("Hi {{ name }}, {{x}}", { name: "A" }), { text: "Hi A, ", missing: ["x"] });
});

// ---------------------------------------------------------------------------
// Owner decision D2b: dispatch-messages audits a hand-run dispatch, never a cron run
// ---------------------------------------------------------------------------
const oneClaim = (w: W) => {
  w.rpc.claim_due_messages = () => claimed({ id: "m1", channel: "sms" });
  w.rpc.record_message_result = () => ({ data: "sent", error: null });
};

// The same deps, but every write to audit_log fails.
const failingAudit = (w: W) => {
  const deps = makeDeps(w);
  const db: any = deps.db;
  const from = db.from;
  db.from = (t: string) => (t === "audit_log" ? { insert: () => Promise.resolve({ error: { message: "boom" } }) } : from(t));
  return deps;
};

Deno.test("dispatch audit: an admin run writes exactly one 'dispatch.run' row with the counts", async () => {
  const w = world();
  oneClaim(w);
  const res = await dispatchMessages(makeDeps(w))(post({ limit: 10 }, bearer));
  assertEquals(res.status, 200);
  assertEquals(w.tables.audit_log.length, 1);
  const a = w.tables.audit_log[0];
  assertEquals([a.action, a.actor_role, a.actor_id, a.target_type], ["dispatch.run", "admin", "u-admin", "system"]);
  assertEquals(a.after, { limit: 10, dev: false, claimed: 1, sent: 1, retried: 0, failed: 0, skipped: 0 });
});

Deno.test("dispatch audit: a cron run writes no audit row, even when the audit table is broken", async () => {
  const w = world();
  oneClaim(w);
  assertEquals((await dispatchMessages(makeDeps(w))(post({}, cron))).status, 200);
  assertEquals(w.tables.audit_log.length, 0);

  const w2 = world();
  oneClaim(w2);
  const res = await dispatchMessages(failingAudit(w2))(post({}, cron));
  assertEquals([res.status, (await res.json()).sent], [200, 1]);
});

Deno.test("dispatch audit: if the audit write fails an admin run fails, as in the other functions", async () => {
  const w = world();
  oneClaim(w);
  const res = await dispatchMessages(failingAudit(w))(post({}, bearer));
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, "server_error");
  assertEquals(w.tables.audit_log.length, 0);

  // the same behaviour as daily-lifecycle, which audits too
  const w2 = world();
  assertEquals((await dailyLifecycle(failingAudit(w2))(post({}, bearer))).status, 500);
});

// ---------------------------------------------------------------------------
// Owner decision D1: rate limits for admin callers only
// ---------------------------------------------------------------------------
const limitCases: { name: string; action: string; max: number; window: number; work: string | null; call: (d: OutboundDeps) => Promise<Response> }[] = [
  { name: "admin-message", action: "message", max: 30, window: 60, work: null, call: (d) => adminMessage(d)(post({ target: ids, channels: { sms: true }, body: "hi" }, bearer)) },
  { name: "admin-export", action: "export", max: 10, window: 60, work: null, call: (d) => adminExport(d)(post({ dataset: "payments" }, bearer)) },
  { name: "dispatch-messages", action: "dispatch", max: 10, window: 60, work: "claim_due_messages", call: (d) => dispatchMessages(d)(post({}, bearer)) },
  { name: "daily-lifecycle", action: "lifecycle", max: 5, window: 3600, work: "queue_billing_notices", call: (d) => dailyLifecycle(d)(post({}, bearer)) },
];
const limiterCalls = (w: W) => w.rpcCalls.filter((c) => c.name === "hit_rate_limit").map((c) => c.args);

Deno.test("rate limits: an admin call spends one hit in its own per-admin, per-action bucket", async () => {
  for (const c of limitCases) {
    const w = world();
    assertEquals((await c.call(makeDeps(w))).status, 200, c.name);
    assertEquals(limiterCalls(w), [{ p_key: `admin:${c.action}:u-admin`, p_max: c.max, p_window_seconds: c.window }], c.name);
  }
});

Deno.test("rate limits: over the limit is a 429 with retryAfter, and no work is done", async () => {
  for (const c of limitCases) {
    const w = world();
    w.rpc.hit_rate_limit = () => ({ data: false, error: null });
    const res = await c.call(makeDeps(w));
    assertEquals(res.status, 429, c.name);
    assertEquals(await res.json(), { error: "rate_limited", retryAfter: c.window }, c.name);
    assertEquals(w.tables.messages.length + w.tables.audit_log.length, 0, c.name);
    if (c.work) assert(!w.rpcCalls.some((r) => r.name === c.work), `${c.name} did work while limited`);
  }
});

Deno.test("rate limits: cron is never limited and never touches the limiter", async () => {
  const w = world();
  w.rpc.hit_rate_limit = () => ({ data: false, error: null });
  oneClaim(w);
  assertEquals((await dispatchMessages(makeDeps(w))(post({}, cron))).status, 200);
  assertEquals((await dailyLifecycle(makeDeps(w))(post({}, cron))).status, 200);
  assertEquals(limiterCalls(w), []);
});

Deno.test("rate limits: callers who fail authentication or the role check do not spend the limiter", async () => {
  const w = world();
  assertEquals((await adminMessage(makeDeps(w))(post({ target: ids, channels: { sms: true }, body: "hi" }))).status, 401);
  w.role = "finance";
  assertEquals((await adminMessage(makeDeps(w))(post({ target: ids, channels: { sms: true }, body: "hi" }, bearer))).status, 403);
  assertEquals(limiterCalls(w), []);
});

Deno.test("rate limits: a broken limiter is a 500, never a free pass", async () => {
  for (const c of limitCases) {
    const w = world();
    w.rpc.hit_rate_limit = () => ({ data: null, error: { message: "down" } });
    const res = await c.call(makeDeps(w));
    assertEquals(res.status, 500, c.name);
    assertEquals(w.tables.messages.length + w.tables.audit_log.length, 0, c.name);
  }
});
