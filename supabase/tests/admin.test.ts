import nodeAssert from "node:assert/strict";
import { adminDecideApplication } from "../functions/admin-decide-application/handler.ts";
import { adminConfirmPayment } from "../functions/admin-confirm-payment/handler.ts";
import { adminResetSellerPassword } from "../functions/admin-reset-seller-password/handler.ts";
import { queueMessages } from "../functions/_shared/adminKit.ts";
import { eatMidnight } from "../functions/_shared/dates.ts";
import { APP2_ID, APP_ID, BIZ_ID, TOKENS, deps, post, read, world } from "./admin-world.ts";

const assertEquals = (a: unknown, b: unknown) => nodeAssert.deepStrictEqual(a, b);
const assert = (v: unknown, m?: string) => nodeAssert.ok(v, m);

const decide = (w = world()) => ({ w, run: (body: unknown, token: string = TOKENS.reviewer) => adminDecideApplication(deps(w))(post(body, token)).then(read) });
const confirm = (w = world()) => ({ w, run: (body: unknown, token: string = TOKENS.finance) => adminConfirmPayment(deps(w))(post(body, token)).then(read) });
const reset = (w = world()) => ({ w, run: (body: unknown, token: string = TOKENS.owner) => adminResetSellerPassword(deps(w))(post(body, token)).then(read) });

const allOn = { sms: true, email: true, inApp: true };
const pay = (over: Record<string, unknown> = {}) => ({ applicationId: APP2_ID, mpesaCode: "QWE1234567", amount: 500, months: 1, action: "confirm", ...over });

Deno.test("decide: preview renders messages per channel and sends nothing", async () => {
  const { w, run } = decide();
  const before = JSON.stringify(w.tables);
  const r = await run({ applicationId: APP_ID, action: "approve", channels: allOn, preview: true });
  assertEquals(r.status, 200);
  assertEquals(r.cache, "no-store");
  assertEquals(r.body.preview, true);
  assertEquals(Object.keys(r.body.messages).sort(), ["email", "inApp", "sms"]);
  assertEquals(r.body.messages.sms.to, "+254712345678");
  assertEquals(r.body.messages.email.to, "wanjiru@example.com");
  assert(r.body.messages.sms.body.includes("KES 500"));
  assert(r.body.messages.sms.body.includes("Till 123456"));
  assertEquals(JSON.stringify(w.tables), before);
  assertEquals(w.sms.length, 0);
  assertEquals(w.mail.length, 0);
  assertEquals(w.tables.messages.length, 0);
  assertEquals(w.tables.application_events.length, 0);
  assertEquals(w.tables.audit_log.length, 0);
});

Deno.test("decide: request_changes needs an open flag or a note", async () => {
  const { w, run } = decide();
  const none = await run({ applicationId: APP_ID, action: "request_changes", channels: allOn });
  assertEquals(none.status, 400);
  assertEquals(none.body.error, "flag_or_note_required");
  const reasonOnly = await run({ applicationId: APP_ID, action: "request_changes", reason: "fix it" });
  assertEquals(reasonOnly.status, 400);
  assertEquals(w.tables.application_events.length, 0);
  assertEquals(w.tables.messages.length, 0);
  assertEquals(w.tables.applications[0].status, "under_review");

  w.tables.application_flags.push({ application_id: APP_ID, status: "fixed" });
  assertEquals((await run({ applicationId: APP_ID, action: "request_changes" })).status, 400);

  w.tables.application_flags.push({ application_id: APP_ID, status: "open" });
  const withFlag = await run({ applicationId: APP_ID, action: "request_changes", channels: { sms: true } });
  assertEquals(withFlag.status, 200);
  assertEquals(w.tables.applications[0].status, "changes_requested");
  assertEquals(w.tables.messages.length, 1);

  const w2 = world();
  const withNote = await decide(w2).run({ applicationId: APP_ID, action: "request_changes", note: "Upload a clearer permit", channels: { email: true } });
  assertEquals(withNote.status, 200);
  assertEquals(w2.tables.applications[0].admin_note, "Upload a clearer permit");
  assertEquals(w2.tables.messages[0].to_address, "wanjiru@example.com");
});

Deno.test("decide: reject needs a reason, approve queues payment instructions, override needs a reason", async () => {
  const { w, run } = decide();
  assertEquals((await run({ applicationId: APP_ID, action: "reject" })).body.error, "reason_required");
  assertEquals((await run({ applicationId: APP_ID, action: "approve", priceOverride: 300 })).body.error, "override_reason_required");
  assertEquals(w.tables.applications[0].status, "under_review");

  const ok = await run({ applicationId: APP_ID, action: "approve", reason: "Launch discount", priceOverride: 300, channels: { sms: true, email: true } });
  assertEquals(ok.status, 200);
  assertEquals(ok.body.status, "approved");
  assertEquals(ok.body.queued, ["sms", "email"]);
  assertEquals(w.tables.applications[0].status, "approved");
  assertEquals(w.tables.applications[0].plan_snapshot.priceOverride.amount, 300);
  assert(w.tables.messages[0].body.includes("KES 300"));
  assertEquals(w.tables.messages.map((m) => m.status), ["queued", "queued"]);
  assertEquals(w.tables.application_events[0].type, "approve");
  assertEquals(w.tables.audit_log[0].action, "application.approve");
  assertEquals(w.tables.audit_log[0].actor_id, "u-reviewer");
  assertEquals(w.tables.audit_log[0].reason, "Launch discount");
  assertEquals(w.sms.length, 0);

  const w2 = world();
  w2.tables.site_settings[0].value = { type: "paybill", number: "400200", account: "" };
  const pb = await decide(w2).run({ applicationId: APP_ID, action: "approve", channels: { sms: true } });
  assert(w2.tables.messages[0].body.includes("Paybill 400200, Account EPM-2026-ABC234"));
  assertEquals(pb.status, 200);

  const w3 = world();
  w3.tables.site_settings[0].value = { type: "till", number: "" };
  assertEquals((await decide(w3).run({ applicationId: APP_ID, action: "approve" })).body.error, "mpesa_not_configured");
});

Deno.test("decide: set_verification, return_to_queue, status guards, validation", async () => {
  const { w, run } = decide();
  assertEquals((await run({ applicationId: APP_ID, action: "set_verification" })).status, 400);
  assertEquals((await run({ applicationId: APP_ID, action: "set_verification", verificationLevel: "verified" })).status, 200);
  assertEquals(w.tables.applications[0].verification_level, "verified");
  assertEquals((await run({ applicationId: APP_ID, action: "return_to_queue" })).body.status, "submitted");
  assertEquals(w.tables.applications[0].reviewer_id, null);
  assertEquals((await run({ applicationId: APP_ID, action: "return_to_queue" })).status, 409);
  assertEquals((await run({ applicationId: APP2_ID, action: "approve" })).status, 409);
  assertEquals((await run({ applicationId: "44444444-4444-4444-8444-444444444444", action: "reject", reason: "x" })).status, 404);
  assertEquals((await run({ applicationId: "nope", action: "approve" })).status, 400);
  assertEquals((await run({ applicationId: APP_ID, action: "explode" })).status, 400);
});

Deno.test("decide: rate limit is 60 per minute per admin", async () => {
  const { run } = decide();
  let last = 0;
  for (let i = 0; i < 61; i++) last = (await run({ applicationId: "bad", action: "approve" })).status;
  assertEquals(last, 429);
});

Deno.test("confirm: duplicate M-Pesa code warns first, and stays a conflict because the database forbids reuse", async () => {
  const { w, run } = confirm();
  w.tables.payments.push({ id: "p0", mpesa_code: "QWE1234567", status: "confirmed" });
  const blocked = await run(pay());
  assertEquals(blocked.status, 409);
  assertEquals(blocked.body.ok, false);
  assertEquals(blocked.body.warnings.map((x: any) => x.code), ["duplicate_mpesa_code"]);
  assertEquals(w.tables.payments.length, 1);
  assertEquals(w.authUsers.length, 1);
  assertEquals(w.tables.businesses.length, 1);
  assertEquals(w.tables.applications[1].status, "payment_confirming");
  assertEquals(w.receiptSeq, 0);
  assertEquals(w.tables.audit_log.length, 0);

  const acknowledged = await run(pay({ acknowledgeWarnings: true }));
  assertEquals(acknowledged.status, 409);
  assertEquals(acknowledged.body.error, "duplicate_mpesa_code");
  assertEquals(w.tables.payments.length, 1);
  assertEquals(w.authUsers.length, 1);
  assertEquals(w.tables.businesses.length, 1);
  assertEquals(w.tables.applications[1].status, "payment_confirming");
  assertEquals(w.sms.length, 0);

  const w2 = world();
  w2.tables.payments.push({ id: "p0", mpesa_code: "QWE1234567", status: "rejected" });
  assertEquals((await confirm(w2).run(pay())).status, 200);

  const w3 = world();
  w3.tables.payments.push({ id: "p0", mpesa_code: "ABC1234567", status: "confirmed" });
  const renewal = await confirm(w3).run({ businessId: BIZ_ID, mpesaCode: "ABC1234567", amount: 500, months: 1, action: "confirm", acknowledgeWarnings: true });
  assertEquals(renewal.status, 409);
  assertEquals(w3.tables.businesses[0].paid_until, eatMidnight("2026-11-20"));
  assertEquals(w3.tables.messages.length, 0);
});

Deno.test("confirm: amount differing from plan price needs acknowledgement", async () => {
  const { w, run } = confirm();
  const blocked = await run(pay({ amount: 450 }));
  assertEquals(blocked.status, 409);
  assertEquals(blocked.body.warnings.map((x: any) => x.code), ["amount_differs"]);
  assertEquals(w.tables.payments.length, 0);
  assertEquals((await run(pay({ amount: 450, acknowledgeWarnings: true }))).status, 200);

  const w2 = world();
  w2.tables.applications[1].plan_snapshot = { priceOverride: { amount: 300 } };
  assertEquals((await confirm(w2).run(pay({ amount: 300 }))).status, 200);
});

Deno.test("confirm: first payment activates the business", async () => {
  const { w, run } = confirm();
  const r = await run(pay());
  assertEquals(r.status, 200);
  assertEquals(r.cache, "no-store");
  const b = r.body;
  assertEquals(b.kind, "activation");
  assertEquals(b.slug, "mama-pima-2");
  nodeAssert.match(b.sellerId, /^SLR-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  assertEquals(b.temporaryPassword.length, 12);
  assertEquals(b.paidUntil, "2026-11-14");
  assertEquals(b.receiptNo, "RCT-000001");

  const biz = w.tables.businesses.find((x) => x.seller_id === b.sellerId);
  assertEquals(biz.slug, "mama-pima-2");
  assertEquals(biz.first_paid_at, "2026-10-14T06:30:00.000Z");
  assertEquals(biz.paid_until, eatMidnight("2026-11-14"));
  assertEquals(biz.must_change_password, true);
  assertEquals(biz.owner_name, "Wanjiru Kamau");
  assertEquals(biz.status, "live");
  assertEquals(biz.application_id, APP2_ID);
  assertEquals(biz.name, "Mama Pima");
  assertEquals(biz.phone, "+254722000111");
  assertEquals(biz.monthly_price, 500);
  assertEquals(Object.keys(biz.profile).sort(), ["businessPhones", "registered", "templateValues", "website", "yearEstablished"]);
  assertEquals(biz.user_id, w.authUsers[1].id);
  const blob = JSON.stringify(biz);
  for (const secret of ["29384756", "A001234567Z", "SBP-77881", "REG-99120", "sbp"]) assert(!blob.includes(secret), `business must not carry ${secret}`);

  const user = w.authUsers[1];
  assertEquals(user.email, `${b.sellerId.toLowerCase()}@sellers.epicmkt.app`);
  assertEquals(user.user_metadata.must_change_password, true);
  assertEquals(user.password, b.temporaryPassword);

  assertEquals(w.tables.applications[1].status, "activated");
  assertEquals(w.tables.applications[1].seller_id, b.sellerId);
  const p = w.tables.payments[0];
  assertEquals([p.status, p.kind, p.receipt_no, p.amount_kes, p.months, p.business_id, p.application_id], ["confirmed", "first", "RCT-000001", 500, 1, biz.id, APP2_ID]);
  assertEquals([p.period_start, p.period_end, p.confirmed_by, p.confirmed_via, p.source], ["2026-10-14", "2026-11-14", "u-finance", "admin", "admin"]);

  assertEquals(w.sms.length, 1);
  assertEquals(w.sms[0].to, "+254712345678");
  assert(w.sms[0].message.includes(b.sellerId) && w.sms[0].message.includes(b.temporaryPassword));
  assertEquals(w.mail.length, 1);
  assertEquals(w.mail[0].to, "wanjiru@example.com");
  assert(w.mail[0].html.includes(b.temporaryPassword));

  const stored = JSON.stringify(w.tables);
  assert(!stored.includes(b.temporaryPassword), "password must not be stored in any table");
  assertEquals(w.tables.messages.map((m) => [m.channel, m.template_key, m.status]), [["sms", "welcome", "queued"], ["email", "welcome", "queued"]]);
  assertEquals(w.tables.application_events.at(-1).type, "activated");
  assertEquals(w.tables.audit_log.map((a) => a.action), ["payment.confirm", "business.activate"]);
  assertEquals(w.tables.audit_log[0].actor_email, "finance@epicmkt.test");
  assertEquals([w.tables.audit_log[0].actor_role, w.tables.audit_log[0].business_id, w.tables.audit_log[1].business_id], ["admin", biz.id, biz.id]);
  assertEquals(b.smsSent, true);
  assertEquals(b.warnings, []);

  const again = await run(pay({ mpesaCode: "ZXC9876543" }));
  assertEquals(again.status, 409);
  assertEquals(again.body.error, "invalid_status");
  assertEquals(JSON.stringify(again.body).includes(b.temporaryPassword), false);
});

Deno.test("confirm: activation with months and no clash keeps the plain slug", async () => {
  const w = world();
  w.tables.businesses.length = 0;
  const r = await confirm(w).run(pay({ months: 2, amount: 1000 }));
  assertEquals(r.body.slug, "mama-pima");
  assertEquals(r.body.paidUntil, "2026-12-14");
});

Deno.test("confirm: activation rolls back everything when a later step fails", async () => {
  for (const failing of [{ table: "applications", mode: "update" }, { table: "payments", mode: "insert" }] as const) {
    const w = world();
    w.failOn.push({ ...failing });
    const r = await confirm(w).run(pay());
    assertEquals(r.status, 500);
    assertEquals(w.tables.businesses.length, 1);
    assertEquals(w.tables.payments.length, 0);
    assertEquals(w.authUsers.length, 1);
    assertEquals(w.tables.applications[1].status, "payment_confirming");
    assertEquals(w.sms.length, 0);
  }
});

Deno.test("confirm: renewal before expiry adds a month to the OLD paid_until", async () => {
  const { w, run } = confirm();
  const r = await run({ businessId: BIZ_ID, mpesaCode: "ABC1234567", amount: 500, months: 1, action: "confirm" });
  assertEquals(r.status, 200);
  assertEquals(r.body.kind, "renewal");
  assertEquals(r.body.paidUntil, "2026-12-20");
  assertEquals(w.tables.businesses[0].paid_until, eatMidnight("2026-12-20"));
  assertEquals(w.tables.payments[0].period_start, "2026-11-20");
  assertEquals(w.tables.payments[0].kind, "renewal");
  assertEquals(w.tables.payments[0].receipt_no, "RCT-000001");
  assertEquals(r.body.temporaryPassword, undefined);
  assertEquals(w.sms.length, 0);
  assertEquals(w.authUsers.length, 1);
  assertEquals(w.tables.audit_log[0].before.paid_until, "2026-11-20");
  assertEquals(w.tables.audit_log[0].business_id, BIZ_ID);
});

Deno.test("confirm: renewal queues payment-received by SMS, email and in-app, idempotent by dedupe_key", async () => {
  const { w, run } = confirm();
  const r = await run({ businessId: BIZ_ID, mpesaCode: "ABC1234567", amount: 500, months: 1, action: "confirm" });
  assertEquals(r.status, 200);
  const rows = w.tables.messages;
  assertEquals(rows.map((m) => m.channel), ["sms", "email", "in_app"]);
  assertEquals(rows.map((m) => m.dedupe_key), ["payment:payments-1:sms", "payment:payments-1:email", "payment:payments-1:in_app"]);
  assertEquals(rows.map((m) => m.status), ["queued", "queued", "delivered"]);
  assertEquals(rows.map((m) => m.to_address), ["+254700000001", "old@example.com", null]);
  assertEquals(new Set(rows.map((m) => m.business_id)), new Set([BIZ_ID]));
  assertEquals(new Set(rows.map((m) => m.kind)), new Set(["payment"]));
  for (const m of rows) {
    assert(m.body.includes("payment received") && m.body.includes("20 Dec 2026") && m.body.includes("RCT-000001"));
    assertEquals(m.data.paid_until, "2026-12-20");
  }
  assertEquals(w.sms.length, 0);

  const again = rows.map((m) => ({ ...m, id: undefined }));
  await queueMessages(deps(w), again);
  await queueMessages(deps(w), again);
  assertEquals(w.tables.messages.length, 3);

  const w2 = world();
  w2.tables.messages.push({ id: "m0", business_id: BIZ_ID, channel: "sms", dedupe_key: "payment:payments-1:sms", body: "earlier attempt" });
  assertEquals((await confirm(w2).run({ businessId: BIZ_ID, mpesaCode: "ABC1234567", amount: 500, months: 1, action: "confirm" })).status, 200);
  assertEquals(w2.tables.messages.map((m) => m.channel).sort(), ["email", "in_app", "sms"]);
  assertEquals(w2.tables.messages.filter((m) => m.dedupe_key === "payment:payments-1:sms").length, 1);
});

Deno.test("confirm: renewal after lapse counts from today, month-end clamps", async () => {
  const w = world();
  w.tables.businesses[0].paid_until = eatMidnight("2026-09-01");
  const lapsed = await confirm(w).run({ businessId: BIZ_ID, mpesaCode: "ABC1234567", amount: 500, months: 1, action: "confirm" });
  assertEquals(lapsed.body.paidUntil, "2026-11-14");

  const w2 = world();
  w2.tables.businesses[0].paid_until = eatMidnight("2027-01-31");
  const clamp = await confirm(w2).run({ businessId: BIZ_ID, mpesaCode: "ABC1234567", amount: 500, months: 1, action: "confirm" });
  assertEquals(clamp.body.paidUntil, "2027-02-28");
});

Deno.test("confirm: reject records the payment and sends the application back to approved", async () => {
  const { w, run } = confirm();
  assertEquals((await run(pay({ action: "reject" }))).body.error, "reason_required");
  const r = await run(pay({ action: "reject", reason: "Code not found in statement" }));
  assertEquals(r.status, 200);
  assertEquals(w.tables.payments[0].status, "rejected");
  assertEquals(w.tables.payments[0].decline_reason, "Code not found in statement");
  assertEquals([w.tables.payments[0].kind, w.tables.payments[0].amount_kes, w.tables.payments[0].business_id, w.tables.payments[0].application_id], ["first", 500, null, APP2_ID]);
  assertEquals(w.tables.applications[1].status, "approved");
  assertEquals(w.tables.applications[1].payment_code, null);
  assertEquals(w.tables.audit_log[0].action, "payment.reject");
  assertEquals(w.authUsers.length, 1);
});

Deno.test("confirm: input validation", async () => {
  const { run } = confirm();
  assertEquals((await run({ mpesaCode: "QWE1234567", amount: 500, action: "confirm" })).status, 400);
  assertEquals((await run(pay({ businessId: BIZ_ID }))).status, 400);
  assertEquals((await run(pay({ mpesaCode: "short" }))).status, 400);
  assertEquals((await run(pay({ amount: -5 }))).status, 400);
  assertEquals((await run(pay({ months: 25 }))).status, 400);
  assertEquals((await run(pay({ applicationId: "44444444-4444-4444-8444-444444444444" }))).status, 404);
  assertEquals((await run(pay({ mpesaCode: " qwe1234567 " }))).status, 200);
});

Deno.test("reset: owner only, reason required, password sent and never returned or stored", async () => {
  const { w, run } = reset();
  assertEquals((await run({ businessId: BIZ_ID })).status, 400);
  assertEquals((await run({ businessId: BIZ_ID, reason: "ok" })).status, 400);
  const r = await run({ businessId: BIZ_ID, reason: "Seller lost phone" });
  assertEquals(r.status, 200);
  assertEquals(r.cache, "no-store");
  assertEquals(r.body, { ok: true, businessId: BIZ_ID, sellerId: "SLR-AAAAAA", smsSent: true });
  const user = w.authUsers[0];
  assertEquals(user.password.length, 12);
  assertEquals(user.user_metadata.must_change_password, true);
  assertEquals(w.tables.businesses[0].must_change_password, true);
  assertEquals(w.sms.length, 1);
  assertEquals(w.sms[0].to, "+254700000001");
  assert(w.sms[0].message.includes(user.password) && w.sms[0].message.includes("SLR-AAAAAA"));
  assertEquals(w.mail[0].to, "old@example.com");
  assertEquals(w.tables.audit_log[0].action, "business.password_reset");
  assertEquals(w.tables.audit_log[0].reason, "Seller lost phone");
  assertEquals([w.tables.audit_log[0].business_id, w.tables.audit_log[0].actor_role], [BIZ_ID, "admin"]);
  assert(!JSON.stringify(w.tables).includes(user.password));
  assert(!JSON.stringify(r.body).includes(user.password));
  assertEquals((await run({ businessId: "44444444-4444-4444-8444-444444444444", reason: "none here" })).status, 404);
});

Deno.test("reset: 5 per hour per admin", async () => {
  const { run } = reset();
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) statuses.push((await run({ businessId: BIZ_ID, reason: "again please" })).status);
  assertEquals(statuses, [200, 200, 200, 200, 200, 429]);
});

Deno.test("support gets 403 on all three functions, reviewer/finance only where allowed", async () => {
  const w = world();
  const before = JSON.stringify(w.tables);
  const d = deps(w);
  const bodies = {
    decide: { applicationId: APP_ID, action: "approve" },
    confirm: pay(),
    reset: { businessId: BIZ_ID, reason: "support request" },
  };
  const fns = { decide: adminDecideApplication(d), confirm: adminConfirmPayment(d), reset: adminResetSellerPassword(d) };
  for (const k of Object.keys(fns) as (keyof typeof fns)[]) {
    const r = await read(await fns[k](post(bodies[k], TOKENS.support)));
    assertEquals([k, r.status, r.body.error], [k, 403, "forbidden"]);
  }
  assertEquals((await read(await fns.decide(post(bodies.decide, TOKENS.finance)))).status, 403);
  assertEquals((await read(await fns.confirm(post(bodies.confirm, TOKENS.reviewer)))).status, 403);
  assertEquals((await read(await fns.reset(post(bodies.reset, TOKENS.reviewer)))).status, 403);
  assertEquals((await read(await fns.reset(post(bodies.reset, TOKENS.finance)))).status, 403);
  assertEquals(JSON.stringify(w.tables), before);
  assertEquals(w.authUsers.length, 1);
});

Deno.test("all three: no token 401, bad token 401, GET 405, OPTIONS 200", async () => {
  const d = deps(world());
  for (const h of [adminDecideApplication(d), adminConfirmPayment(d), adminResetSellerPassword(d)]) {
    assertEquals((await h(post({}))).status, 401);
    assertEquals((await h(post({}, "bogus"))).status, 401);
    assertEquals((await h(new Request("http://x/", { method: "GET" }))).status, 405);
    assertEquals((await h(new Request("http://x/", { method: "OPTIONS" }))).status, 200);
  }
});
