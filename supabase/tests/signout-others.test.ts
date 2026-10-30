import nodeAssert from "node:assert/strict";
import { sellerSignoutOthers } from "../functions/seller-signout-others/handler.ts";

const assertEquals = (a: unknown, b: unknown) => nodeAssert.deepStrictEqual(a, b);
for (const k of ["log", "info", "warn", "error", "debug"] as const) (console as any)[k] = () => {};

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const jwt = (claims: Record<string, unknown> = {}) => `${b64({ alg: "HS256" })}.${b64({ sub: "u1", ...claims })}.sig`;
const BIZ = { id: "b1", seller_id: "ES100001", phone: "+254712345678", name: "Shop A", status: "live", user_id: "u1" };
const post = (headers: Record<string, string> = {}) => new Request("http://x/", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: "{}" });

function fakeDb(opts: { users?: Map<string, any> } = {}) {
  const calls: { name: string; args: any }[] = [];
  const audits: any[] = [];
  const users = opts.users ?? new Map([[jwt({ session_id: "s1" }), { id: "u1" }], [jwt(), { id: "u1" }]]);
  const db: any = {
    rpc: (name: string, args: any) => {
      calls.push({ name, args });
      if (name === "hit_rate_limit") return Promise.resolve({ data: true, error: null });
      if (name === "revoke_user_sessions") return Promise.resolve({ data: 3, error: null });
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
