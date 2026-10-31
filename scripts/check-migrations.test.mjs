import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkMigrations, RESERVED, SHARED_NUMBERS } from "./check-migrations.mjs";

const run = (files, extra = {}) => checkMigrations(files, { reserved: {}, shared: {}, ...extra });

test("a contiguous list passes", () => {
  assert.deepEqual(run(["0001_a.sql", "0002_b.sql", "0003_c.sql"]), []);
});

test("a skipped number is reported unless it is reserved with a reason", () => {
  assert.match(run(["0001_a.sql", "0003_c.sql"]).join("\n"), /migration 0002 is missing/);
  assert.deepEqual(run(["0001_a.sql", "0003_c.sql"], { reserved: { 2: "never used" } }), []);
});

test("a reserved number must not also have a file", () => {
  assert.match(run(["0001_a.sql", "0002_b.sql"], { reserved: { 2: "x" } }).join("\n"), /listed in RESERVED but a file exists/);
});

test("a new duplicate number clashes", () => {
  assert.match(run(["0001_a.sql", "0002_b.sql", "0002_c.sql"]).join("\n"), /0002 is already used by 0002_b\.sql/);
});

test("a frozen shared number passes only with exactly its two files", () => {
  const shared = { 2: ["0002_b.sql", "0002_c.sql"] };
  assert.deepEqual(run(["0001_a.sql", "0002_b.sql", "0002_c.sql"], { shared }), []);
  assert.match(run(["0001_a.sql", "0002_b.sql", "0002_c.sql", "0002_d.sql"], { shared }).join("\n"), /number 0002 is shared by .* but SHARED_NUMBERS allows only/);
  assert.match(run(["0001_a.sql", "0002_b.sql", "0002_x.sql"], { shared }).join("\n"), /SHARED_NUMBERS allows only/);
  assert.match(run(["0001_a.sql", "0002_b.sql"], { shared }).join("\n"), /listed in SHARED_NUMBERS but only 1 file/);
});

test("bad names and a wrong start are reported", () => {
  const out = run(["0002_a.sql", "notes.sql"]).join("\n");
  assert.match(out, /notes\.sql: name must look like/);
  assert.match(out, /the first migration must be 0001/);
});

test("a header that names another file is reported", () => {
  const out = run(["0001_a.sql"], { read: () => "-- 0009_other.sql\nselect 1;" }).join("\n");
  assert.match(out, /header says 0009_other\.sql/);
  assert.deepEqual(run(["0001_a.sql"], { read: () => "-- 0001_a.sql\nselect 1;" }), []);
  assert.deepEqual(run(["0001_a.sql"], { read: () => "-- Admin backend.\nselect 1;" }), []);
});

test("a split number (004200, 004201) is allowed, but not twice with the same part or mixed with a plain one", () => {
  assert.deepEqual(run(["0001_a.sql", "000200_b.sql", "000201_c.sql", "0003_d.sql"]), []);
  assert.match(run(["0001_a.sql", "000200_b.sql", "000200_c.sql"]).join("\n"), /already used by/);
  assert.match(run(["0001_a.sql", "0002_b.sql", "000201_c.sql"]).join("\n"), /already used by/);
});

test("the README may not point at a migration that does not exist", () => {
  assert.match(run(["0001_a.sql"], { readme: "see 0002_gone.sql" }).join("\n"), /README\.md mentions 0002_gone\.sql/);
});

test("every reserved and shared number has a written reason or a pair of files", () => {
  for (const [n, why] of Object.entries(RESERVED)) assert.ok(why.length > 10, `reserved ${n} needs a reason`);
  for (const [n, names] of Object.entries(SHARED_NUMBERS)) assert.equal(names.length, 2, `shared ${n} names exactly two files`);
});

test("the real migrations folder passes", () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");
  assert.deepEqual(checkMigrations(readdirSync(dir).filter((f) => !f.startsWith("."))), []);
});
