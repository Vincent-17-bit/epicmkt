import test from "node:test";
import assert from "node:assert/strict";
import { checkMigrations, RESERVED } from "./check-migrations.mjs";

const run = (files, extra = {}) => checkMigrations(files, { reserved: {}, ...extra });

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

test("duplicate numbers clash", () => {
  assert.match(run(["0001_a.sql", "0002_b.sql", "0002_c.sql"]).join("\n"), /0002 is already used by 0002_b\.sql/);
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

test("the README may not point at a migration that does not exist", () => {
  assert.match(run(["0001_a.sql"], { readme: "see 0002_gone.sql" }).join("\n"), /README\.md mentions 0002_gone\.sql/);
});

test("every reserved number has a written reason", () => {
  for (const [n, why] of Object.entries(RESERVED)) assert.ok(why.length > 10, `reserved ${n} needs a reason`);
});
