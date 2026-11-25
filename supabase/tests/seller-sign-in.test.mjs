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
  assert.deepEqual(first, { ok: true, phone: "+254722000111", previous: before, cancelledRequests: 0 });
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
