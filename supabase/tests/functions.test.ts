import nodeAssert from "node:assert/strict";
import { sellerLogin } from "../functions/seller-login/handler.ts";
import { sellerForgotRequest } from "../functions/seller-forgot-request/handler.ts";
import { sellerForgotVerify } from "../functions/seller-forgot-verify/handler.ts";
import { sellerOtpRequest } from "../functions/seller-otp-request/handler.ts";
import { sellerChangePassword } from "../functions/seller-change-password/handler.ts";
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
  issuedCodes: string[];
};

function world(): World {
  return {
    tables: { businesses: [{ ...BIZ }], items: [{ id: "i1", business_id: "b1" }, { id: "i2", business_id: "other" }], item_media: [], login_events: [], audit_log: [], faqs: [{ id: "f1", business_id: "b1" }], user_id: [] } as any,
    rpcCalls: [], rpcResults: {}, counters: new Map(), failures: new Map(),
    users: new Map([[TOKEN, { id: "u1" }]]), passwordUpdates: [], signIns: [], validPassword: "Correct-Horse9",
    removed: [], files: new Map(), sms: [], issuedCodes: [],
  };
}

function deps(w: World): Deps {
  const query = (t: string) => {
    const eqs: [string, unknown][] = [];
    const nes: [string, unknown][] = [];
    const rows = () => (w.tables[t] ?? []).filter((r) => eqs.every(([c, v]) => r[c] === v) && nes.every(([c, v]) => r[c] !== v));
    const api: any = {
      select: () => api, limit: () => api,
      eq: (c: string, v: unknown) => (eqs.push([c, v]), api),
      neq: (c: string, v: unknown) => (nes.push([c, v]), api),
      maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      insert: (row: any) => ((w.tables[t] ??= []).push(row), Promise.resolve({ error: null })),
      then: (res: any, rej: any) => Promise.resolve({ data: rows(), error: null }).then(res, rej),
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
        return Promise.resolve({ data: { ok: true }, error: null });
      case "seller_otp_verify":
        return Promise.resolve({ data: { ok: args.p_code === "123456" }, error: null });
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
        download: (p: string) => w.files.has(p) ? Promise.resolve({ data: new Blob([w.files.get(p)!]), error: null }) : Promise.resolve({ data: null, error: { message: "nf" } }),
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
  return { db, anon, salt: "salt", code: () => "123456", sms: (to, message) => (w.sms.push({ to, message }), Promise.resolve(true)) };
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
  assertEquals(ok.body, { ok: true, sentTo: "+2547*****678" });
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
});

const png = (width: number, height: number) => {
  const be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...be(13), 0x49, 0x48, 0x44, 0x52, ...be(width), ...be(height), 8, 6, 0, 0, 0]);
};

Deno.test("media-finalize: ownership, real type, limits and cleanup", async () => {
  const w = world();
  const h = sellerMediaFinalize(deps(w));
  const good = "b1/items/a.png";
  const itemId = "11111111-1111-4111-8111-111111111111";
  w.tables.items = [{ id: itemId, business_id: "b1" }, { id: "22222222-2222-4222-8222-222222222222", business_id: "other" }];

  assertEquals((await h(post({ itemId, path: good }))).status, 401);
  const foreign = await read(await h(authed({ itemId, path: "other/items/a.png" })));
  assertEquals(foreign.status, 403);
  assertEquals((await h(authed({ itemId, path: "b1/../other/x.png" }))).status, 403);
  assertEquals(w.removed, []);

  const otherItem = await read(await h(authed({ itemId: "22222222-2222-4222-8222-222222222222", path: good })));
  assertEquals(otherItem.status, 404);
  assertEquals(w.removed, [good]);
  w.removed.length = 0;

  assertEquals((await read(await h(authed({ itemId, path: good })))).status, 404);

  w.files.set("b1/items/fake.png", new TextEncoder().encode("<svg onload=alert(1)></svg> not an image"));
  const fake = await read(await h(authed({ itemId, path: "b1/items/fake.png" })));
  assertEquals([fake.status, fake.body.error], [422, "unsupported_type"]);
  assertEquals(w.removed, ["b1/items/fake.png"]);
  w.removed.length = 0;

  w.files.set("b1/items/tiny.png", png(50, 50));
  assertEquals((await read(await h(authed({ itemId, path: "b1/items/tiny.png" })))).body.error, "too_small");
  assertEquals(w.removed, ["b1/items/tiny.png"]);
  w.removed.length = 0;

  w.files.set(good, png(800, 600));
  w.rpcResults["attach_item_media"] = () => ({ data: null, error: { message: "limit_reached:item_media" } });
  const full = await read(await h(authed({ itemId, path: good })));
  assertEquals([full.status, full.body.error], [409, "limit_reached"]);
  assertEquals(w.removed, [good]);
  w.removed.length = 0;

  w.rpcResults["attach_item_media"] = () => ({ data: null, error: { message: "boom" } });
  assertEquals((await read(await h(authed({ itemId, path: good })))).status, 500);
  assertEquals(w.removed, [good]);
  w.removed.length = 0;

  w.rpcResults["attach_item_media"] = () => ({ data: "media-1", error: null });
  const ok = await read(await h(authed({ itemId, path: good })));
  assertEquals(ok.status, 201);
  assertEquals(ok.body, { id: "media-1", kind: "image", width: 800, height: 600, durationSec: null, size: png(800, 600).length });
  assertEquals(w.removed, []);
  const call = w.rpcCalls.filter((c) => c.name === "attach_item_media").at(-1)!.args;
  assertEquals([call.p_kind, call.p_mime, call.p_path, call.p_item], ["image", "image/png", good, itemId]);

  w.tables.item_media.push({ id: "m", path: good });
  assertEquals((await read(await h(authed({ itemId, path: good })))).status, 409);
  assertEquals(w.removed, []);
});

Deno.test("export-data: own rows only, no secrets, rate limited", async () => {
  const w = world();
  w.tables.businesses[0] = { ...BIZ, application_id: "app-1", tagline: "hi" };
  w.tables.seller_otps = [{ business_id: "b1", code_hash: "x" }];
  w.tables.messages = [{ id: "m1", business_id: "b1", subject: "Hello" }, { id: "m2", business_id: "other", subject: "No" }];
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
  const saved = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "APP_ENV", "AT_API_KEY", "AT_USERNAME", "AT_SENDER"].map((k) => [k, Deno.env.get(k)] as const);
  const realFetch = globalThis.fetch;
  const sent: { url: string; body: string }[] = [];
  globalThis.fetch = ((url: string, init: any) => (sent.push({ url: String(url), body: String(init?.body) }), Promise.resolve(new Response("{}", { status: 201 })))) as any;
  try {
    set("SUPABASE_URL", "http://localhost:54321");
    set("SUPABASE_SERVICE_ROLE_KEY", "service");
    set("SUPABASE_ANON_KEY", "anon");
    set("AT_API_KEY", "k");
    set("AT_USERNAME", "sandbox");
    set("AT_SENDER", "EpicMKT");
    set("APP_ENV", "development");
    const dev = realDeps();
    assertEquals(dev.code(), "123456");
    assertEquals(await dev.sms("+254712345678", "Your EpicMKT code is 123456."), true);
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
