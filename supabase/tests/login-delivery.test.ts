import nodeAssert from "node:assert/strict";
import { adminConfirmPayment } from "../functions/admin-confirm-payment/handler.ts";
import { adminResetSellerPassword } from "../functions/admin-reset-seller-password/handler.ts";
import type { AdminDeps } from "../functions/_shared/adminKit.ts";
import { APP2_ID, BIZ_ID, TOKENS, deps, post, read, world, type World } from "./admin-world.ts";

const assertEquals = (a: unknown, b: unknown) => nodeAssert.deepStrictEqual(a, b);
const assert = (v: unknown, m?: string) => nodeAssert.ok(v, m);

const down = (message: string) => () => Promise.reject(new Error(message));
const pay = { applicationId: APP2_ID, mpesaCode: "QWE1234567", amount: 500, months: 1, action: "confirm" };

const activate = (w: World, over: Partial<AdminDeps> = {}) =>
  adminConfirmPayment({ ...deps(w), ...over })(post(pay, TOKENS.finance)).then(read);
const resend = (w: World, over: Partial<AdminDeps> = {}) =>
  adminResetSellerPassword({ ...deps(w), ...over })(post({ businessId: BIZ_ID, reason: "Seller lost the SMS" }, TOKENS.owner)).then(read);

const loginRows = (w: World) => w.tables.messages.filter((m) => m.template_key === "login_details");
const byChannel = (w: World) => Object.fromEntries(loginRows(w).map((m) => [m.channel, m]));

Deno.test("activation: a failing SMS does not stop the email, and both results are recorded", async () => {
  const w = world();
  const r = await activate(w, { sms: down("sms gateway down") });
  assertEquals(r.status, 200);
  assertEquals(r.body.smsSent, false);
  assertEquals(w.mail.length, 1);
  const rows = byChannel(w);
  assertEquals([rows.sms.status, rows.sms.error, rows.sms.to_address], ["failed", "sms gateway down", "+254712345678"]);
  assertEquals([rows.email.status, rows.email.error, rows.email.to_address], ["sent", null, "wanjiru@example.com"]);
  assertEquals(w.tables.admin_notifications.map((n) => [n.kind, n.data.channel, n.data.message_id]), [["message_failed", "sms", rows.sms.id]]);
  assert(!JSON.stringify(w.tables).includes(r.body.temporaryPassword), "password must not be stored");
});

Deno.test("activation: a failing email does not stop the SMS, and both results are recorded", async () => {
  const w = world();
  const r = await activate(w, { mail: down("smtp refused") });
  assertEquals(r.status, 200);
  assertEquals(r.body.smsSent, true);
  assertEquals(w.sms.length, 1);
  const rows = byChannel(w);
  assertEquals([rows.sms.status, rows.email.status, rows.email.error], ["sent", "failed", "smtp refused"]);
  assertEquals(w.tables.admin_notifications.map((n) => n.data.channel), ["email"]);
  assert(!JSON.stringify(w.tables).includes(r.body.temporaryPassword));
});

Deno.test("activation: both failing, including an SMS provider that answers false", async () => {
  const w = world();
  const r = await activate(w, { sms: () => Promise.resolve(false), mail: down("smtp refused") });
  assertEquals(r.status, 200);
  assertEquals(r.body.smsSent, false);
  assertEquals(r.body.kind, "activation");
  assertEquals(loginRows(w).map((m) => [m.channel, m.status, m.error]), [["sms", "failed", "not_sent"], ["email", "failed", "smtp refused"]]);
  assertEquals(w.tables.admin_notifications.length, 2);
  assertEquals(w.tables.applications[1].status, "activated");
});

Deno.test("activation: all good records two sent rows and raises no flag", async () => {
  const w = world();
  assertEquals((await activate(w)).status, 200);
  assertEquals(loginRows(w).map((m) => [m.channel, m.status, m.attempts]), [["sms", "sent", 1], ["email", "sent", 1]]);
  assertEquals(w.tables.admin_notifications ?? [], []);
});

Deno.test("a provider error that echoes the password is redacted before it is stored", async () => {
  const w = world();
  const d = deps(w);
  const password = "Echo-Pass-123";
  const out = await adminConfirmPayment({ ...d, password: () => password, sms: (_to, message) => Promise.reject(new Error(`rejected: ${message}`)) })(post(pay, TOKENS.finance)).then(read);
  assertEquals(out.status, 200);
  assert(byChannel(w).sms.error.includes("***"));
  assert(!JSON.stringify(w.tables).includes(password), "password must not appear in any table");
});

Deno.test("a failure to record the flag never undoes the activation", async () => {
  const w = world();
  w.failOn.push({ table: "admin_notifications", mode: "insert" });
  const r = await activate(w, { sms: down("sms gateway down") });
  assertEquals(r.status, 200);
  assertEquals(r.body.kind, "activation");
  assertEquals(byChannel(w).sms.status, "failed");
  assertEquals(w.tables.applications[1].status, "activated");
});

Deno.test("resend: a new temporary password is issued and its result replaces the failure", async () => {
  const w = world();
  const first = await resend(w, { sms: down("sms gateway down"), mail: down("smtp refused") });
  assertEquals(first.status, 200);
  assertEquals(loginRows(w).map((m) => m.status), ["failed", "failed"]);
  const oldPassword = w.authUsers[0].password;

  const second = await resend(w);
  assertEquals(second.status, 200);
  assertEquals(second.body.smsSent, true);
  assert(w.authUsers[0].password !== oldPassword, "a new password is issued, the old one is not reused");
  const rows = loginRows(w);
  assertEquals(rows.slice(-2).map((m) => [m.channel, m.status, m.created_by]), [["sms", "sent", "u-owner"], ["email", "sent", "u-owner"]]);
  const stored = JSON.stringify(w.tables);
  assert(!stored.includes(oldPassword) && !stored.includes(w.authUsers[0].password), "no password is stored");
});

Deno.test("reset: failing stubs are recorded per channel and the response still has no password", async () => {
  const w = world();
  const r = await resend(w, { sms: down("sms gateway down") });
  assertEquals(r.status, 200);
  assertEquals(r.body, { ok: true, businessId: BIZ_ID, sellerId: "SLR-AAAAAA", smsSent: false });
  assertEquals(w.mail.length, 1);
  assertEquals(loginRows(w).map((m) => [m.channel, m.status, m.business_id, m.application_id]), [["sms", "failed", BIZ_ID, null], ["email", "sent", BIZ_ID, null]]);
  assertEquals(w.tables.admin_notifications.map((n) => n.business_id), [BIZ_ID]);
  assert(!JSON.stringify(w.tables).includes(w.authUsers[0].password));
});
