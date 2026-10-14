import { generateSellerId, makeTempPassword } from "../functions/_shared/ids.ts";
import type { AdminDeps } from "../functions/_shared/adminKit.ts";

export const APP_ID = "11111111-1111-4111-8111-111111111111";
export const APP2_ID = "22222222-2222-4222-8222-222222222222";
export const BIZ_ID = "33333333-3333-4333-8333-333333333333";
export const TOKENS = { owner: "tok-owner", reviewer: "tok-reviewer", finance: "tok-finance", support: "tok-support" } as const;

export type World = {
  tables: Record<string, any[]>;
  unique: Record<string, string[]>;
  authUsers: any[];
  counters: Map<string, number>;
  receiptSeq: number;
  sms: { to: string; message: string }[];
  mail: { to?: string; subject: string; html: string }[];
  now: Date;
};

const application = (id: string, over: Record<string, unknown> = {}) => ({
  id, reference_no: "EPM-2026-ABC234", status: "under_review", verification_level: "unverified",
  category_id: "salon", plan_key: "standard", price_at_submission: 500, plan_snapshot: {},
  owner_full_name: "Wanjiru Kamau", phone: "+254712345678", email: "wanjiru@example.com",
  business_name: "Mama Pima", registered: true, reg_type: "sole_proprietor", year_established: 2019,
  short_description: "Salon and spa", template_values: { hours: "8-6" }, conditional_docs: {},
  county: "Kisumu", town: "Kisumu", address: "Oginga Odinga St", lat: -0.09, lng: 34.76,
  business_phones: ["+254722000111"], whatsapp: "+254712345678", website: null, socials: {},
  payment_code: null, admin_note: null, review_started_at: null, ...over,
});

export function world(): World {
  return {
    tables: {
      admins: [
        { user_id: "u-owner", role: "owner" }, { user_id: "u-reviewer", role: "reviewer" },
        { user_id: "u-finance", role: "finance" }, { user_id: "u-support", role: "support" },
      ],
      site_settings: [{ key: "mpesa", value: { type: "till", number: "123456", name: "EpicMKT" } }],
      applications: [
        application(APP_ID),
        application(APP2_ID, { status: "payment_confirming", payment_code: "QWE1234567" }),
      ],
      application_flags: [], application_events: [], application_documents: [{ application_id: APP2_ID, slot_key: "sbp" }],
      businesses: [{
        id: BIZ_ID, slug: "mama-pima", seller_id: "SLR-AAAAAA", owner_user_id: "auth-0", name: "Old Shop",
        status: "live", paid_until: "2026-11-20", monthly_price: 500, plan_key: "standard",
        phone: "+254700000001", email: "old@example.com", application_id: null, must_change_password: false,
      }],
      payments: [], messages: [], audit_log: [],
    },
    unique: { businesses: ["slug", "seller_id", "owner_user_id"], payments: ["receipt_no"] },
    authUsers: [{ id: "auth-0", email: "slr-aaaaaa@sellers.epicmkt.app", user_metadata: {} }],
    counters: new Map(), receiptSeq: 0, sms: [], mail: [],
    now: new Date("2026-10-14T06:30:00Z"),
  };
}

function table(w: World, t: string) {
  const eqs: [string, unknown][] = [];
  const nes: [string, unknown][] = [];
  let mode: "select" | "insert" | "update" | "delete" = "select";
  let payload: any;
  let one = false;
  let strict = false;
  const match = (r: any) => eqs.every(([c, v]) => r[c] === v) && nes.every(([c, v]) => r[c] !== v);
  const exec = () => {
    const rows = (w.tables[t] ??= []);
    if (mode === "insert") {
      const list = (Array.isArray(payload) ? payload : [payload]).map((r: any) => ({ id: r.id ?? `${t}-${rows.length + 1}`, ...r }));
      for (const r of list) {
        const col = (w.unique[t] ?? []).find((c) => r[c] != null && rows.some((x) => x[c] === r[c]));
        if (col) return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint ${col}` } };
      }
      rows.push(...list);
      return { data: one ? list[0] : list, error: null };
    }
    if (mode === "update") {
      const hit = rows.filter(match);
      hit.forEach((r) => Object.assign(r, payload));
      return { data: hit, error: null };
    }
    if (mode === "delete") {
      w.tables[t] = rows.filter((r) => !match(r));
      return { data: null, error: null };
    }
    const hit = rows.filter(match).map((r) => structuredClone(r));
    if (one) return strict && !hit[0] ? { data: null, error: { message: "no rows" } } : { data: hit[0] ?? null, error: null };
    return { data: hit, error: null };
  };
  const api: any = {
    select: () => api, limit: () => api, order: () => api,
    eq: (c: string, v: unknown) => (eqs.push([c, v]), api),
    neq: (c: string, v: unknown) => (nes.push([c, v]), api),
    maybeSingle: () => ((one = true), Promise.resolve(exec())),
    single: () => ((one = true), (strict = true), Promise.resolve(exec())),
    insert: (p: unknown) => ((mode = "insert"), (payload = p), api),
    update: (p: unknown) => ((mode = "update"), (payload = p), api),
    delete: () => ((mode = "delete"), api),
    then: (res: any, rej: any) => Promise.resolve(exec()).then(res, rej),
  };
  return api;
}

export function deps(w: World): AdminDeps {
  const db = {
    from: (t: string) => table(w, t),
    rpc: (name: string, args: any) => {
      if (name === "hit_rate_limit") {
        const n = (w.counters.get(args.p_key) ?? 0) + 1;
        w.counters.set(args.p_key, n);
        return Promise.resolve({ data: n <= args.p_max, error: null });
      }
      if (name === "next_rct_no") return Promise.resolve({ data: `RCT-${String(++w.receiptSeq).padStart(6, "0")}`, error: null });
      return Promise.resolve({ data: null, error: null });
    },
    auth: {
      getUser: (token: string) => {
        const role = Object.entries(TOKENS).find(([, v]) => v === token)?.[0];
        return Promise.resolve(role
          ? { data: { user: { id: `u-${role}`, email: `${role}@epicmkt.test` } }, error: null }
          : { data: { user: null }, error: { message: "bad" } });
      },
      admin: {
        createUser: (a: any) => {
          const user = { id: `auth-${w.authUsers.length}`, email: a.email, password: a.password, user_metadata: a.user_metadata };
          w.authUsers.push(user);
          return Promise.resolve({ data: { user: { id: user.id } }, error: null });
        },
        deleteUser: (id: string) => (w.authUsers = w.authUsers.filter((u) => u.id !== id), Promise.resolve({ error: null })),
        updateUserById: (id: string, a: any) => {
          const u = w.authUsers.find((x) => x.id === id);
          if (!u) return Promise.resolve({ error: { message: "nf" } });
          if (a.password) u.password = a.password;
          u.user_metadata = { ...u.user_metadata, ...a.user_metadata };
          return Promise.resolve({ error: null });
        },
      },
    },
  };
  return {
    db,
    sms: (to, message) => (w.sms.push({ to, message }), Promise.resolve(true)),
    mail: (to, subject, html) => (w.mail.push({ to, subject, html }), Promise.resolve()),
    now: () => w.now,
    sellerId: () => generateSellerId(),
    password: () => makeTempPassword(),
  };
}

export const post = (body: unknown, token?: string) =>
  new Request("http://x/", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

export const read = async (r: Response) => ({ status: r.status, body: await r.json(), cache: r.headers.get("cache-control") });
