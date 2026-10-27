// Keeps the admin role rules in one piece. The roles are written in four places: the spec table, the edge-function
// handlers, the shared role list and the database. None of them can run here without Deno or Postgres, so this reads
// the files and fails when one drifts from the others.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const ROLES = [...read("supabase/functions/_shared/roles.ts").match(/ADMIN_ROLES = \[([^\]]*)\]/)[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);

// | `admin-decide-application` | owner, reviewer | 60 per minute |
const spec = new Map();
for (const m of read("docs/ADMIN_SPEC.md").matchAll(/^\| `(admin-[\w-]+)` \| ([\w, ]+) \| (\d+) per (minute|hour) \|/gm)) {
  spec.set(m[1], { roles: m[2].split(",").map((r) => r.trim()), max: Number(m[3]), seconds: m[4] === "minute" ? 60 : 3600 });
}

const handler = (fn) => {
  const m = read(`supabase/functions/${fn}/handler.ts`).match(/adminFn\(\s*\w+,\s*\{[^}]*roles:\s*\[([^\]]*)\],\s*max:\s*(\d+),\s*seconds:\s*(\d+)/);
  assert.ok(m, `${fn} declares its roles, limit and window through adminFn`);
  return { roles: [...m[1].matchAll(/"(\w+)"/g)].map((r) => r[1]), max: Number(m[2]), seconds: Number(m[3]) };
};

test("the spec table lists the three decision and payment functions", () => {
  assert.deepEqual([...spec.keys()].sort(), ["admin-confirm-payment", "admin-decide-application", "admin-reset-seller-password"]);
});

test("each function's roles and rate limit match the spec table", () => {
  for (const [fn, want] of spec) assert.deepEqual(handler(fn), want, fn);
});

test("every role named in the spec and the handlers is a real role", () => {
  for (const [fn, { roles }] of spec) for (const r of roles) assert.ok(ROLES.includes(r), `${fn}: ${r}`);
});

test("support cannot decide applications, confirm payments or reset passwords", () => {
  for (const fn of spec.keys()) assert.ok(!handler(fn).roles.includes("support"), fn);
});

test("only the owner can reset a seller password", () => {
  assert.deepEqual(handler("admin-reset-seller-password").roles, ["owner"]);
});

test("the shared role list matches the admins.role check constraint in the migration", () => {
  const sql = read("supabase/migrations/0008_admin.sql");
  const m = sql.match(/add column if not exists role text not null default 'owner'\s*check \(role in \(([^)]*)\)\)/);
  assert.ok(m, "the admins.role check constraint is in migration 0008");
  assert.deepEqual([...m[1].matchAll(/'(\w+)'/g)].map((r) => r[1]), ROLES);
});

test("every role named in a row-level policy or has_role() call in the migrations is a real role", () => {
  const sql = readdirSync(join(root, "supabase/migrations")).sort().map((f) => read(`supabase/migrations/${f}`)).join("\n");
  const used = new Set();
  for (const m of sql.matchAll(/has_role\(array\[([^\]]*)\]\)/g)) for (const r of m[1].matchAll(/'+(\w+)'+/g)) used.add(r[1]);
  assert.ok(used.size >= 3, "the migrations gate on several roles");
  for (const r of used) assert.ok(ROLES.includes(r), r);
});

test("the SQL functions that mirror the edge functions allow the same roles", () => {
  const sql = read("supabase/migrations/0008_admin.sql");
  // Decisions on applications: owner and reviewer, the same as admin-decide-application.
  assert.ok(/has_role\(array\['owner','reviewer'\]\)/.test(sql));
  // Payments: owner and finance, the same as admin-confirm-payment.
  assert.ok(/using \(public\.has_role\(array\['owner','finance'\]\)\)/.test(sql));
  assert.deepEqual(spec.get("admin-decide-application").roles, ["owner", "reviewer"]);
  assert.deepEqual(spec.get("admin-confirm-payment").roles, ["owner", "finance"]);
});
