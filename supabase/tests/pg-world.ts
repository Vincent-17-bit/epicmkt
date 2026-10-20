import pg from "npm:pg@8";
import { generateSellerId, makeTempPassword } from "../functions/_shared/ids.ts";
import type { AdminDeps } from "../functions/_shared/adminKit.ts";

const base = Deno.env.get("TEST_DATABASE_URL") ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
const here = new URL(".", import.meta.url);

const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

export async function createAdminDb(name = "epicmkt_admin_fn") {
  const root = new pg.Client({ connectionString: base });
  await root.connect();
  await root.query(`drop database if exists ${name} with (force)`);
  await root.query(`create database ${name}`);
  await root.end();
  const client = new pg.Client({ connectionString: withDb(base, name) });
  await client.connect();
  await client.query(`alter database ${name} set search_path = "$user", public, extensions`);
  await client.query(`set search_path = "$user", public, extensions`);
  await client.query(await Deno.readTextFile(new URL("bootstrap.sql", here)));
  const dir = new URL("../migrations/", import.meta.url);
  const files: string[] = [];
  for await (const f of Deno.readDir(dir)) if (f.name.endsWith(".sql")) files.push(f.name);
  for (const f of files.sort()) await client.query(await Deno.readTextFile(new URL(f, dir)));
  return client;
}

const encode = (v: unknown) => (v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v);

function table(client: pg.Client, t: string) {
  const where: string[] = [];
  const params: unknown[] = [];
  let mode: "select" | "insert" | "update" | "delete" = "select";
  let cols = "*";
  let payload: any;
  let one = false;
  let strict = false;
  let window = "";
  const orderBy: string[] = [];
  const bind = (v: unknown) => (params.push(encode(v)), `$${params.length}`);
  const clause = () => (where.length ? ` where ${where.join(" and ")}` : "");
  const run = async () => {
    try {
      let sql: string;
      if (mode === "insert") {
        const rows: any[] = Array.isArray(payload) ? payload : [payload];
        const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
        const values = rows.map((r) => `(${keys.map((k) => (r[k] === undefined ? "default" : bind(r[k]))).join(", ")})`);
        sql = `insert into public.${t} (${keys.join(", ")}) values ${values.join(", ")} returning *`;
      } else if (mode === "update") {
        const sets = Object.entries(payload).map(([k, v]) => `${k} = ${bind(v)}`);
        sql = `update public.${t} set ${sets.join(", ")}${clause()} returning *`;
      } else if (mode === "delete") {
        sql = `delete from public.${t}${clause()}`;
      } else {
        sql = `select ${cols} from public.${t}${clause()}${orderBy.length ? ` order by ${orderBy.join(", ")}` : ""}${window}`;
      }
      const r = await client.query(sql, params);
      const rows = r.rows ?? [];
      if (one) return strict && !rows[0] ? { data: null, error: { message: "no rows" } } : { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    } catch (e: any) {
      return { data: null, error: { code: e.code, message: e.message } };
    }
  };
  const api: any = {
    select: (c?: string) => (mode === "select" && (cols = c ?? "*"), api),
    eq: (c: string, v: unknown) => (where.push(`${c} = ${bind(v)}`), api),
    neq: (c: string, v: unknown) => (where.push(`${c} <> ${bind(v)}`), api),
    in: (c: string, vs: unknown[]) => (params.push(vs), where.push(`${c} = any($${params.length})`), api), // a real array, not JSON
    like: (c: string, v: string) => (where.push(`${c} like ${bind(v)}`), api),
    gte: (c: string, v: unknown) => (where.push(`${c} >= ${bind(v)}`), api),
    lt: (c: string, v: unknown) => (where.push(`${c} < ${bind(v)}`), api),
    range: (a: number, b: number) => ((window = ` limit ${b - a + 1} offset ${a}`), api),
    limit: () => api,
    order: (c: string, o?: { ascending?: boolean }) => (orderBy.push(`${c}${o?.ascending === false ? " desc" : ""}`), api),
    maybeSingle: () => ((one = true), run()),
    single: () => ((one = true), (strict = true), run()),
    insert: (p: unknown) => ((mode = "insert"), (payload = p), api),
    update: (p: unknown) => ((mode = "update"), (payload = p), api),
    delete: () => ((mode = "delete"), api),
    then: (res: any, rej: any) => run().then(res, rej),
  };
  return api;
}

export type PgWorld = {
  deps: AdminDeps;
  sms: { to: string; message: string }[];
  mail: { to?: string; subject: string; html: string }[];
  authMeta: Map<string, { email: string; password?: string; user_metadata?: Record<string, unknown> }>;
  setNow: (d: Date) => void;
};

export function pgDeps(client: pg.Client, tokens: Record<string, { id: string; email: string }>): PgWorld {
  const sms: PgWorld["sms"] = [];
  const mail: PgWorld["mail"] = [];
  const authMeta: PgWorld["authMeta"] = new Map();
  let now = new Date("2026-10-14T06:30:00Z");
  const db = {
    from: (t: string) => table(client, t),
    rpc: async (name: string, args: Record<string, unknown>) => {
      try {
        const keys = Object.keys(args);
        const call = `public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})`;
        const values = keys.map((k) => encode(args[k]));
        // Like PostgREST: a set-returning function answers an array (of rows, or of plain values), anything else its one value.
        const set = (await client.query(`select bool_or(proretset) s from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace`, [name])).rows[0].s;
        if (set) {
          const r = await client.query(`select * from ${call}`, values);
          const plain = r.fields.length === 1 && r.fields[0].name === name;
          return { data: plain ? r.rows.map((x: Record<string, unknown>) => x[name]) : r.rows, error: null };
        }
        const r = await client.query(`select ${call} as r`, values);
        return { data: r.rows[0].r, error: null };
      } catch (e: any) {
        return { data: null, error: { code: e.code, message: e.message } };
      }
    },
    auth: {
      getUser: (token: string) => Promise.resolve(tokens[token]
        ? { data: { user: tokens[token] }, error: null }
        : { data: { user: null }, error: { message: "bad" } }),
      admin: {
        createUser: async (a: any) => {
          const r = await client.query(`insert into auth.users (email) values ($1) returning id`, [a.email]);
          authMeta.set(r.rows[0].id, { email: a.email, password: a.password, user_metadata: a.user_metadata });
          return { data: { user: { id: r.rows[0].id } }, error: null };
        },
        deleteUser: async (id: string) => {
          await client.query(`delete from auth.users where id = $1`, [id]);
          authMeta.delete(id);
          return { error: null };
        },
        updateUserById: (id: string, a: any) => {
          const cur = authMeta.get(id);
          if (!cur) return Promise.resolve({ error: { message: "nf" } });
          authMeta.set(id, { ...cur, password: a.password ?? cur.password, user_metadata: { ...cur.user_metadata, ...a.user_metadata } });
          return Promise.resolve({ error: null });
        },
      },
    },
  };
  const deps: AdminDeps = {
    db,
    sms: (to, message) => (sms.push({ to, message }), Promise.resolve(true)),
    mail: (to, subject, html) => (mail.push({ to, subject, html }), Promise.resolve()),
    now: () => now,
    sellerId: () => generateSellerId(),
    password: () => makeTempPassword(),
  };
  return { deps, sms, mail, authMeta, setNow: (d) => (now = d) };
}
