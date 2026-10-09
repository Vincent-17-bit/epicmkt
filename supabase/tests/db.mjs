import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const base = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
const name = "epicmkt_test";

const withDb = (url, db) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

export const ids = {
  admin: "00000000-0000-0000-0000-0000000000a0",
  userA: "00000000-0000-0000-0000-0000000000a1",
  userB: "00000000-0000-0000-0000-0000000000b1",
  bizA: "10000000-0000-0000-0000-0000000000a1",
  bizB: "10000000-0000-0000-0000-0000000000b1",
};

export async function createDatabase() {
  const root = new pg.Client({ connectionString: base });
  await root.connect();
  await root.query(`drop database if exists ${name} with (force)`);
  await root.query(`create database ${name}`);
  await root.end();
  const url = withDb(base, name);
  const owner = new pg.Client({ connectionString: url });
  await owner.connect();
  await owner.query(`alter database ${name} set search_path = "$user", public, extensions`);
  await owner.query(readFileSync(join(here, "bootstrap.sql"), "utf8"));
  const dir = join(here, "..", "migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    await owner.query(readFileSync(join(dir, f), "utf8"));
  }
  await owner.end();
  return url;
}

export async function connect(url) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  await c.query(`set search_path = "$user", public, extensions`);
  return c;
}

export async function seedFixtures(c) {
  await c.query(`
    insert into auth.users (id, email) values
      ('${ids.admin}', 'admin@test'), ('${ids.userA}', 'a@test'), ('${ids.userB}', 'b@test');
    insert into public.admins (user_id) values ('${ids.admin}');
    insert into public.categories (id, name, grp, tier, sort) values ('barber', 'Barber', 'Beauty', 'A', 1);
    insert into public.plans (category_id, plan_key, price_kes, items_limit, top_benefits) values
      ('barber', 'standard', 500, 3, '["a","b","c"]'),
      ('barber', 'premium', 1500, 6, '["a","b","c"]');
    insert into public.businesses (id, seller_id, user_id, slug, name, category_id, plan_key, status, phone) values
      ('${ids.bizA}', 'ES100001', '${ids.userA}', 'shop-a', 'Shop A', 'barber', 'standard', 'live', '+254712345678'),
      ('${ids.bizB}', 'ES100002', '${ids.userB}', 'shop-b', 'Shop B', 'barber', 'premium', 'live', '+254722345678');
  `);
}

export async function tx(c, who, fn, { commit = false } = {}) {
  await c.query("begin");
  try {
    if (who) {
      const role = who.role ?? "authenticated";
      await c.query(`set local role ${role}`);
      if (who.sub) await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: who.sub, role })]);
    }
    const out = await fn(c);
    await c.query(commit ? "commit" : "rollback");
    return out;
  } catch (e) {
    await c.query("rollback");
    throw e;
  }
}

export const seller = (sub) => ({ sub });
export const asA = { sub: ids.userA };
export const asB = { sub: ids.userB };
export const asAdmin = { sub: ids.admin };
export const asService = { role: "service_role" };

export async function sql(c, text, params) {
  return (await c.query(text, params)).rows;
}

export async function rejects(c, who, text, params, pattern) {
  let err;
  try {
    await tx(c, who, async (k) => { await k.query(text, params); });
  } catch (e) {
    err = e;
  }
  if (!err) throw new Error(`expected failure: ${text}`);
  if (pattern && !pattern.test(err.message)) throw new Error(`wrong error "${err.message}" for ${text}`);
  return err;
}
