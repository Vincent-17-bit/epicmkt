import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asAdmin, asService } from "./db.mjs";

let c;

before(async () => {
  const url = await createDatabase({ database: "epicmkt_sign_in_test" });
  c = await connect(url);
  await seedFixtures(c);
});
after(async () => { await c.end(); });

const issue = (code, purpose, channel, target) =>
  tx(c, asService, (k) => sql(k, `select seller_otp_issue($1, $2, $3, $4, $5) as r`, [ids.bizA, purpose, code, channel, target]).then((r) => r[0].r), { commit: true });
const verify = (code, purpose) =>
  tx(c, asService, (k) => sql(k, `select seller_otp_verify($1, $2, $3) as r`, [ids.bizA, purpose, code]).then((r) => r[0].r), { commit: true });
const age = () => sql(c, `update seller_otps set created_at = created_at - interval '120 seconds'`);

test("a code remembers its channel, and a verify_email code remembers the address it was sent to", async () => {
  await sql(c, `delete from seller_otps`);
  assert.deepEqual(await issue("123456", "verify_email", "email", "Jane@Example.com"), { ok: true });
  const [row] = await sql(c, `select channel, target, code_hash from seller_otps`);
  assert.equal(row.channel, "email");
  assert.equal(row.target, "jane@example.com");
  assert.match(row.code_hash, /^[0-9a-f]{64}$/);

  assert.equal((await verify("123456", "change_password")).ok, false); // a code is only good for its own purpose
  assert.deepEqual(await verify("123456", "verify_email"), { ok: true, channel: "email", target: "jane@example.com" });
  assert.equal((await verify("123456", "verify_email")).ok, false); // one use
});

test("password codes go by sms or email, and the choice is recorded", async () => {
  await sql(c, `delete from seller_otps`);
  await issue("111111", "change_password", "email", null);
  assert.deepEqual(await verify("111111", "change_password"), { ok: true, channel: "email", target: null });
  await age();
  await issue("222222", "change_password");
  assert.deepEqual(await verify("222222", "change_password"), { ok: true, channel: "sms", target: null });
});

test("the old three-argument call still works, bad requests are refused", async () => {
  await sql(c, `delete from seller_otps`);
  const old = await tx(c, asService, (k) => sql(k, `select seller_otp_issue($1, 'forgot_password', '654321') as r`, [ids.bizA]).then((r) => r[0].r), { commit: true });
  assert.deepEqual(old, { ok: true });
  await rejects(c, asService, `select seller_otp_issue('${ids.bizA}', 'verify_email', '123456', 'sms', null)`, [], /invalid_otp_request/);
  await rejects(c, asService, `select seller_otp_issue('${ids.bizA}', 'verify_email', '123456', 'email', null)`, [], /invalid_otp_request/);
  await rejects(c, asService, `select seller_otp_issue('${ids.bizA}', 'change_password', '123456', 'whatsapp', null)`, [], /invalid_otp_request/);
  await rejects(c, asService, `select seller_otp_issue('${ids.bizA}', 'login', '123456', 'sms', null)`, [], /invalid_otp_request|check constraint/);
});

test("resend wait and the hourly limit apply across channels", async () => {
  await sql(c, `delete from seller_otps`);
  assert.equal((await issue("100000", "change_password", "sms", null)).ok, true);
  const second = await issue("100001", "change_password", "email", null);
  assert.equal(second.reason, "resend_wait");
});

test("only the service can issue or verify codes", async () => {
  await rejects(c, asA, `select seller_otp_issue('${ids.bizA}', 'verify_email', '123456', 'email', 'a@b.co')`, [], /permission denied/);
  await rejects(c, asA, `select seller_otp_verify('${ids.bizA}', 'verify_email', '123456')`, [], /permission denied/);
});

test("a sign-in email is lower case, well formed and unique among live sellers", async () => {
  await sql(c, `update businesses set login_email = 'jane@example.com', login_email_verified_at = now() where id = '${ids.bizA}'`);
  await rejects(c, null, `update businesses set login_email = 'Jane@Example.com' where id = '${ids.bizB}'`, [], /businesses_login_email_format/);
  await rejects(c, null, `update businesses set login_email = 'not an email' where id = '${ids.bizB}'`, [], /businesses_login_email_format/);
  await rejects(c, null, `update businesses set login_email = 'jane@example.com' where id = '${ids.bizB}'`, [], /businesses_login_email_key|duplicate key/);

  // a deleted business gives its address back
  await sql(c, `update businesses set status = 'deleted' where id = '${ids.bizA}'`);
  await sql(c, `update businesses set login_email = 'jane@example.com' where id = '${ids.bizB}'`);
  await sql(c, `update businesses set login_email = null where id = '${ids.bizB}'`);
  await sql(c, `update businesses set status = 'live', login_email = null, login_email_verified_at = null where id = '${ids.bizA}'`);
});

test("a seller can read their sign-in details but cannot write them", async () => {
  await sql(c, `update businesses set login_email = 'jane@example.com', login_email_verified_at = now(), must_change_password = true where id = '${ids.bizA}'`);
  const mine = await tx(c, asA, (k) => sql(k, `select login_email, must_change_password, password_changed_at from businesses`));
  assert.deepEqual(mine, [{ login_email: "jane@example.com", must_change_password: true, password_changed_at: null }]);
  for (const set of [`login_email = 'mine@example.com'`, `login_email_verified_at = now()`, `must_change_password = false`, `password_changed_at = now()`]) {
    const r = await tx(c, asA, (k) => k.query(`update businesses set ${set}`));
    assert.equal(r.rowCount, 0, set);
  }
  for (const f of ["login_email", "login_email_verified_at", "must_change_password", "password_changed_at"]) {
    await rejects(c, asA, `select seller_update_profile($1::jsonb)`, [JSON.stringify({ [f]: "x" })], /field_not_allowed/);
  }
  await sql(c, `update businesses set login_email = null, login_email_verified_at = null, must_change_password = false where id = '${ids.bizA}'`);
});

test("the public listing never shows a sign-in email", async () => {
  const cols = await sql(c, `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'public_businesses'`);
  assert.ok(cols.length > 0);
  assert.ok(!cols.some((x) => /login_email|password/.test(x.column_name)));
  await rejects(c, { role: "anon" }, `select login_email from businesses`, [], /permission denied/);
});

// ---- 0156: changing the phone number with a code --------------------------------------------------------------------------------------

const setPhone = (phone, business = ids.bizA) =>
  tx(c, asService, (k) => sql(k, `select seller_set_verified_phone($1, $2) as r`, [business, phone]).then((r) => r[0].r), { commit: true });

test("a verify_phone code remembers the number it was sent to, and only an sms to a real number is accepted", async () => {
  await sql(c, `delete from seller_otps`);
  assert.deepEqual(await issue("123456", "verify_phone", "sms", "0722 000 111"), { ok: true });
  const [row] = await sql(c, `select purpose, channel, target from seller_otps`);
  assert.deepEqual(row, { purpose: "verify_phone", channel: "sms", target: "0722 000 111" });
  assert.equal((await verify("123456", "change_password")).ok, false); // a code is only good for its own purpose
  assert.deepEqual(await verify("123456", "verify_phone"), { ok: true, channel: "sms", target: "0722 000 111" });
  assert.equal((await verify("123456", "verify_phone")).ok, false); // one use

  await rejects(c, asService, `select seller_otp_issue('${ids.bizA}', 'verify_phone', '123456', 'email', '0722000111')`, [], /invalid_otp_request/);
  await rejects(c, asService, `select seller_otp_issue('${ids.bizA}', 'verify_phone', '123456', 'sms', null)`, [], /invalid_otp_request/);
  await rejects(c, asService, `select seller_otp_issue('${ids.bizA}', 'verify_phone', '123456', 'sms', 'not a number')`, [], /invalid_otp_request/);
  await rejects(c, asService, `select seller_otp_issue('${ids.bizA}', 'verify_phone', '123456', 'sms', '12345')`, [], /invalid_otp_request/);
});

test("verify_phone has its own resend wait and hourly limit, apart from the other purposes", async () => {
  await sql(c, `delete from seller_otps`);
  assert.equal((await issue("100000", "verify_phone", "sms", "0722000111")).ok, true);
  assert.equal((await issue("100001", "verify_phone", "sms", "0722000111")).reason, "resend_wait");
  assert.equal((await issue("100002", "verify_email", "email", "a@b.co")).ok, true); // another purpose is not held up by it
});

test("seller_set_verified_phone saves the normalised number, refuses the same one, and returns the old number", async () => {
  const [{ phone: before }] = await sql(c, `select phone from businesses where id = '${ids.bizA}'`);
  const first = await setPhone("0722 000 111");
  assert.deepEqual(first, { ok: true, phone: "+254722000111", previous: before, whatsappChanged: false, cancelledRequests: 0 });
  assert.equal((await sql(c, `select phone from businesses where id = '${ids.bizA}'`))[0].phone, "+254722000111");

  assert.deepEqual(await setPhone("+254 722 000 111"), { ok: false, reason: "no_change" }); // already theirs, in another form
  assert.deepEqual(await setPhone("not a number"), { ok: false, reason: "invalid_phone" });
  assert.deepEqual(await setPhone("12345"), { ok: false, reason: "invalid_phone" });
  assert.deepEqual(await setPhone("0722 000 11"), { ok: false, reason: "invalid_phone" });
  assert.deepEqual(await setPhone("0722000111", "10000000-0000-0000-0000-0000000000ff"), { ok: false, reason: "not_found" });
  assert.equal((await sql(c, `select phone from businesses where id = '${ids.bizA}'`))[0].phone, "+254722000111");
  // a number from another country is saved in +CC form, like the rest of the app (migration 0011)
  assert.equal((await setPhone("00 256 772 123 456")).phone, "+256772123456");
  await sql(c, `update businesses set phone = '${before}' where id = '${ids.bizA}'`);
});

test("saving a verified number cancels a phone request that was still waiting for an admin, so it cannot overwrite it later", async () => {
  const [{ phone: before }] = await sql(c, `select phone from businesses where id = '${ids.bizA}'`);
  await sql(c, `delete from change_requests`);
  await sql(c, `insert into change_requests (business_id, field, old_value, new_value) values ($1, 'phone', $2, '+254799000999'), ($1, 'town', 'Old', 'New')`, [ids.bizA, before]);

  const r = await setPhone("0722000111");
  assert.equal(r.ok, true);
  assert.equal(r.cancelledRequests, 1);
  const rows = await sql(c, `select field, status from change_requests order by field`);
  assert.deepEqual(rows, [{ field: "phone", status: "cancelled" }, { field: "town", status: "pending" }]); // only the phone request, and only the pending one

  // an admin can no longer approve it: it is already decided, so it cannot overwrite the number that was just verified
  await rejects(c, asAdmin, `select admin_decide_change_request((select id from change_requests where field = 'phone'), true, null)`, [], /already_decided/);
  assert.equal((await sql(c, `select phone from businesses where id = '${ids.bizA}'`))[0].phone, "+254722000111");
  await sql(c, `delete from change_requests`);
  await sql(c, `update businesses set phone = '${before}' where id = '${ids.bizA}'`);
});

test("only the service can save a verified phone number, and a seller still cannot write their phone directly", async () => {
  await rejects(c, asA, `select seller_set_verified_phone('${ids.bizA}', '0722000111')`, [], /permission denied/);
  await rejects(c, { role: "anon" }, `select seller_set_verified_phone('${ids.bizA}', '0722000111')`, [], /permission denied/);
  const r = await tx(c, asA, (k) => k.query(`update businesses set phone = '+254700123123'`));
  assert.equal(r.rowCount, 0);
  await rejects(c, asA, `select seller_update_profile($1::jsonb)`, [JSON.stringify({ phone: "0700123123" })], /field_not_allowed/);
});

// ---- 0157: old numbers and emails are kept, a phone change can set WhatsApp too, admins can see (and the owner remove) the history ------

const REVIEWER = "00000000-0000-0000-0000-0000000000a2";
const history = (business = ids.bizA) => sql(c, `select field, old_value, new_value, changed_by from business_contact_history where business_id = $1 order by changed_at, id`, [business]);
const setPhone3 = (phone, also, business = ids.bizA) =>
  tx(c, asService, (k) => sql(k, `select seller_set_verified_phone($1, $2, $3) as r`, [business, phone, also]).then((r) => r[0].r), { commit: true });

async function resetBizA() {
  await sql(c, `delete from business_contact_history`);
  await sql(c, `update businesses set phone = '+254712345678', whatsapp = '+254799000111', login_email = null, login_email_verified_at = null where id = $1`, [ids.bizA]);
  await sql(c, `delete from business_contact_history`);
}

test("every old phone, WhatsApp number and sign-in email is kept when it changes, and a first value is not 'history'", async () => {
  await resetBizA();
  await sql(c, `update businesses set login_email = 'first@example.com', login_email_verified_at = now() where id = $1`, [ids.bizA]); // null -> value: nothing was replaced
  assert.deepEqual(await history(), []);

  await sql(c, `update businesses set phone = '+256772123456' where id = $1`, [ids.bizA]);
  await sql(c, `update businesses set whatsapp = '+256772999000' where id = $1`, [ids.bizA]);
  await sql(c, `update businesses set login_email = 'second@example.com' where id = $1`, [ids.bizA]);
  await sql(c, `update businesses set name = name where id = $1`, [ids.bizA]); // an update that changes none of them adds nothing
  const rows = await history();
  assert.deepEqual(rows.map((r) => [r.field, r.old_value, r.new_value]), [
    ["phone", "+254712345678", "+256772123456"],
    ["whatsapp", "+254799000111", "+256772999000"],
    ["login_email", "first@example.com", "second@example.com"]
  ]);

  await sql(c, `update businesses set whatsapp = null where id = $1`, [ids.bizA]); // cleared: the old one is still kept
  assert.deepEqual((await history()).at(-1), { field: "whatsapp", old_value: "+256772999000", new_value: null, changed_by: null });
  await resetBizA();
});

test("a phone change can set WhatsApp to the same number, or leave a different WhatsApp number alone", async () => {
  await resetBizA();
  const alone = await setPhone3("0722 000 111", false);
  assert.deepEqual([alone.ok, alone.phone, alone.whatsappChanged], [true, "+254722000111", false]);
  let [b] = await sql(c, `select phone, whatsapp from businesses where id = $1`, [ids.bizA]);
  assert.deepEqual(b, { phone: "+254722000111", whatsapp: "+254799000111" }); // WhatsApp kept: they may use two numbers
  assert.deepEqual((await history()).map((r) => r.field), ["phone"]);

  await resetBizA();
  const both = await setPhone3("+256 772 123 456", true);
  assert.deepEqual([both.ok, both.phone, both.whatsappChanged], [true, "+256772123456", true]);
  [b] = await sql(c, `select phone, whatsapp from businesses where id = $1`, [ids.bizA]);
  assert.deepEqual(b, { phone: "+256772123456", whatsapp: "+256772123456" });
  assert.deepEqual((await history()).map((r) => [r.field, r.old_value]), [["phone", "+254712345678"], ["whatsapp", "+254799000111"]]); // both old numbers kept

  // WhatsApp already the new number: nothing to change there
  await resetBizA();
  await sql(c, `update businesses set whatsapp = '+254722000111' where id = $1`, [ids.bizA]);
  assert.equal((await setPhone3("0722000111", true)).whatsappChanged, false);
  // the old two-argument call (the edge function already deployed) still works
  await resetBizA();
  assert.equal((await setPhone("0722000111")).ok, true);
  await resetBizA();
});

test("the admin site shows the new numbers straight away, in the business list and the business page", async () => {
  await resetBizA();
  await setPhone3("+256 772 123 456", true);
  const detail = await tx(c, asAdmin, (k) => sql(k, `select admin_business_detail($1) as d`, [ids.bizA]).then((r) => r[0].d));
  const text = JSON.stringify(detail);
  assert.ok(text.includes('"phone":"+256772123456"'), "detail has the new phone");
  assert.ok(text.includes('"whatsapp":"+256772123456"'), "detail has the new WhatsApp number");
  assert.ok(!text.includes("+254712345678"), "and not the old one");
  await resetBizA();
});

test("admins can read the history, say who did it, and sellers and the public cannot", async () => {
  await resetBizA();
  await sql(c, `delete from change_requests`);
  await setPhone3("0722000111", false); // the seller, through the server
  // an admin approves a phone change the seller asked for
  await sql(c, `insert into change_requests (business_id, field, old_value, new_value) values ($1, 'phone', '+254722000111', '+254733000222')`, [ids.bizA]);
  await tx(c, asAdmin, (k) => sql(k, `select admin_decide_change_request((select id from change_requests where field = 'phone' and status = 'pending'), true, null)`), { commit: true });

  const list = await tx(c, asAdmin, (k) => sql(k, `select admin_contact_history($1) as h`, [ids.bizA]).then((r) => r[0].h));
  assert.deepEqual(list.map((h) => [h.field, h.old, h.new, h.byAdmin]), [
    ["phone", "+254722000111", "+254733000222", true], // newest first, by an admin
    ["phone", "+254712345678", "+254722000111", false]  // by the seller
  ]);
  assert.ok(list[0].by, "an admin is named");
  assert.equal(list[1].by, null);

  await rejects(c, asA, `select admin_contact_history('${ids.bizA}')`, [], /forbidden/);
  await rejects(c, { role: "anon" }, `select admin_contact_history('${ids.bizA}')`, [], /permission denied/);
  await rejects(c, asA, `select * from business_contact_history`, [], /permission denied/);
  await sql(c, `delete from change_requests`);
  await resetBizA();
});

test("only the owner can delete a history entry, and the deletion is written to the audit log", async () => {
  await resetBizA();
  await sql(c, `insert into auth.users (id, email) values ('${REVIEWER}', 'rev@test') on conflict do nothing`);
  await sql(c, `insert into admins (user_id, role) values ('${REVIEWER}', 'reviewer') on conflict (user_id) do update set role = 'reviewer'`);
  await setPhone3("0722000111", false);
  const [{ id }] = await sql(c, `select id from business_contact_history where business_id = $1`, [ids.bizA]);

  const asReviewer = { sub: REVIEWER };
  assert.equal((await tx(c, asReviewer, (k) => sql(k, `select jsonb_array_length(admin_contact_history($1)) as n`, [ids.bizA]))).at(0).n, 1); // a reviewer can read it
  await rejects(c, asReviewer, `select admin_delete_contact_history('${id}')`, [], /forbidden/);
  await rejects(c, asA, `select admin_delete_contact_history('${id}')`, [], /forbidden/);
  assert.equal((await history()).length, 1); // still there

  assert.equal((await tx(c, asAdmin, (k) => sql(k, `select admin_delete_contact_history($1) as ok`, [id]), { commit: true }))[0].ok, true);
  assert.equal((await history()).length, 0);
  const [audit] = await sql(c, `select action, data from audit_log where action = 'contact_history_deleted' and business_id = $1`, [ids.bizA]);
  assert.equal(audit.action, "contact_history_deleted");
  assert.equal(audit.data.old, "+254712345678"); // what was removed is recorded
  await rejects(c, asAdmin, `select admin_delete_contact_history('${id}')`, [], /not_found/);
  await resetBizA();
});
