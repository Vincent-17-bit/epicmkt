import nodeAssert from "node:assert/strict";
import { sellerLogin } from "../functions/seller-login/handler.ts";
import { sellerForgotRequest } from "../functions/seller-forgot-request/handler.ts";
import { sellerForgotVerify } from "../functions/seller-forgot-verify/handler.ts";
import { sellerOtpRequest } from "../functions/seller-otp-request/handler.ts";
import { sellerChangePassword } from "../functions/seller-change-password/handler.ts";
import { sellerSetEmail } from "../functions/seller-set-email/handler.ts";
import { sellerSetPhone } from "../functions/seller-set-phone/handler.ts";
import { sellerMediaFinalize } from "../functions/seller-media-finalize/handler.ts";
import { sellerExportData } from "../functions/seller-export-data/handler.ts";
import { realDeps, type Deps } from "../functions/_shared/seller.ts";

const assert = (v: unknown, m?: string) => nodeAssert.ok(v, m);
const assertEquals = (a: unknown, b: unknown) => nodeAssert.deepStrictEqual(a, b);
const assertNotEquals = (a: unknown, b: unknown) => nodeAssert.notDeepStrictEqual(a, b);
const assertStringIncludes = (a: string, b: string) => nodeAssert.ok(a.includes(b), `${a} does not include ${b}`);

const logs: string[] = [];
for (const k of ["log", "info", "warn", "error", "debug"] as const) {
  (console as any)[k] = (...a: unknown[]) => { logs.push(a.map(String).join(" ")); };
}

const BIZ = { id: "b1", seller_id: "ES100001", phone: "+254712345678", name: "Shop A", status: "live", user_id: "u1" };
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const jwt = (claims: Record<string, unknown> = {}) => `${b64({ alg: "HS256" })}.${b64({ sub: "u1", ...claims })}.sig`;
const TOKEN = jwt({ session_id: "sess-1" });

type World = {
  tables: Record<string, any[]>;
  rpcCalls: { name: string; args: any }[];
  rpcResults: Record<string, (a: any) => any>;
  counters: Map<string, number>;
  failures: Map<string, { n: number; locked: boolean }>;
  users: Map<string, any>;
  passwordUpdates: { id: string; password: string }[];
  signIns: { email: string; password: string }[];
  validPassword: string;
  removed: string[];
  files: Map<string, Uint8Array>;
  sms: { to: string; message: string }[];
  emails: { to: string; subject: string; html: string }[];
  issuedCodes: string[];
  lastIssue: any;
  updateError: any;
};

function world(): World {
  return {
    tables: { businesses: [{ ...BIZ }], items: [{ id: "i1", business_id: "b1" }, { id: "i2", business_id: "other" }], item_media: [], login_events: [], audit_log: [], faqs: [{ id: "f1", business_id: "b1" }], user_id: [] } as any,
    rpcCalls: [], rpcResults: {}, counters: new Map(), failures: new Map(),
    users: new Map([[TOKEN, { id: "u1" }]]), passwordUpdates: [], signIns: [], validPassword: "Correct-Horse9",
    removed: [], files: new Map(), sms: [], emails: [], issuedCodes: [], lastIssue: null, updateError: null,
  };
}

function deps(w: World): Deps {
  const query = (t: string) => {
    const eqs: [string, unknown][] = [];
    const nes: [string, unknown][] = [];
    let patch: Record<string, unknown> | null = null;
    const rows = () => (w.tables[t] ?? []).filter((r) => eqs.every(([c, v]) => r[c] === v) && nes.every(([c, v]) => r[c] !== v));
    const api: any = {
      select: () => api, limit: () => api,
      update: (p: Record<string, unknown>) => ((patch = p), api),
      eq: (c: string, v: unknown) => (eqs.push([c, v]), api),
      neq: (c: string, v: unknown) => (nes.push([c, v]), api),
      maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      insert: (row: any) => ((w.tables[t] ??= []).push(row), Promise.resolve({ error: null })),
      then: (res: any, rej: any) => {
        if (patch) {
          if (w.updateError) return Promise.resolve({ error: w.updateError }).then(res, rej);
          for (const r of rows()) Object.assign(r, patch);
          return Promise.resolve({ error: null }).then(res, rej);
        }
        return Promise.resolve({ data: rows(), error: null }).then(res, rej);
      },
    };
    return api;
  };
  const rpc = (name: string, args: any) => {
    w.rpcCalls.push({ name, args });
    if (w.rpcResults[name]) return Promise.resolve(w.rpcResults[name](args));
    switch (name) {
      case "hit_rate_limit": {
        const n = (w.counters.get(args.p_key) ?? 0) + 1;
        w.counters.set(args.p_key, n);
        return Promise.resolve({ data: n <= args.p_max, error: null });
      }
      case "auth_lock_remaining":
        return Promise.resolve({ data: w.failures.get(args.p_key)?.locked ? 900 : 0, error: null });
      case "auth_record_failure": {
        const f = w.failures.get(args.p_key) ?? { n: 0, locked: false };
        f.n += 1;
        if (f.n >= args.p_max) f.locked = true;
        w.failures.set(args.p_key, f);
        return Promise.resolve({ data: f.locked ? 900 : 0, error: null });
      }
      case "auth_clear":
        w.failures.delete(args.p_key);
        return Promise.resolve({ data: null, error: null });
      case "seller_otp_issue":
        w.issuedCodes.push(args.p_code);
        w.lastIssue = args;
        return Promise.resolve({ data: { ok: true }, error: null });
      case "seller_otp_verify":
        return Promise.resolve({ data: { ok: args.p_code === "123456", channel: w.lastIssue?.p_channel ?? "sms", target: w.lastIssue?.p_target ?? null }, error: null });
      case "seller_set_verified_phone": {
        // Mirrors the SQL: refuses the number they already have, otherwise saves it and reports the old one.
        const row = w.tables.businesses.find((r) => r.id === args.p_business);
        if (!row) return Promise.resolve({ data: { ok: false, reason: "not_found" }, error: null });
        if (row.phone === args.p_phone) return Promise.resolve({ data: { ok: false, reason: "no_change" }, error: null });
        const previous = row.phone;
        row.phone = args.p_phone;
        return Promise.resolve({ data: { ok: true, phone: args.p_phone, previous, cancelledRequests: 0 }, error: null });
      }
      default:
        return Promise.resolve({ data: null, error: null });
    }
  };
  const db = {
    from: query, rpc,
    auth: {
      getUser: (t: string) => Promise.resolve(w.users.has(t) ? { data: { user: w.users.get(t) }, error: null } : { data: { user: null }, error: { message: "bad" } }),
      admin: { updateUserById: (id: string, a: any) => (w.passwordUpdates.push({ id, password: a.password }), Promise.resolve({ error: null })) },
    },
    storage: {
      from: () => ({
        download: (p: string) => w.files.has(p) ? Promise.resolve({ data: new Blob([w.files.get(p)! as BlobPart]), error: null }) : Promise.resolve({ data: null, error: { message: "nf" } }),
        remove: (ps: string[]) => (w.removed.push(...ps), Promise.resolve({ error: null })),
      }),
    },
  };
  const anon = {
    auth: {
      signInWithPassword: ({ email, password }: any) => {
        w.signIns.push({ email, password });
        const ok = email === "es100001@sellers.epicmkt.app" && password === w.validPassword;
        return Promise.resolve(ok
          ? { data: { session: { access_token: "at", refresh_token: "rt", expires_at: 123, expires_in: 3600 }, user: { id: "u1" } }, error: null }
          : { data: { session: null }, error: { message: "Invalid login credentials" } });
      },
    },
  };
  return {
    db, anon, salt: "salt", code: () => "123456",
    sms: (to, message) => (w.sms.push({ to, message }), Promise.resolve(true)),
    email: (to, subject, html) => (w.emails.push({ to, subject, html }), Promise.resolve(true)),
  };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://x/", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4", ...headers }, body: JSON.stringify(body) });
const authed = (body: unknown = {}, token = TOKEN) => post(body, { authorization: `Bearer ${token}` });
const read = async (r: Response) => ({ status: r.status, body: await r.json(), cache: r.headers.get("cache-control") });

Deno.test("login: success returns a session and records the event", async () => {
  const w = world();
  const r = await read(await sellerLogin(deps(w))(post({ sellerId: "es100001", password: w.validPassword })));
  assertEquals(r.status, 200);
  assertEquals(r.body.session.access_token, "at");
  assertEquals(r.cache, "no-store");
  assertEquals(Object.keys(r.body), ["session"]);
  assertEquals(w.tables.login_events.length, 1);
  assertEquals(w.tables.login_events[0].success, true);
  assertEquals(w.tables.login_events[0].business_id, "b1");
  assert(!JSON.stringify(w.tables.login_events).includes(w.validPassword));
});

Deno.test("login: five failures lock, unknown IDs look identical", async () => {
  const w = world();
  const h = sellerLogin(deps(w));
  const seen = { known: [] as any[], unknown: [] as any[] };
  for (let i = 0; i < 6; i++) {
    seen.known.push(await read(await h(post({ sellerId: "ES100001", password: "wrong-pass-1A" }))));
    seen.unknown.push(await read(await h(post({ sellerId: "ES999999", password: "wrong-pass-1A" }))));
  }
  assertEquals(seen.known.map((r) => r.status), [401, 401, 401, 401, 429, 429]);
  assertEquals(seen.known, seen.unknown);
  assertEquals(seen.known[0].body, { error: "invalid_credentials", message: "Seller ID or password is incorrect." });
  const correctWhileLocked = await read(await h(post({ sellerId: "ES100001", password: w.validPassword })));
  assertEquals(correctWhileLocked.status, 429);
  assertEquals(w.tables.login_events.filter((e) => e.success).length, 0);
  assertEquals(w.tables.login_events.length, 5);
  assert(w.signIns.every((s) => s.email.endsWith("@sellers.epicmkt.app")));
});

Deno.test("login: bad input and IP rate limit", async () => {
  const w = world();
  const h = sellerLogin(deps(w));
  assertEquals((await h(post({ sellerId: "x", password: "" }))).status, 400);
  assertEquals((await h(new Request("http://x/", { method: "GET" }))).status, 405);
  assertEquals((await h(new Request("http://x/", { method: "OPTIONS" }))).status, 200);
  let last = 0;
  for (let i = 0; i < 61; i++) last = (await h(post({ sellerId: "ES777777", password: "p" }))).status;
  assertEquals(last, 429);
});

Deno.test("forgot-request: same answer for known and unknown IDs, SMS only when issued", async () => {
  const w = world();
  const h = sellerForgotRequest(deps(w));
  const known = await read(await h(post({ sellerId: "ES100001" })));
  const unknown = await read(await h(post({ sellerId: "ES555555" })));
  assertEquals(known, unknown);
  assertEquals(known.status, 200);
  assertEquals(w.sms.length, 1);
  assertEquals(w.sms[0].to, "+254712345678");
  assertStringIncludes(w.sms[0].message, "123456");
  assertEquals(w.issuedCodes, ["123456"]);
  const again = await read(await h(post({ sellerId: "ES100001" })));
  const againUnknown = await read(await h(post({ sellerId: "ES555555" })));
  assertEquals(again.status, 429);
  assertEquals(again, againUnknown);
  assertEquals(w.sms.length, 1);
  const w2 = world();
  w2.rpcResults["seller_otp_issue"] = () => ({ data: { ok: false, reason: "hour_limit" }, error: null });
  const blocked = await read(await sellerForgotRequest(deps(w2))(post({ sellerId: "ES100001" })));
  assertEquals(blocked.status, 200);
  assertEquals(w2.sms.length, 0);
  w2.tables.businesses[0].status = "deleted";
  assertEquals((await read(await sellerForgotRequest(deps(world()))(post({ sellerId: "bad id!" })))).status, 200);
});

Deno.test("forgot-verify: resets the password and signs out every session", async () => {
  const w = world();
  const h = sellerForgotVerify(deps(w));
  const ok = await read(await h(post({ sellerId: "ES100001", code: "123456", newPassword: "Brand-New-Pass1" })));
  assertEquals(ok.status, 200);
  assertEquals(w.passwordUpdates, [{ id: "u1", password: "Brand-New-Pass1" }]);
  const revoke = w.rpcCalls.find((c) => c.name === "revoke_user_sessions")!;
  assertEquals(revoke.args, { p_user: "u1", p_keep: null });
  assertEquals(w.tables.audit_log[0].action, "password_reset");
  assertEquals(w.tables.businesses[0].must_change_password, false);
  assert(typeof w.tables.businesses[0].password_changed_at === "string");
  assert(!JSON.stringify(w.tables.audit_log).includes("Brand-New-Pass1"));
  assert(!JSON.stringify(w.tables.audit_log).includes("123456"));
});

Deno.test("forgot-verify: weak passwords, wrong codes and unknown IDs", async () => {
  const w = world();
  const h = sellerForgotVerify(deps(w));
  const weak = await read(await h(post({ sellerId: "ES100001", code: "123456", newPassword: "short" })));
  assertEquals(weak.status, 422);
  assertEquals(weak.body.error, "weak_password");
  assert(weak.body.problems.includes("too_short"));
  const phone = await read(await h(post({ sellerId: "ES100001", code: "123456", newPassword: "0712345678" })));
  assert(phone.body.problems.includes("is_phone"));
  const own = await read(await h(post({ sellerId: "ES100001", code: "123456", newPassword: "es100001" })));
  assert(own.body.problems.includes("is_seller_id"));
  assertEquals(w.rpcCalls.filter((c) => c.name === "seller_otp_verify").length, 0);
  const wrong = await read(await h(post({ sellerId: "ES100001", code: "000000", newPassword: "Brand-New-Pass1" })));
  const unknown = await read(await h(post({ sellerId: "ES424242", code: "123456", newPassword: "Brand-New-Pass1" })));
  assertEquals(wrong.status, 400);
  assertEquals(wrong, unknown);
  assertEquals(w.passwordUpdates.length, 0);
  assertEquals((await h(post({ sellerId: "ES100001", code: "12", newPassword: "Brand-New-Pass1" }))).status, 400);
});

Deno.test("otp-request and change-password need a seller JWT", async () => {
  const w = world();
  const req = sellerOtpRequest(deps(w));
  assertEquals((await req(post({ purpose: "change_password" }))).status, 401);
  assertEquals((await req(authed({ purpose: "change_password" }, "forged"))).status, 401);
  assertEquals((await req(authed({ purpose: "forgot_password" }))).status, 400);
  const noBiz = world();
  noBiz.tables.businesses = [];
  assertEquals((await sellerOtpRequest(deps(noBiz))(authed({ purpose: "change_password" }))).status, 403);
  const ok = await read(await req(authed({ purpose: "change_password" })));
  assertEquals(ok.status, 200);
  assertEquals(ok.body, { ok: true, channel: "sms", sentTo: "+2547*****678" });
  assertEquals(w.sms.length, 1);
  assertEquals((await sellerChangePassword(deps(w))(post({ code: "123456", newPassword: "Brand-New-Pass1" }))).status, 401);
});

Deno.test("otp-request: resend wait is a 429 with the retry time", async () => {
  const w = world();
  w.rpcResults["seller_otp_issue"] = () => ({ data: { ok: false, reason: "resend_wait", retry_after: 42 }, error: null });
  const r = await read(await sellerOtpRequest(deps(w))(authed({ purpose: "change_password" })));
  assertEquals(r.status, 429);
  assertEquals(r.body.retryAfter, 42);
  assertEquals(w.sms.length, 0);
});

Deno.test("change-password: keeps only the current session", async () => {
  const w = world();
  const h = sellerChangePassword(deps(w));
  const weak = await read(await h(authed({ code: "123456", newPassword: "ES100001" })));
  assertEquals(weak.status, 422);
  assertEquals(w.rpcCalls.filter((c) => c.name === "seller_otp_verify").length, 0);
  const wrong = await read(await h(authed({ code: "654321", newPassword: "Brand-New-Pass1" })));
  assertEquals(wrong.status, 400);
  assertEquals(w.passwordUpdates.length, 0);
  const ok = await read(await h(authed({ code: "123456", newPassword: "Brand-New-Pass1" })));
  assertEquals(ok.status, 200);
  assertEquals(w.passwordUpdates, [{ id: "u1", password: "Brand-New-Pass1" }]);
  assertEquals(w.rpcCalls.find((c) => c.name === "revoke_user_sessions")!.args, { p_user: "u1", p_keep: "sess-1" });
  assertEquals(w.tables.audit_log[0].action, "password_changed");
  assertEquals(w.tables.businesses[0].must_change_password, false);
  assert(typeof w.tables.businesses[0].password_changed_at === "string");
  assertEquals(w.emails.length, 0); // no verified email yet, so no notice
});

// ---------------------------------------------------------------------------
// Sign in with a verified email, codes by SMS or email, and setting the email
// ---------------------------------------------------------------------------
const verifiedWorld = () => {
  const w = world();
  Object.assign(w.tables.businesses[0], { login_email: "jane@example.com", login_email_verified_at: "2026-10-01T00:00:00Z", must_change_password: true });
  return w;
};

Deno.test("login: a verified email signs in as the same seller, an unverified or unknown one does not", async () => {
  const w = verifiedWorld();
  const ok = await read(await sellerLogin(deps(w))(post({ identifier: "Jane@Example.com", password: w.validPassword })));
  assertEquals(ok.status, 200);
  assertEquals(w.signIns[0].email, "es100001@sellers.epicmkt.app");
  const byId = await read(await sellerLogin(deps(w))(post({ identifier: "es100001", password: w.validPassword })));
  assertEquals(byId.status, 200);

  const u = verifiedWorld();
  u.tables.businesses[0].login_email_verified_at = null;
  const unverified = await read(await sellerLogin(deps(u))(post({ identifier: "jane@example.com", password: u.validPassword })));
  const unknown = await read(await sellerLogin(deps(u))(post({ identifier: "nobody@example.com", password: u.validPassword })));
  assertEquals(unverified.status, 401);
  assertEquals(unverified, unknown);
  assert(u.signIns.every((x) => x.email.startsWith("none-")));
});

Deno.test("login: a Seller ID and its email share one lockout", async () => {
  const w = verifiedWorld();
  const h = sellerLogin(deps(w));
  for (let i = 0; i < 3; i++) await h(post({ identifier: "ES100001", password: "wrong-pass-1A" }));
  for (let i = 0; i < 2; i++) await h(post({ identifier: "jane@example.com", password: "wrong-pass-1A" }));
  const locked = await read(await h(post({ identifier: "jane@example.com", password: w.validPassword })));
  assertEquals(locked.status, 429);
  assertEquals(locked.body.error, "locked");
  assertEquals((await read(await h(post({ identifier: "ES100001", password: w.validPassword })))).status, 429);
});

Deno.test("forgot-request: SMS by default, email only to a verified address, same answer every time", async () => {
  const w = verifiedWorld();
  const h = sellerForgotRequest(deps(w));
  const bySms = await read(await h(post({ identifier: "ES100001" })));
  assertEquals(w.sms.length, 1);
  assertEquals(w.emails.length, 0);
  assertEquals(w.lastIssue.p_channel, "sms");

  const byEmail = await read(await h(post({ identifier: "jane@example.com", channel: "email" })));
  assertEquals(w.emails.length, 1);
  assertEquals(w.emails[0].to, "jane@example.com");
  assertStringIncludes(w.emails[0].html, "123456");
  assertEquals(w.lastIssue.p_channel, "email");
  assertEquals(bySms.body, byEmail.body);

  const u = world(); // no email on file: the email channel sends nothing and asks for no code
  const none = await read(await sellerForgotRequest(deps(u))(post({ identifier: "ES100001", channel: "email" })));
  assertEquals(none.status, 200);
  assertEquals(none.body, bySms.body);
  assertEquals(u.emails.length, 0);
  assertEquals(u.sms.length, 0);
  assertEquals(u.issuedCodes.length, 0);
});

Deno.test("forgot-verify: works with the email, saves the new state, records the channel", async () => {
  const w = verifiedWorld();
  w.lastIssue = { p_channel: "email" };
  const ok = await read(await sellerForgotVerify(deps(w))(post({ identifier: "jane@example.com", code: "123456", newPassword: "Brand-New-Pass1" })));
  assertEquals(ok.status, 200);
  assertEquals(w.passwordUpdates, [{ id: "u1", password: "Brand-New-Pass1" }]);
  assertEquals(w.tables.businesses[0].must_change_password, false);
  assertEquals(w.tables.audit_log[0].data, { channel: "email" });
});

Deno.test("otp-request: change_password by email needs a verified email and masks the address", async () => {
  const w = world();
  const noEmail = await read(await sellerOtpRequest(deps(w))(authed({ purpose: "change_password", channel: "email" })));
  assertEquals(noEmail.status, 409);
  assertEquals(noEmail.body.error, "email_not_verified");
  assertEquals(w.issuedCodes.length, 0);

  const v = verifiedWorld();
  const ok = await read(await sellerOtpRequest(deps(v))(authed({ purpose: "change_password", channel: "email" })));
  assertEquals(ok.body, { ok: true, channel: "email", sentTo: "j*******@example.com" });
  assertEquals(v.emails.map((m) => m.to), ["jane@example.com"]);
  assertEquals(v.sms.length, 0);

  const failing = verifiedWorld();
  const d = deps(failing);
  d.email = () => Promise.resolve(false);
  assertEquals((await sellerOtpRequest(d)(authed({ purpose: "change_password", channel: "email" }))).status, 502);
});

Deno.test("otp-request: verify_email sends to the new address, refuses one another seller has", async () => {
  const w = world();
  const ok = await read(await sellerOtpRequest(deps(w))(authed({ purpose: "verify_email", email: "New.Person@Example.com" })));
  assertEquals(ok.status, 200);
  assertEquals(ok.body.channel, "email");
  assertEquals(w.emails[0].to, "new.person@example.com");
  assertEquals(w.lastIssue.p_purpose, "verify_email");
  assertEquals(w.lastIssue.p_target, "new.person@example.com");
  assertEquals(w.sms.length, 0);

  const t = world();
  t.tables.businesses.push({ id: "b2", seller_id: "ES200002", phone: "+254700000002", status: "live", user_id: "u2", login_email: "taken@example.com" });
  const taken = await read(await sellerOtpRequest(deps(t))(authed({ purpose: "verify_email", email: "taken@example.com" })));
  assertEquals(taken.status, 409);
  assertEquals(taken.body.error, "email_in_use");
  assertEquals(t.emails.length, 0);

  assertEquals((await sellerOtpRequest(deps(world()))(authed({ purpose: "verify_email", email: "not-an-email" }))).status, 400);
  assertEquals((await sellerOtpRequest(deps(world()))(post({ purpose: "verify_email", email: "a@b.co" }))).status, 401);
});

Deno.test("set-email: needs the code AND the current password, and saves the address the code was sent to", async () => {
  const w = world();
  await sellerOtpRequest(deps(w))(authed({ purpose: "verify_email", email: "jane@example.com" }));
  const h = sellerSetEmail(deps(w));

  assertEquals((await h(post({ code: "123456", currentPassword: w.validPassword }))).status, 401); // no session
  const wrongPw = await read(await h(authed({ code: "123456", currentPassword: "Wrong-Pass-1" })));
  assertEquals(wrongPw.status, 401);
  assertEquals(wrongPw.body.error, "invalid_password");
  assertEquals(w.rpcCalls.filter((c) => c.name === "seller_otp_verify").length, 0); // the code is not spent on a bad password
  assertEquals(w.tables.businesses[0].login_email, undefined);

  const wrongCode = await read(await h(authed({ code: "000000", currentPassword: w.validPassword })));
  assertEquals(wrongCode.status, 400);
  assertEquals(w.tables.businesses[0].login_email, undefined);

  const ok = await read(await h(authed({ code: "123456", currentPassword: w.validPassword })));
  assertEquals(ok.status, 200);
  assertEquals(ok.body, { ok: true, loginEmail: "jane@example.com" });
  assertEquals(w.tables.businesses[0].login_email, "jane@example.com");
  assert(typeof w.tables.businesses[0].login_email_verified_at === "string");
  assertEquals(w.tables.audit_log[0].action, "login_email_set");
  assert(!JSON.stringify(w.tables.audit_log).includes("jane@example.com"));
});

Deno.test("set-email: repeated wrong passwords lock the account, a taken address is a 409, the old address is told", async () => {
  const w = world();
  const h = sellerSetEmail(deps(w));
  for (let i = 0; i < 5; i++) await h(authed({ code: "123456", currentPassword: "Wrong-Pass-1" }));
  const locked = await read(await h(authed({ code: "123456", currentPassword: w.validPassword })));
  assertEquals(locked.status, 429);

  const dup = world();
  await sellerOtpRequest(deps(dup))(authed({ purpose: "verify_email", email: "new@example.com" }));
  dup.updateError = { code: "23505", message: "duplicate key value violates unique constraint" };
  assertEquals((await read(await sellerSetEmail(deps(dup))(authed({ code: "123456", currentPassword: dup.validPassword })))).body.error, "email_in_use");

  const change = verifiedWorld();
  await sellerOtpRequest(deps(change))(authed({ purpose: "verify_email", email: "new@example.com" }));
  change.emails.length = 0;
  const ok = await read(await sellerSetEmail(deps(change))(authed({ code: "123456", currentPassword: change.validPassword })));
  assertEquals(ok.status, 200);
  assertEquals(change.tables.businesses[0].login_email, "new@example.com");
  assertEquals(change.emails.map((m) => m.to), ["jane@example.com"]);
  assert(!change.emails[0].html.includes("new@example.com")); // only a masked form
});

Deno.test("change-password: tells a verified email address that the password changed", async () => {
  const w = verifiedWorld();
  const ok = await read(await sellerChangePassword(deps(w))(authed({ code: "123456", newPassword: "Brand-New-Pass1" })));
  assertEquals(ok.status, 200);
  assertEquals(w.emails.map((m) => m.to), ["jane@example.com"]);
  assertEquals(w.tables.businesses[0].must_change_password, false);
});

const png = (width: number, height: number) => {
  const be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...be(13), 0x49, 0x48, 0x44, 0x52, ...be(width), ...be(height), 8, 6, 0, 0, 0]);
};
const mp4Bytes = (width: number, height: number, seconds: number) => {
  const be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const str = (x: string) => [...x].map((c) => c.charCodeAt(0));
  const box = (name: string, ...parts: number[][]) => { const body = parts.flat(); return [...be(body.length + 8), ...str(name), ...body]; };
  const mvhd = box("mvhd", [0, 0, 0, 0], be(0), be(0), be(1000), be(seconds * 1000), new Array(80).fill(0));
  const tkhd = box("tkhd", [0, 0, 0, 3], be(0), be(0), be(1), be(0), be(seconds * 1000), new Array(8).fill(0), [0, 0, 0, 0, 0, 0, 0, 0], new Array(36).fill(0), be(width * 65536), be(height * 65536));
  return Uint8Array.from([...box("ftyp", str("isom"), be(0), str("isom")), ...box("moov", mvhd, box("trak", tkhd)), ...box("mdat", [1, 2, 3, 4])]);
};

// Finalize is for videos in the bucket (pictures go through Cloudinary): the path must be one this shop was signed for.
Deno.test("media-finalize (video): ownership, real type, limits and cleanup", async () => {
  const w = world();
  const h = sellerMediaFinalize(deps(w));
  const itemId = "11111111-1111-4111-8111-111111111111";
  const good = `b1/${itemId}/a.mp4`;
  w.tables.items = [{ id: itemId, business_id: "b1" }, { id: "22222222-2222-4222-8222-222222222222", business_id: "other" }];
  w.rpcResults["media_confirm_upload"] = (a: any) => (a.p_public_id.endsWith("unsigned.mp4") ? { data: null, error: { message: "upload_not_found" } } : { data: { purpose: "item_video", item_id: itemId }, error: null });

  assertEquals((await h(post({ itemId, path: good }))).status, 401);
  const foreign = await read(await h(authed({ itemId, path: "other/x/a.mp4" })));
  assertEquals(foreign.status, 403);
  assertEquals((await h(authed({ itemId, path: "b1/../other/x.mp4" }))).status, 403);
  assertEquals(w.removed, []);

  const otherItem = await read(await h(authed({ itemId: "22222222-2222-4222-8222-222222222222", path: `b1/22222222-2222-4222-8222-222222222222/a.mp4` })));
  assertEquals(otherItem.status, 404);
  assertEquals(w.removed, [`b1/22222222-2222-4222-8222-222222222222/a.mp4`]);
  w.removed.length = 0;

  assertEquals((await read(await h(authed({ itemId, path: good })))).status, 404); // signed, but nothing was uploaded
  assertEquals((await read(await h(authed({ itemId, path: `b1/${itemId}/unsigned.mp4` })))).body.error, "upload_not_found");
  assertEquals((await read(await h(authed({ itemId, path: `b1/${itemId}/a.png` })))).body.error, "unsupported_type"); // pictures are not finalized here

  w.files.set(`b1/${itemId}/fake.mp4`, new TextEncoder().encode("<svg onload=alert(1)></svg> not a video"));
  const fake = await read(await h(authed({ itemId, path: `b1/${itemId}/fake.mp4` })));
  assertEquals([fake.status, fake.body.error], [422, "unsupported_type"]);
  assertEquals(w.removed, [`b1/${itemId}/fake.mp4`]);
  w.removed.length = 0;

  w.files.set(`b1/${itemId}/pic.mp4`, png(800, 600));
  assertEquals((await read(await h(authed({ itemId, path: `b1/${itemId}/pic.mp4` })))).body.error, "unsupported_type");
  assertEquals(w.removed, [`b1/${itemId}/pic.mp4`]);
  w.removed.length = 0;

  w.files.set(`b1/${itemId}/long.mp4`, mp4Bytes(640, 480, 61));
  assertEquals((await read(await h(authed({ itemId, path: `b1/${itemId}/long.mp4` })))).body.error, "too_long");
  assertEquals(w.removed, [`b1/${itemId}/long.mp4`]);
  w.removed.length = 0;

  const bytes = mp4Bytes(1280, 720, 12);
  w.files.set(good, bytes);
  w.rpcResults["attach_item_media"] = () => ({ data: null, error: { message: "limit_reached:item_media" } });
  const full = await read(await h(authed({ itemId, path: good })));
  assertEquals([full.status, full.body.error], [409, "limit_reached"]);
  assertEquals(w.removed, [good]);
  w.removed.length = 0;

  // A transient database error keeps the file: the signed ticket is still good, so the seller's retry can finish.
  w.files.set(good, bytes);
  w.rpcResults["attach_item_media"] = () => ({ data: null, error: { message: "boom" } });
  assertEquals((await read(await h(authed({ itemId, path: good })))).status, 500);
  assertEquals(w.removed, []);

  w.rpcResults["attach_item_media"] = () => ({ data: "media-1", error: null });
  const ok = await read(await h(authed({ itemId, path: good })));
  assertEquals(ok.status, 201);
  assertEquals(ok.body, { id: "media-1", kind: "video", width: 1280, height: 720, durationSec: 12, size: bytes.length });
  assertEquals(w.removed, []);
  const call = w.rpcCalls.filter((c) => c.name === "attach_item_media").at(-1)!.args;
  assertEquals([call.p_kind, call.p_mime, call.p_path, call.p_item], ["video", "video/mp4", good, itemId]);

  w.tables.item_media.push({ id: "m", path: good });
  assertEquals((await read(await h(authed({ itemId, path: good })))).status, 409);
  assertEquals(w.removed, []);
});

Deno.test("export-data: own rows only, no secrets, rate limited", async () => {
  const w = world();
  w.tables.businesses[0] = { ...BIZ, application_id: "app-1", tagline: "hi" };
  w.tables.seller_otps = [{ business_id: "b1", code_hash: "x" }];
  w.tables.messages = [
    { id: "m1", business_id: "b1", channel: "in_app", subject: "Hello" },
    { id: "m2", business_id: "other", channel: "in_app", subject: "No" },
    { id: "m3", business_id: "b1", channel: "sms", body: "staff-only delivery log" },
  ];
  const h = sellerExportData(deps(w));
  assertEquals((await h(post({}))).status, 401);
  const res = await h(authed());
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("cache-control"), "no-store");
  assertStringIncludes(res.headers.get("content-disposition")!, "attachment");
  const body = await res.json();
  assertEquals(body.business.tagline, "hi");
  assert(!("user_id" in body.business) && !("application_id" in body.business));
  assertEquals(body.messages.map((m: any) => m.id), ["m1"]);
  assertEquals(body.items.map((i: any) => i.id), ["i1"]);
  assert(!("seller_otps" in body) && !("auth_attempts" in body) && !("reports" in body));
  assertEquals(w.tables.audit_log.at(-1).action, "data_exported");
  await h(authed());
  await h(authed());
  assertEquals((await h(authed())).status, 429);
});

Deno.test("real deps: development uses 123456 and sends no SMS, production sends a random code", async () => {
  const set = (k: string, v?: string) => (v === undefined ? Deno.env.delete(k) : Deno.env.set(k, v));
  const saved = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "APP_ENV", "MESSAGING_MODE", "AT_API_KEY", "AT_USERNAME", "AT_SENDER"].map((k) => [k, Deno.env.get(k)] as const);
  const realFetch = globalThis.fetch;
  const sent: { url: string; body: string }[] = [];
  globalThis.fetch = ((url: string, init: any) => (sent.push({ url: String(url), body: String(init?.body) }), Promise.resolve(new Response(JSON.stringify({ SMSMessageData: { Recipients: [{ statusCode: 101, status: "Success", number: "+254712345678", cost: "KES 0.8000", messageId: "ATXid_1" }] } }), { status: 201 })))) as any;
  try {
    set("SUPABASE_URL", "http://localhost:54321");
    set("SUPABASE_SERVICE_ROLE_KEY", "service");
    set("SUPABASE_ANON_KEY", "anon");
    set("AT_API_KEY", "k");
    set("AT_USERNAME", "sandbox");
    set("AT_SENDER", "EpicMKT");
    set("MESSAGING_MODE", undefined);
    set("APP_ENV", "development");
    const dev = realDeps();
    assertEquals(dev.code(), "123456");
    assertEquals(await dev.sms("+254712345678", "Your EpicMKT code is 123456."), true);
    assertEquals(await dev.email("jane@example.com", "Your EpicMKT code", "<p>123456</p>"), true);
    assertEquals(sent.length, 0);
    set("APP_ENV", "production");
    const prod = realDeps();
    const codes = new Set(Array.from({ length: 20 }, () => prod.code()));
    assert([...codes].every((c) => /^\d{6}$/.test(c)));
    assert(codes.size > 1);
    assertEquals(await prod.sms("+254712345678", "Your EpicMKT code is 654321."), true);
    assertEquals(sent.length, 1);
    assertStringIncludes(sent[0].url, "africastalking.com");
    assertStringIncludes(decodeURIComponent(sent[0].body), "654321");
  } finally {
    globalThis.fetch = realFetch;
    for (const [k, v] of saved) set(k, v);
  }
});

Deno.test("nothing is logged, and no code or password reaches the logs", async () => {
  assertEquals(logs.filter((l) => /123456|654321|Brand-New|Correct-Horse|wrong-pass/.test(l)), []);
  assertEquals(logs.length, 0);
  const files = [...Deno.readDirSync(new URL("../functions", import.meta.url))].filter((e) => e.isDirectory && e.name.startsWith("seller-"));
  assertNotEquals(files.length, 0);
  for (const f of files) {
    for (const name of ["handler.ts", "index.ts"]) {
      const text = Deno.readTextFileSync(new URL(`../functions/${f.name}/${name}`, import.meta.url));
      assert(!/console\./.test(text), `${f.name}/${name} logs`);
    }
  }
  assert(!/console\./.test(Deno.readTextFileSync(new URL("../functions/_shared/seller.ts", import.meta.url))));
});

Deno.test("otp-request: verify_email can check the password first, so a wrong one never sends the code", async () => {
  const w = world();
  const wrong = await read(await sellerOtpRequest(deps(w))(authed({ purpose: "verify_email", email: "new@example.com", currentPassword: "Wrong-Pass-1" })));
  assertEquals(wrong.status, 401);
  assertEquals(wrong.body.error, "invalid_password");
  assertEquals(w.emails.length, 0);
  assertEquals(w.issuedCodes.length, 0);
  const right = await read(await sellerOtpRequest(deps(w))(authed({ purpose: "verify_email", email: "new@example.com", currentPassword: w.validPassword })));
  assertEquals(right.status, 200);
  assertEquals(w.emails.length, 1);
});

Deno.test("otp-request: verify_phone texts the NEW number, only after the password, and records which number", async () => {
  const w = world();
  const h = sellerOtpRequest(deps(w));
  assertEquals((await h(post({ purpose: "verify_phone", phone: "0722 000 111", currentPassword: w.validPassword }))).status, 401); // no session
  assertEquals((await h(authed({ purpose: "verify_phone", phone: "0722000111" }))).status, 400); // password is required

  const wrong = await read(await h(authed({ purpose: "verify_phone", phone: "0722000111", currentPassword: "Wrong-Pass-1" })));
  assertEquals(wrong.status, 401);
  assertEquals(wrong.body.error, "invalid_password");
  assertEquals(w.sms.length, 0); // nothing is texted on a wrong password
  assertEquals(w.issuedCodes.length, 0);

  const ok = await read(await h(authed({ purpose: "verify_phone", phone: "0722 000 111", currentPassword: w.validPassword })));
  assertEquals(ok.status, 200);
  assertEquals(ok.body, { ok: true, channel: "sms", sentTo: "+2547*****111" });
  assertEquals(w.sms.map((m) => m.to), ["+254722000111"]); // the new number, in one form, never the old one
  assert(w.sms[0].message.includes("123456"));
  assertEquals(w.emails.length, 0);
  assertEquals(w.lastIssue.p_purpose, "verify_phone");
  assertEquals(w.lastIssue.p_channel, "sms");
  assertEquals(w.lastIssue.p_target, "+254722000111");
});

Deno.test("otp-request: verify_phone refuses a number that is not a number, the one they already have, and a failed send", async () => {
  const w = world();
  const h = sellerOtpRequest(deps(w));
  for (const phone of ["12345", "abc", "0722 000 11", "+0123456789", "+1234", "07123456789012", "0722000111 ext 4"]) {
    assertEquals((await h(authed({ purpose: "verify_phone", phone, currentPassword: w.validPassword }))).status, 400, phone);
  }
  const same = await read(await h(authed({ purpose: "verify_phone", phone: "0712 345 678", currentPassword: w.validPassword })));
  assertEquals(same.status, 409);
  assertEquals(same.body.error, "no_change");
  assertEquals(w.sms.length, 0);
  assertEquals(w.issuedCodes.length, 0);

  const failing = world();
  const d = deps(failing);
  d.sms = () => Promise.resolve(false);
  assertEquals((await sellerOtpRequest(d)(authed({ purpose: "verify_phone", phone: "0722000111", currentPassword: failing.validPassword }))).status, 502);
});

Deno.test("otp-request: verify_phone accepts a number from another country, written with its code, and masks it", async () => {
  const w = world();
  const h = sellerOtpRequest(deps(w));
  const ug = await read(await h(authed({ purpose: "verify_phone", phone: "+256 772 123 456", currentPassword: w.validPassword })));
  assertEquals(ug.status, 200);
  assertEquals(ug.body.sentTo, "+2567*****456"); // never the whole number
  assertEquals(w.sms.map((m) => m.to), ["+256772123456"]);
  const zeros = await read(await h(authed({ purpose: "verify_phone", phone: "00256772123457", currentPassword: w.validPassword }))); // 00 is the same as +
  assertEquals(zeros.status, 200);
  assertEquals(w.lastIssue.p_target, "+256772123457");
});

Deno.test("set-phone: needs the code AND the current password, and saves the number the code was sent to", async () => {
  const w = world();
  await sellerOtpRequest(deps(w))(authed({ purpose: "verify_phone", phone: "0722000111", currentPassword: w.validPassword }));
  w.sms.length = 0;
  const h = sellerSetPhone(deps(w));

  assertEquals((await h(post({ code: "123456", currentPassword: w.validPassword }))).status, 401); // no session
  const wrongPw = await read(await h(authed({ code: "123456", currentPassword: "Wrong-Pass-1" })));
  assertEquals(wrongPw.status, 401);
  assertEquals(wrongPw.body.error, "invalid_password");
  assertEquals(w.rpcCalls.filter((c) => c.name === "seller_otp_verify").length, 0); // the code is not spent on a bad password
  assertEquals(w.tables.businesses[0].phone, "+254712345678");

  const wrongCode = await read(await h(authed({ code: "000000", currentPassword: w.validPassword })));
  assertEquals(wrongCode.status, 400);
  assertEquals(wrongCode.body.error, "invalid_code");
  assertEquals(w.tables.businesses[0].phone, "+254712345678");

  const ok = await read(await h(authed({ code: "123456", currentPassword: w.validPassword })));
  assertEquals(ok.status, 200);
  assertEquals(ok.body, { ok: true, phone: "+254722000111" });
  assertEquals(w.tables.businesses[0].phone, "+254722000111");
  assertEquals(w.rpcCalls.filter((c) => c.name === "seller_otp_verify").every((c) => c.args.p_purpose === "verify_phone"), true);

  assertEquals(w.tables.audit_log[0].action, "phone_changed");
  const audit = JSON.stringify(w.tables.audit_log);
  assert(!audit.includes("+254722000111") && !audit.includes("+254712345678")); // only masked forms are logged
  assert(!audit.includes("123456") && !audit.includes(w.validPassword));
});

Deno.test("set-phone: the OLD number is texted, a verified email is told, and a request body cannot choose the number", async () => {
  const w = verifiedWorld();
  await sellerOtpRequest(deps(w))(authed({ purpose: "verify_phone", phone: "0722000111", currentPassword: w.validPassword }));
  w.sms.length = 0;
  w.emails.length = 0;
  // A number smuggled into the body is ignored: only the one the code was issued for is saved.
  const ok = await read(await sellerSetPhone(deps(w))(authed({ code: "123456", currentPassword: w.validPassword, phone: "0799999999" })));
  assertEquals(ok.status, 200);
  assertEquals(w.tables.businesses[0].phone, "+254722000111");
  assertEquals(w.sms.map((m) => m.to), ["+254712345678"]);
  assert(!w.sms[0].message.includes("+254722000111")); // masked
  assertEquals(w.emails.map((m) => m.to), ["jane@example.com"]);
  assert(!w.emails[0].html.includes("+254722000111"));

  const plain = world(); // no verified email: only the SMS notice, and nothing breaks
  await sellerOtpRequest(deps(plain))(authed({ purpose: "verify_phone", phone: "0722000111", currentPassword: plain.validPassword }));
  plain.sms.length = 0;
  assertEquals((await sellerSetPhone(deps(plain))(authed({ code: "123456", currentPassword: plain.validPassword }))).status, 200);
  assertEquals(plain.emails.length, 0);
  assertEquals(plain.sms.length, 1);
});

Deno.test("set-phone: repeated wrong passwords lock the account, and a number they already have is a 409", async () => {
  const w = world();
  const h = sellerSetPhone(deps(w));
  for (let i = 0; i < 5; i++) await h(authed({ code: "123456", currentPassword: "Wrong-Pass-1" }));
  assertEquals((await read(await h(authed({ code: "123456", currentPassword: w.validPassword })))).status, 429);
  assertEquals(w.tables.businesses[0].phone, "+254712345678");

  const same = world();
  same.lastIssue = { p_channel: "sms", p_target: "+254712345678" }; // the number changed back to theirs between the code and the save
  const r = await read(await sellerSetPhone(deps(same))(authed({ code: "123456", currentPassword: same.validPassword })));
  assertEquals(r.status, 409);
  assertEquals(r.body.error, "no_change");

  assertEquals((await sellerSetPhone(deps(world()))(authed({ code: "12", currentPassword: "x" }))).status, 400);
});
