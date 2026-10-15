import { beforeEach, describe, expect, it, vi } from "vitest";
import * as mock from "./mock.js";
import * as live from "./live.js";
import { createLiveApi } from "./live.js";
import { ApiError } from "./errors.js";
import { buildSearchFilter, cleanTerm, normalizeListParams } from "./query.js";
import { RESOURCES } from "./resources.js";
import { buildBrief } from "./shape.js";

const NOW = Date.parse("2026-10-15T09:00:00Z");

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _map: m };
}

const OWNER = { email: "owner@epicmkt.test", password: "Demo-Passw0rd" };

async function signedIn() {
  await mock.auth.signIn(OWNER);
}

beforeEach(() => {
  mock.configureMock({ latency: 0, storage: memStorage(), now: () => NOW });
  mock.resetMock();
});

describe("live and mock expose the same API", () => {
  const SHARED = ["auth", "adminCounts", "adminSearch", "list", "get", "getAdminCounts", "getApplications", "getBusinesses", "getPayments"];

  it("export the same names", () => {
    for (const name of SHARED) {
      expect(mock[name], `mock.${name}`).toBeDefined();
      expect(live[name], `live.${name}`).toBeDefined();
    }
    const extras = new Set(["configureMock", "resetMock", "DEMO_ACCOUNTS", "createLiveApi"]);
    const unexpected = [...Object.keys(mock), ...Object.keys(live)].filter((n) => !SHARED.includes(n) && !extras.has(n));
    expect(unexpected).toEqual([]);
  });

  it("have the same arity for every function", () => {
    for (const name of SHARED.filter((n) => n !== "auth")) expect(live[name].length, name).toBe(mock[name].length);
    expect(Object.keys(live.auth).sort()).toEqual(Object.keys(mock.auth).sort());
    for (const name of Object.keys(mock.auth)) expect(live.auth[name].length, `auth.${name}`).toBe(mock.auth[name].length);
  });
});

describe("query helpers", () => {
  it("removes characters that could change a PostgREST filter", () => {
    expect(cleanTerm('a,b)(c"d\\e%f*g')).toBe("a b c d e f g");
    expect(buildSearchFilter(["name", "slug"], "x),id.eq.1")).toBe("name.ilike.*x id.eq.1*,slug.ilike.*x id.eq.1*");
    expect(buildSearchFilter(["name"], " , ")).toBe("");
  });

  it("clamps paging and rejects unknown filters, values and sort columns", () => {
    const def = RESOURCES.businesses;
    expect(normalizeListParams(def, { page: -3, pageSize: 5000 })).toMatchObject({ page: 1, pageSize: 100 });
    expect(() => normalizeListParams(def, { filters: { owner_id_number: "1" } })).toThrow(/Cannot filter/);
    expect(() => normalizeListParams(def, { filters: { status: "bogus" } })).toThrow(ApiError);
    expect(() => normalizeListParams(def, { filters: { featured: "yes" } })).toThrow(ApiError);
    expect(() => normalizeListParams(def, { sort: { column: "phone", direction: "asc" } })).toThrow(ApiError);
    expect(() => normalizeListParams(def, { sort: { column: "name", direction: "sideways" } })).toThrow(ApiError);
  });

  it("writes the brief in plain words", () => {
    expect(buildBrief({ applicationsWaiting: 4, unconfirmedPayments: 2, expiringSoon: 6 })).toBe(
      "4 applications are waiting, 2 payments need confirming and 6 sellers expire this week",
    );
    expect(buildBrief({ applicationsWaiting: 1 })).toBe("1 application is waiting");
    expect(buildBrief({ unconfirmedPayments: 1, expiringSoon: 1 })).toBe("1 payment needs confirming and 1 seller expires this week");
    expect(buildBrief({})).toBe("Nothing needs your attention right now");
  });
});

describe("mock auth", () => {
  it("rejects every call until someone signs in", async () => {
    await expect(mock.adminCounts()).rejects.toMatchObject({ code: "unauthorized" });
    await expect(mock.list("businesses")).rejects.toMatchObject({ code: "unauthorized" });
    await expect(mock.get("businesses", "x")).rejects.toMatchObject({ code: "unauthorized" });
    await expect(mock.adminSearch("kisumu")).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("signs in, reports the session and notifies listeners", async () => {
    const seen = [];
    const off = mock.auth.onChange((s) => seen.push(s?.user.role ?? null));
    const session = await mock.auth.signIn({ email: " OWNER@epicmkt.test ", password: OWNER.password });
    expect(session.user).toMatchObject({ email: "owner@epicmkt.test", role: "owner" });
    expect(await mock.auth.getSession()).toMatchObject({ user: { role: "owner" } });
    await mock.auth.signOut();
    expect(await mock.auth.getSession()).toBeNull();
    off();
    await mock.auth.signIn(OWNER);
    expect(seen).toEqual(["owner", null]);
  });

  it("gives one message for a wrong email or a wrong password", async () => {
    const a = await mock.auth.signIn({ email: "nobody@epicmkt.test", password: OWNER.password }).catch((e) => e);
    const b = await mock.auth.signIn({ email: OWNER.email, password: "wrong" }).catch((e) => e);
    expect(a.code).toBe("invalid_credentials");
    expect(b.code).toBe("invalid_credentials");
    expect(a.message).toBe(b.message);
  });

  it("expires the session after eight hours", async () => {
    await signedIn();
    mock.configureMock({ now: () => NOW + 8 * 60 * 60 * 1000 + 1 });
    expect(await mock.auth.getSession()).toBeNull();
  });
});

describe("mock data", () => {
  beforeEach(signedIn);

  it("counts match the seed and the list endpoints", async () => {
    const counts = await mock.adminCounts();
    expect(counts).toMatchObject({ liveBusinesses: 16, applicationsWaiting: 5, unconfirmedPayments: 2, expiringSoon: 5 });
    expect(counts.brief).toBe("5 applications are waiting, 2 payments need confirming and 5 sellers expire this week");

    const live = await mock.list("businesses", { filters: { status: "live" }, pageSize: 100 });
    expect(live.total).toBe(counts.liveBusinesses);
    const waiting = await mock.list("applications", { filters: { status: ["submitted", "under_review"] } });
    expect(waiting.total).toBe(counts.applicationsWaiting);
  });

  it("pages, sorts and filters", async () => {
    const first = await mock.list("businesses", { pageSize: 10, sort: { column: "name", direction: "asc" } });
    expect(first).toMatchObject({ total: 24, page: 1, pageSize: 10 });
    expect(first.rows).toHaveLength(10);
    const names = first.rows.map((r) => r.name);
    expect(names).toEqual([...names].sort());

    const last = await mock.list("businesses", { pageSize: 10, page: 3 });
    expect(last.rows).toHaveLength(4);
    const beyond = await mock.list("businesses", { pageSize: 10, page: 9 });
    expect(beyond.rows).toEqual([]);
    expect(beyond.total).toBe(24);

    const premiumKisumu = await mock.list("businesses", { filters: { plan_key: "premium", county: "Kisumu" }, pageSize: 100 });
    expect(premiumKisumu.rows.every((r) => r.plan_key === "premium" && r.county === "Kisumu")).toBe(true);
  });

  it("keeps null dates last in both directions", async () => {
    for (const direction of ["asc", "desc"]) {
      const { rows } = await mock.list("applications", { sort: { column: "submitted_at", direction }, pageSize: 100 });
      expect(rows[rows.length - 1].submitted_at).toBeNull();
    }
  });

  it("searches case-insensitively across a resource's fields", async () => {
    const byName = await mock.list("businesses", { query: "LAKEVIEW" });
    expect(byName.rows.map((r) => r.name)).toEqual(["Lakeview Hardware"]);
    const bySeller = await mock.list("businesses", { query: "es100003" });
    expect(bySeller.total).toBe(1);
  });

  it("groups search results and skips empty groups and short terms", async () => {
    const result = await mock.adminSearch("kijani");
    expect(result.groups.map((g) => g.kind)).toEqual(["applications"]);
    expect(result.groups[0].items[0]).toMatchObject({ title: "Kijani Greens", href: expect.stringMatching(/^\/admin\/applications\//) });
    expect(await mock.adminSearch("k")).toMatchObject({ total: 0, groups: [] });
    expect((await mock.adminSearch("hardware", { limit: 1 })).groups[0].items).toHaveLength(1);
  });

  it("gets one row, hides secrets and reports missing rows", async () => {
    const { rows } = await mock.list("applications", { pageSize: 1 });
    const row = await mock.get("applications", rows[0].id);
    expect(row.reference_no).toBe(rows[0].reference_no);
    for (const secret of ["finalize_token_hash", "ip_hash", "user_agent"]) expect(row).not.toHaveProperty(secret);
    await expect(mock.get("applications", "nope")).rejects.toMatchObject({ code: "not_found" });
    await expect(mock.get("secrets", "1")).rejects.toMatchObject({ code: "invalid_resource" });
    await expect(mock.list("businesses", { filters: { bogus: 1 } })).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("keeps the data in storage and survives a reload", async () => {
    const storage = memStorage();
    mock.configureMock({ storage });
    mock.resetMock();
    await signedIn();
    const before = await mock.list("businesses", { pageSize: 100 });
    expect(JSON.parse(storage.getItem("epicmkt.admin.mock.data")).businesses).toHaveLength(24);

    vi.resetModules();
    const reloaded = await import("./mock.js");
    reloaded.configureMock({ latency: 0, storage, now: () => NOW });
    expect(await reloaded.auth.getSession()).toMatchObject({ user: { role: "owner" } });
    expect((await reloaded.list("businesses", { pageSize: 100 })).rows).toEqual(before.rows);
  });

  it("falls back to memory when storage is corrupt or blocked", async () => {
    const broken = { getItem: () => "{not json", setItem: () => { throw new Error("blocked"); }, removeItem: () => {} };
    mock.configureMock({ storage: broken });
    mock.resetMock();
    await expect(mock.auth.signIn(OWNER)).resolves.toBeDefined();
  });

  it("serves the deprecated placeholder getters without a session", async () => {
    await mock.auth.signOut();
    expect((await mock.getAdminCounts()).liveBusinesses).toBe(16);
    expect((await mock.getApplications())[0]).toEqual(expect.objectContaining({ reference: expect.any(String), businessName: expect.any(String) }));
    expect((await mock.getBusinesses())[0]).toEqual(expect.objectContaining({ name: expect.any(String), plan: expect.any(String) }));
    expect((await mock.getPayments())[0]).toEqual(expect.objectContaining({ receipt: expect.any(String), amount: expect.any(Number) }));
  });
});

// A minimal stand-in for the supabase-js query builder that records what was asked.
function fakeClient({ tables = {}, authApi = {} } = {}) {
  const queries = [];
  return {
    queries,
    from(table) {
      const q = { table, ops: [] };
      queries.push(q);
      const builder = new Proxy(
        {},
        {
          get(_, op) {
            if (op === "then") {
              const result = tables[table]?.(q) ?? { data: [], count: 0, error: null };
              return (resolve, reject) => Promise.resolve(result).then(resolve, reject);
            }
            return (...args) => {
              q.ops.push([op, ...args]);
              return builder;
            };
          },
        },
      );
      return builder;
    },
    auth: authApi,
  };
}

const ops = (q, name) => q.ops.filter((o) => o[0] === name).map((o) => o.slice(1));

describe("live API query building", () => {
  it("builds a filtered, searched, sorted and paged list query", async () => {
    const client = fakeClient({ tables: { businesses: () => ({ data: [{ id: "1" }], count: 41, error: null }) } });
    const api = createLiveApi(() => client);
    const result = await api.list("businesses", {
      page: 2,
      pageSize: 10,
      query: "mart,id.eq.1",
      filters: { status: ["live", "paused"], town: "Kisumu" },
      sort: { column: "name", direction: "asc" },
    });
    expect(result).toEqual({ rows: [{ id: "1" }], total: 41, page: 2, pageSize: 10 });
    const q = client.queries[0];
    expect(q.table).toBe("businesses");
    expect(ops(q, "select")[0][0]).not.toMatch(/\*/);
    expect(ops(q, "select")[0][1]).toEqual({ count: "exact" });
    expect(ops(q, "in")).toEqual([["status", ["live", "paused"]]]);
    expect(ops(q, "eq")).toEqual([["town", "Kisumu"]]);
    expect(ops(q, "or")[0][0]).toBe("name.ilike.*mart id.eq.1*,seller_id.ilike.*mart id.eq.1*,slug.ilike.*mart id.eq.1*,phone.ilike.*mart id.eq.1*");
    expect(ops(q, "order")).toEqual([["name", { ascending: true, nullsFirst: false }], ["id", { ascending: true }]]);
    expect(ops(q, "range")).toEqual([[10, 19]]);
  });

  it("never selects application secrets", async () => {
    const client = fakeClient();
    const api = createLiveApi(() => client);
    await api.list("applications");
    await api.get("applications", "x").catch(() => {});
    for (const q of client.queries) {
      const columns = ops(q, "select")[0][0];
      for (const secret of ["finalize_token_hash", "ip_hash", "user_agent"]) expect(columns).not.toContain(secret);
    }
  });

  it("reports the real total when the page is past the end", async () => {
    let calls = 0;
    const client = fakeClient({
      tables: {
        businesses: () => (++calls === 1 ? { data: null, count: null, error: { code: "PGRST103", message: "range" } } : { data: null, count: 7, error: null }),
      },
    });
    const api = createLiveApi(() => client);
    expect(await api.list("businesses", { page: 9, pageSize: 10 })).toEqual({ rows: [], total: 7, page: 9, pageSize: 10 });
  });

  it("maps database errors to ApiError codes", async () => {
    const make = (error) => createLiveApi(() => fakeClient({ tables: { businesses: () => ({ data: null, error }) } }));
    await expect(make({ code: "42501", message: "rls" }).list("businesses")).rejects.toMatchObject({ code: "forbidden" });
    await expect(make({ code: "PGRST301", message: "JWT expired" }).list("businesses")).rejects.toMatchObject({ code: "unauthorized" });
    await expect(make({ code: "XX000", message: "boom" }).list("businesses")).rejects.toMatchObject({ code: "unknown", message: expect.not.stringContaining("boom") });
  });

  it("gets one row or throws not_found", async () => {
    const found = createLiveApi(() => fakeClient({ tables: { businesses: () => ({ data: { id: "1", name: "A" }, error: null }) } }));
    expect(await found.get("businesses", "1")).toEqual({ id: "1", name: "A" });
    const missing = createLiveApi(() => fakeClient({ tables: { businesses: () => ({ data: null, error: null }) } }));
    await expect(missing.get("businesses", "2")).rejects.toMatchObject({ code: "not_found" });
    const badId = createLiveApi(() => fakeClient({ tables: { businesses: () => ({ data: null, error: { code: "22P02", message: "uuid" } }) } }));
    await expect(badId.get("businesses", "zzz")).rejects.toMatchObject({ code: "not_found" });
  });

  it("counts with head queries and the same rules as the mock", async () => {
    const client = fakeClient({
      tables: {
        businesses: (q) => ({ count: ops(q, "lte").length ? 5 : 16, error: null }),
        applications: (q) => ({ count: ops(q, "in").length ? 5 : 2, error: null }),
      },
    });
    const counts = await createLiveApi(() => client).adminCounts();
    expect(counts).toMatchObject({ liveBusinesses: 16, applicationsWaiting: 5, unconfirmedPayments: 2, expiringSoon: 5 });
    expect(counts.brief).toBe("5 applications are waiting, 2 payments need confirming and 5 sellers expire this week");
    for (const q of client.queries) expect(ops(q, "select")[0][1]).toEqual({ count: "exact", head: true });
  });

  it("searches every resource and skips short terms", async () => {
    const client = fakeClient({
      tables: { businesses: () => ({ data: [{ id: "b1", name: "Mart", seller_id: "ES1", town: "Kisumu", status: "live" }], error: null }) },
    });
    const api = createLiveApi(() => client);
    const result = await api.adminSearch("mart", { limit: 3 });
    expect(result.groups).toEqual([{ kind: "businesses", label: "Businesses", items: [expect.objectContaining({ id: "b1", href: "/admin/businesses/b1" })] }]);
    expect(client.queries.map((q) => q.table).sort()).toEqual(["applications", "businesses", "payments"]);
    expect(ops(client.queries[0], "limit")).toEqual([[3]]);
    const before = client.queries.length;
    expect(await api.adminSearch("m")).toMatchObject({ total: 0 });
    expect(client.queries.length).toBe(before);
  });
});

describe("live auth", () => {
  const user = { id: "u1", email: "boss@example.test" };
  const session = { user, expires_at: 2_000_000_000 };

  function authClient({ admin = true, signInError = null } = {}) {
    const signOut = vi.fn(async () => ({ error: null }));
    const client = fakeClient({
      tables: { admins: () => ({ data: admin ? { role: "finance", display_name: "Fin Ance" } : null, error: null }) },
      authApi: {
        signInWithPassword: vi.fn(async () => (signInError ? { data: null, error: signInError } : { data: { session }, error: null })),
        getSession: vi.fn(async () => ({ data: { session }, error: null })),
        signOut,
      },
    });
    return { client, signOut };
  }

  it("signs in an admin and reads the role from the admins table", async () => {
    const { client } = authClient();
    const s = await createLiveApi(() => client).auth.signIn({ email: " boss@example.test ", password: "pw" });
    expect(s).toEqual({ user: { id: "u1", email: "boss@example.test", displayName: "Fin Ance", role: "finance" }, expiresAt: 2_000_000_000_000 });
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({ email: "boss@example.test", password: "pw" });
  });

  it("signs out and throws not_admin when the person has no admin row", async () => {
    const { client, signOut } = authClient({ admin: false });
    await expect(createLiveApi(() => client).auth.signIn({ email: "a@b.test", password: "pw" })).rejects.toMatchObject({ code: "not_admin" });
    expect(signOut).toHaveBeenCalled();
    const { client: c2, signOut: out2 } = authClient({ admin: false });
    expect(await createLiveApi(() => c2).auth.getSession()).toBeNull();
    expect(out2).toHaveBeenCalled();
  });

  it("maps a rejected login to invalid_credentials", async () => {
    const { client } = authClient({ signInError: { status: 400, message: "Invalid login credentials" } });
    await expect(createLiveApi(() => client).auth.signIn({ email: "a@b.test", password: "x" })).rejects.toMatchObject({ code: "invalid_credentials" });
  });
});
