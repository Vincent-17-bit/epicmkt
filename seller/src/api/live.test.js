// The live adapter run against a fake Supabase client. No network and no real project: these tests pin down what the
// adapter sends (function names, argument names, table queries) and how it maps replies and errors, and check the
// names against the SQL migrations and edge functions in this repo so a rename on either side fails here.
import { describe, test, expect, beforeEach, vi } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const holder = vi.hoisted(() => ({ client: null }));
vi.mock("./client.js", () => ({ get supabase() { return holder.client; } }));

import * as live from "./live.js";
import { SELLER_API } from "./contract.js";
import { ApiError } from "./errors.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");

// A chainable query builder that is awaitable, like supabase-js: every method returns the builder, awaiting gives { data, error, count }.
function builder(table, result, log) {
  const calls = [];
  const b = new Proxy({}, {
    get(_t, prop) {
      if (prop === "then") return (res, rej) => Promise.resolve(result).then(res, rej);
      return (...args) => { calls.push([prop, ...args]); return b; };
    },
  });
  log.push({ table, calls });
  return b;
}

function makeClient({ tables = {}, rpcs = {}, fns = {}, setSessionError = null, uploadError = null } = {}) {
  const log = { rpc: [], invoke: [], from: [], uploads: [], channels: [], removed: [], session: [], signedOut: 0 };
  const channel = { handlers: [], subscribed: false, on(type, filter, cb) { this.handlers.push({ type, filter, cb }); return this; }, subscribe() { this.subscribed = true; return this; } };
  const client = {
    rpc: async (name, args) => { log.rpc.push({ name, args }); const r = rpcs[name]; return typeof r === "function" ? r(args) : (r ?? { data: null, error: null }); },
    functions: { invoke: async (name, { body }) => { log.invoke.push({ name, body }); const r = fns[name]; return typeof r === "function" ? r(body) : (r ?? { data: {}, error: null }); } },
    from: (table) => { const r = tables[table]; return builder(table, typeof r === "function" ? r() : (r ?? { data: [], error: null }), log.from); },
    auth: {
      setSession: async (s) => { log.session.push(s); return { error: setSessionError }; },
      signOut: async () => { log.signedOut += 1; return { error: null }; },
    },
    storage: { from: (bucket) => ({ uploadToSignedUrl: async (path, token, file, opts) => { log.uploads.push({ bucket, path, token, file, opts }); return { error: uploadError }; } }) },
    channel: (name) => { log.channels.push(name); return channel; },
    removeChannel: (c) => { log.removed.push(c); },
  };
  return { client, log, channel };
}

// An edge-function failure the way supabase-js reports it: error.context is the fetch Response.
const fnError = (status, payload) => ({ data: null, error: { context: { status, json: async () => payload } } });

const use = (opts) => { const f = makeClient(opts); holder.client = f.client; return f; };
beforeEach(() => { holder.client = null; });

describe("not configured", () => {
  test.each([
    ["an edge function", () => live.exportData()],
    ["an rpc", () => live.pauseListing(true)],
    ["a table read", () => live.listPayments()],
    ["logout", () => live.logout()],
  ])("%s says the portal is not configured", async (_n, call) => {
    await expect(call()).rejects.toMatchObject({ code: "not_configured" });
  });
});

describe("edge-function calls", () => {
  test("login stores the session the function returns and reports its expiry", async () => {
    const f = use({ fns: { "seller-login": { data: { session: { access_token: "a", refresh_token: "r", expires_at: 1790000000 } }, error: null } } });
    await expect(live.login("ES100001", "pw")).resolves.toEqual({ expiresAt: 1790000000 });
    expect(f.log.invoke).toEqual([{ name: "seller-login", body: { sellerId: "ES100001", password: "pw" } }]);
    expect(f.log.session).toEqual([{ access_token: "a", refresh_token: "r" }]);
  });

  test("login fails with session_failed when the client rejects the session", async () => {
    use({ fns: { "seller-login": { data: { session: { access_token: "a", refresh_token: "r", expires_at: 1 } }, error: null } }, setSessionError: { message: "bad" } });
    await expect(live.login("ES100001", "pw")).rejects.toMatchObject({ code: "session_failed" });
  });

  test("an edge-function error becomes an ApiError with the code, status, retryAfter and problems from the body", async () => {
    use({ fns: { "seller-login": fnError(429, { error: "locked", message: "Try later", retryAfter: 900, problems: ["x"] }) } });
    const err = await live.login("ES100001", "pw").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: "locked", message: "Try later", status: 429, retryAfter: 900, problems: ["x"] });
  });

  test("an error with an unreadable body falls back to request_failed", async () => {
    use({ fns: { "seller-export-data": { data: null, error: { context: { status: 500, json: async () => { throw new Error("not json"); } } } } } });
    await expect(live.exportData()).rejects.toMatchObject({ code: "request_failed", status: 500 });
  });

  test.each([
    ["forgotRequest", () => live.forgotRequest("ES1"), "seller-forgot-request", { sellerId: "ES1" }],
    ["forgotVerify", () => live.forgotVerify({ sellerId: "ES1", code: "123456", newPassword: "N" }), "seller-forgot-verify", { sellerId: "ES1", code: "123456", newPassword: "N" }],
    ["requestOtp", () => live.requestOtp(), "seller-otp-request", { purpose: "change_password" }],
    ["changePassword", () => live.changePassword({ code: "123456", newPassword: "N" }), "seller-change-password", { code: "123456", newPassword: "N" }],
    ["finalizeMedia", () => live.finalizeMedia({ itemId: "i1", path: "p/1.jpg" }), "seller-media-finalize", { itemId: "i1", path: "p/1.jpg" }],
    ["exportData", () => live.exportData(), "seller-export-data", {}],
  ])("%s calls %s with the documented body", async (_n, call, name, body) => {
    const f = use();
    await call();
    expect(f.log.invoke).toEqual([{ name, body }]);
  });

  test("logout signs out of the client", async () => {
    const f = use();
    await live.logout();
    expect(f.log.signedOut).toBe(1);
  });
});

describe("rpc calls", () => {
  test.each([
    ["updateProfile", () => live.updateProfile({ tagline: "x" }), "seller_update_profile", { p_patch: { tagline: "x" } }],
    ["cancelChange", () => live.cancelChange("c1"), "seller_cancel_change", { p_id: "c1" }],
    ["confirmPrices", () => live.confirmPrices(), "seller_confirm_prices", undefined],
    ["markRead (all)", () => live.markRead(), "seller_mark_read", { p_ids: null }],
    ["markRead (some)", () => live.markRead(["m1"]), "seller_mark_read", { p_ids: ["m1"] }],
    ["pauseListing", () => live.pauseListing(true), "seller_pause_listing", { p_pause: true }],
    ["requestDeletion", () => live.requestDeletion("Mama Shop"), "seller_request_deletion", { p_name: "Mama Shop" }],
    ["catalogStats default", () => live.catalogStats(), "seller_catalog_stats", { p_stale_days: 90 }],
    ["catalogStats custom", () => live.catalogStats(30), "seller_catalog_stats", { p_stale_days: 30 }],
    ["itemSignals", () => live.itemSignals(), "seller_item_signals", undefined],
    ["quoteCategoryChange", () => live.quoteCategoryChange("cat-1"), "seller_quote_category_change", { p_category: "cat-1" }],
    ["saveException", () => live.saveException({ date: "2026-12-25", kind: "closed" }), "seller_save_exception", { p_id: null, p_date: "2026-12-25", p_kind: "closed", p_intervals: [], p_note: null }],
    ["saveException (special)", () => live.saveException({ id: "e1", date: "2026-12-31", kind: "special", intervals: [["09:00", "13:00"]], note: "Half day" }), "seller_save_exception", { p_id: "e1", p_date: "2026-12-31", p_kind: "special", p_intervals: [["09:00", "13:00"]], p_note: "Half day" }],
    ["deleteException", () => live.deleteException("e1"), "seller_delete_exception", { p_id: "e1" }],
  ])("%s calls %s", async (_n, call, name, args) => {
    const f = use();
    await call();
    expect(f.log.rpc).toHaveLength(1);
    expect(f.log.rpc[0].name).toBe(name);
    if (args !== undefined) expect(f.log.rpc[0].args).toEqual(args);
  });

  test("an rpc error keeps the part of the message before the first colon as the code", async () => {
    use({ rpcs: { seller_pause_listing: { data: null, error: { message: "invalid_status: listing is not live" } } } });
    await expect(live.pauseListing(true)).rejects.toMatchObject({ code: "invalid_status", message: "invalid_status: listing is not live" });
  });

  test("an rpc error with no message becomes request_failed", async () => {
    use({ rpcs: { seller_pause_listing: { data: null, error: {} } } });
    await expect(live.pauseListing(true)).rejects.toMatchObject({ code: "request_failed" });
  });

  test("requestChange shapes the row the function returns", async () => {
    const f = use({ rpcs: { seller_request_change: { data: { id: "c1", field: "town", old_value: "Maseno", new_value: "Kisumu", status: "pending", extra_due_kes: 200, created_at: "2026-10-16T10:00:00Z" }, error: null } } });
    const c = await live.requestChange("town", "Kisumu");
    expect(f.log.rpc[0]).toEqual({ name: "seller_request_change", args: { p_field: "town", p_value: "Kisumu" } });
    expect(c).toMatchObject({ id: "c1", field: "town", oldValue: "Maseno", newValue: "Kisumu", status: "pending", extraDue: 200, appliesFromNextRenewal: true });
  });

  test("replyFlag validates locally and never calls the server for a bad reply", async () => {
    const f = use();
    await expect(live.replyFlag("f1", "")).rejects.toBeInstanceOf(ApiError);
    expect(f.log.rpc).toHaveLength(0);
  });

  test("replyFlag sends a good reply", async () => {
    const f = use();
    await live.replyFlag("f1", "Prices were updated on Monday.");
    expect(f.log.rpc).toEqual([{ name: "seller_reply_flag", args: { p_flag: "f1", p_reply: "Prices were updated on Monday." } }]);
  });

  test("getPaymentInstructions and submitPayment send the defaults as null and shape the reply", async () => {
    const f = use({
      rpcs: {
        seller_payment_instructions: { data: { purpose: "renewal", amount_kes: 500, account: "ES100001", plan_key: "standard", category_id: "c1", listing_state: "live", configured: 1 }, error: null },
        seller_submit_payment: { data: { id: "p1", business_id: "b1", amount_kes: 500, kind: "renewal", status: "submitted", mpesa_code: "QWE123", created_at: "2026-10-16T10:00:00Z" }, error: null },
      },
    });
    const ins = await live.getPaymentInstructions();
    expect(ins).toMatchObject({ purpose: "renewal", amount: 500, account: "ES100001", configured: true, hasOpenSubmission: false, quote: null });
    const pay = await live.submitPayment({ code: "QWE123" });
    expect(pay).toMatchObject({ id: "p1", amount: 500, status: "submitted", mpesaCode: "QWE123", receiptNo: null });
    expect(f.log.rpc).toEqual([
      { name: "seller_payment_instructions", args: { p_purpose: null, p_target_plan: null, p_category: null } },
      { name: "seller_submit_payment", args: { p_code: "QWE123", p_purpose: null, p_target_plan: null, p_category: null, p_change_id: null } },
    ]);
  });
});

describe("table reads", () => {
  test("listPayments reads newest first, capped at 200, and shapes each row", async () => {
    const f = use({ tables: { payments: { data: [{ id: "p1", business_id: "b1", amount_kes: 500, kind: "renewal", status: "confirmed", receipt_no: "RCT-000001", created_at: "2026-10-01T00:00:00Z" }], error: null } } });
    const rows = await live.listPayments();
    expect(rows).toEqual([expect.objectContaining({ id: "p1", amount: 500, receiptNo: "RCT-000001" })]);
    expect(f.log.from[0].table).toBe("payments");
    expect(f.log.from[0].calls).toContainEqual(["order", "created_at", { ascending: false }]);
    expect(f.log.from[0].calls).toContainEqual(["limit", 200]);
  });

  test("a table error is mapped like an rpc error", async () => {
    use({ tables: { payments: { data: null, error: { message: "permission_denied: rls" } } } });
    await expect(live.listPayments()).rejects.toMatchObject({ code: "permission_denied" });
  });

  test("listMessages filters by kind only when kinds are given", async () => {
    const f = use({ tables: { messages: { data: [{ id: "m1", kind: "system", subject: "s", body: "b", created_at: "2026-10-01T00:00:00Z" }], error: null } } });
    await live.listMessages();
    await live.listMessages({ kinds: ["system", "billing"] });
    expect(f.log.from[0].calls.some(([m]) => m === "in")).toBe(false);
    expect(f.log.from[1].calls).toContainEqual(["in", "kind", ["system", "billing"]]);
  });

  test("unreadCount counts unread rows and returns 0 for a null count", async () => {
    use({ tables: { messages: { data: null, error: null, count: 7 } } });
    await expect(live.unreadCount()).resolves.toBe(7);
    use({ tables: { messages: { data: null, error: null, count: null } } });
    await expect(live.unreadCount()).resolves.toBe(0);
    use({ tables: { messages: { data: null, error: { message: "boom" }, count: null } } });
    await expect(live.unreadCount()).rejects.toMatchObject({ code: "request_failed", message: "boom" });
  });

  test("listExceptions returns the exceptions of the seller's business, or an empty list", async () => {
    use({ tables: { businesses: { data: { exceptions: [{ id: "e1", date: "2026-12-25", kind: "closed", intervals: [], note: null }] }, error: null } } });
    await expect(live.listExceptions()).resolves.toHaveLength(1);
    use({ tables: { businesses: { data: null, error: null } } });
    await expect(live.listExceptions()).resolves.toEqual([]);
  });

  test("getSubscription fails with not_a_seller when RLS returns no business", async () => {
    use({ tables: { businesses: { data: null, error: null } } });
    await expect(live.getSubscription()).rejects.toMatchObject({ code: "not_a_seller" });
  });

  const business = { id: "b1", seller_id: "ES100001", name: "Mama Shop", status: "live", plan_key: "standard", category_id: "c1", paid_until: "2026-11-01T00:00:00Z", verification_level: 1 };
  const subscriptionTables = {
    businesses: { data: business, error: null },
    categories: { data: { id: "c1", name: "Groceries" }, error: null },
    plans: { data: [{ plan_key: "standard", price_kes: 500, items_limit: 50, top_benefits: [], features: {} }], error: null },
    global_limits: { data: { standard: { items: 50 }, premium: { items: 500 } }, error: null },
  };

  test("getSubscription joins the business, its category, plans and global limits", async () => {
    use({ tables: subscriptionTables });
    const sub = await live.getSubscription();
    expect(sub.business).toMatchObject({ sellerId: "ES100001", categoryName: "Groceries", planKey: "standard" });
    expect(sub.plans.standard).toMatchObject({ price: 500, itemsLimit: 50 });
    expect(sub.limits).toEqual({ standard: { items: 50 }, premium: { items: 500 } });
  });

  test("getReceipt only returns confirmed payments", async () => {
    use({ tables: { ...subscriptionTables, payments: { data: { id: "p1", status: "submitted", category_id: "c1", created_at: "x" }, error: null } } });
    await expect(live.getReceipt("p1")).rejects.toMatchObject({ code: "receipt_not_found" });
    use({ tables: { ...subscriptionTables, payments: { data: null, error: null } } });
    await expect(live.getReceipt("p1")).rejects.toMatchObject({ code: "receipt_not_found" });
  });

  test("getReceipt returns the payment with the business and category of a confirmed one", async () => {
    use({ tables: { ...subscriptionTables, payments: { data: { id: "p1", status: "confirmed", category_id: "c1", receipt_no: "RCT-000001", created_at: "x" }, error: null } } });
    const r = await live.getReceipt("p1");
    expect(r.payment).toMatchObject({ id: "p1", receiptNo: "RCT-000001" });
    expect(r.business.sellerId).toBe("ES100001");
    expect(r.categoryName).toBe("Groceries");
  });

  test("listCategoryPlans groups plan prices under each category", async () => {
    use({ tables: {
      categories: { data: [{ id: "c1", name: "Groceries", grp: "Food" }, { id: "c2", name: "Salons", grp: "Beauty" }], error: null },
      plans: { data: [{ category_id: "c1", plan_key: "standard", price_kes: 500 }, { category_id: "c1", plan_key: "premium", price_kes: 1500 }], error: null },
    } });
    await expect(live.listCategoryPlans()).resolves.toEqual([
      { id: "c1", name: "Groceries", group: "Food", prices: { standard: 500, premium: 1500 } },
      { id: "c2", name: "Salons", group: "Beauty", prices: {} },
    ]);
  });

  test("listQuestions returns [] without further queries when there are no flags", async () => {
    const f = use({ tables: { flags: { data: [], error: null } } });
    await expect(live.listQuestions()).resolves.toEqual([]);
    expect(f.log.from.map((q) => q.table)).toEqual(["flags"]);
  });

  test("listQuestions attaches the item, faq and ready attachments to each flag", async () => {
    use({ tables: {
      flags: { data: [{ id: "f1", seller_message: "Is the price right?", status: "open", item_id: "i1", faq_id: null, created_at: "2026-10-01T00:00:00Z" }, { id: "f2", seller_message: "FAQ wrong", status: "open", item_id: null, faq_id: "q1", created_at: "2026-10-02T00:00:00Z" }], error: null },
      items: { data: [{ id: "i1", name: "Maize flour" }], error: null },
      faqs: { data: [{ id: "q1", question: "Do you deliver?" }], error: null },
      flag_attachments: { data: [{ id: "a1", flag_id: "f1", original_name: "receipt.jpg", mime: "image/jpeg", size_bytes: 1200, status: "ready" }], error: null },
    } });
    const [one, two] = await live.listQuestions();
    expect(one).toMatchObject({ id: "f1", item: { id: "i1", name: "Maize flour" }, faq: null, attachments: [{ id: "a1", name: "receipt.jpg", size: 1200 }] });
    expect(two).toMatchObject({ id: "f2", item: null, faq: { id: "q1", question: "Do you deliver?" }, attachments: [] });
  });
});

describe("uploadProofs", () => {
  const file = (name, size, type) => ({ name, size, type });

  test("asks for signed URLs, uploads each file to the proofs bucket, then finalizes", async () => {
    const f = use({ fns: {
      "seller-proof-upload-url": { data: { uploads: [{ path: "f1/a.jpg", token: "t1", attachmentId: "a1" }, { path: "f1/b.png", token: "t2", attachmentId: "a2" }] }, error: null },
      "seller-proof-finalize": { data: { attachments: [{ id: "a1" }, { id: "a2" }] }, error: null },
    } });
    const files = [file("a.jpg", 1000, "image/jpeg"), file("b.png", 2000, "image/png")];
    const out = await live.uploadProofs("f1", files);
    expect(out).toEqual([{ id: "a1" }, { id: "a2" }]);
    expect(f.log.invoke.map((c) => c.name)).toEqual(["seller-proof-upload-url", "seller-proof-finalize"]);
    expect(f.log.invoke[0].body).toEqual({ flagId: "f1", files: [{ name: "a.jpg", size: 1000, type: "image/jpeg" }, { name: "b.png", size: 2000, type: "image/png" }] });
    expect(f.log.uploads.map((u) => [u.bucket, u.path, u.token, u.opts])).toEqual([
      ["seller-proofs", "f1/a.jpg", "t1", { contentType: "image/jpeg" }],
      ["seller-proofs", "f1/b.png", "t2", { contentType: "image/png" }],
    ]);
    expect(f.log.invoke[1].body).toEqual({ flagId: "f1", attachmentIds: ["a1", "a2"] });
  });

  test("an invalid batch is rejected locally before any network call", async () => {
    const f = use();
    const err = await live.uploadProofs("f1", [file("virus.exe", 1000, "application/x-msdownload")]).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(f.log.invoke).toHaveLength(0);
    expect(f.log.uploads).toHaveLength(0);
  });

  test("a failed storage upload stops with file_not_uploaded and never finalizes", async () => {
    const f = use({
      fns: { "seller-proof-upload-url": { data: { uploads: [{ path: "f1/a.jpg", token: "t1", attachmentId: "a1" }] }, error: null } },
      uploadError: { message: "storage down" },
    });
    await expect(live.uploadProofs("f1", [file("a.jpg", 1000, "image/jpeg")])).rejects.toMatchObject({ code: "file_not_uploaded" });
    expect(f.log.invoke.map((c) => c.name)).toEqual(["seller-proof-upload-url"]);
  });
});

describe("subscribe", () => {
  test("listens to each requested table and delivers the new row, or the old row for a delete", () => {
    const f = use();
    const events = [];
    const off = live.subscribe(["payments", "messages"], (e) => events.push(e));
    expect(f.log.channels).toHaveLength(1);
    expect(f.channel.subscribed).toBe(true);
    expect(f.channel.handlers.map((h) => h.filter.table)).toEqual(["payments", "messages"]);
    f.channel.handlers[0].cb({ eventType: "UPDATE", new: { id: "p1" }, old: { id: "p1-old" } });
    f.channel.handlers[1].cb({ eventType: "DELETE", new: {}, old: { id: "m1" } });
    expect(events).toEqual([{ table: "payments", type: "UPDATE", row: { id: "p1" } }, { table: "messages", type: "DELETE", row: { id: "m1" } }]);
    off();
    expect(f.log.removed).toEqual([f.channel]);
  });

  test("defaults to every seller table and ignores tables a seller must not subscribe to", () => {
    const f = use();
    live.subscribe(null, () => {});
    expect(f.channel.handlers.map((h) => h.filter.table)).toEqual(["payments", "businesses", "messages", "flags", "flag_attachments"]);
    const g = use();
    live.subscribe(["payments", "admins", "audit_log"], () => {});
    expect(g.channel.handlers.map((h) => h.filter.table)).toEqual(["payments"]);
  });
});

// The adapter and the database are written separately, so check each name and argument the adapter uses against the SQL and the functions folder.
describe("the adapter matches the database and edge functions in this repo", () => {
  const source = readFileSync(join(here, "live.js"), "utf8");
  const sql = readdirSync(join(root, "supabase/migrations")).sort().map((f) => readFileSync(join(root, "supabase/migrations", f), "utf8")).join("\n");

  const signatures = new Map();
  for (const m of sql.matchAll(/create (?:or replace )?function public\.(\w+)\(([^)]*)\)/gi)) {
    signatures.set(m[1], m[2].split(",").map((a) => a.trim().split(/\s+/)[0]).filter(Boolean));
  }

  test("every rpc the adapter calls exists in the migrations", () => {
    const used = [...new Set([...source.matchAll(/rpc\("(\w+)"/g)].map((m) => m[1]))];
    expect(used.length).toBeGreaterThanOrEqual(15);
    for (const name of used) expect(signatures.has(name), `public.${name}`).toBe(true);
  });

  test("every argument the adapter passes to an rpc is a parameter of that function", () => {
    for (const m of source.matchAll(/rpc\("(\w+)", \{([^}]*)\}\)/g)) {
      const params = signatures.get(m[1]);
      const passed = [...m[2].matchAll(/\b(p_\w+)\s*:/g)].map((a) => a[1]);
      for (const p of passed) expect(params, `${m[1]} takes ${p}`).toContain(p);
    }
  });

  test("every table the adapter reads exists in the migrations", () => {
    const used = [...new Set([...source.matchAll(/from\("(\w+)"\)/g)].map((m) => m[1]))];
    for (const t of used) expect(new RegExp(`create table (if not exists )?(public\\.)?${t}\\b`, "i").test(sql), `table ${t}`).toBe(true);
  });

  test("every edge function the adapter invokes has a folder under supabase/functions", () => {
    const used = [...new Set([...source.matchAll(/fn\("([\w-]+)"/g)].map((m) => m[1]))];
    expect(used.length).toBeGreaterThan(5);
    for (const name of used) expect(existsSync(join(root, "supabase/functions", name, "index.ts")), name).toBe(true);
  });

  test("every function in the seller contract is exported by the live adapter", () => {
    for (const name of SELLER_API) expect(typeof live[name], name).toBe("function");
  });
});
