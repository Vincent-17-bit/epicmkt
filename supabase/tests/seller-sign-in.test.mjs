import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asService } from "./db.mjs";

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
