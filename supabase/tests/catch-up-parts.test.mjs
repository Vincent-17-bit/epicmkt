// The SQL editor refuses catch-up-items.sql (too large), so the same catch-up also comes as numbered parts in supabase/catch-up/.
// Run in order, each in its own session as the editor does, they must take a database stopped anywhere after 0037 to the latest
// schema, leave nothing behind, and refuse to run out of order.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createDatabase, connect, sql } from "./db.mjs";
import { build, buildParts, checkedSignatures, PART_MAX_BYTES } from "../tools/build-catch-up.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "..", "migrations");
const partsDir = join(here, "..", "catch-up");
const all = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const names = readdirSync(partsDir).filter((f) => f.endsWith(".sql")).sort();
const parts = names.map((f) => readFileSync(join(partsDir, f), "utf8"));

test("the checked-in catch-up files are current (run node supabase/tools/build-catch-up.mjs after adding a migration)", () => {
  const sigs = checkedSignatures();
  assert.equal(readFileSync(join(here, "..", "catch-up-items.sql"), "utf8"), build(sigs), "catch-up-items.sql is out of date");
  const want = buildParts(sigs);
  assert.deepEqual(names, want.map((p) => p.name), "supabase/catch-up/ has different parts");
  want.forEach((p, i) => assert.equal(parts[i], p.text, `${p.name} is out of date`));
  for (const [i, p] of parts.entries()) assert.ok(p.length <= PART_MAX_BYTES, `${names[i]} is ${p.length} bytes, over the SQL editor budget`);
});

async function schema(c) {
  const fns = await sql(c, `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as k, md5(pg_get_functiondef(p.oid)) as h from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' order by 1`);
  const cols = await sql(c, `select table_name || '.' || column_name as k, data_type as h from information_schema.columns where table_schema = 'public' order by 1`);
  return { fns: Object.fromEntries(fns.map((r) => [r.k, r.h])), cols: Object.fromEntries(cols.map((r) => [r.k, r.h])) };
}
let url;
async function partial(upTo) {
  url ??= await createDatabase({ database: "parts_db" });
  const root = new pg.Client({ connectionString: url.replace(/\/[^/]+$/, "/postgres") }); await root.connect();
  await root.query(`drop database if exists parts_db with (force)`); await root.query(`create database parts_db`); await root.end();
  const owner = new pg.Client({ connectionString: url }); await owner.connect();
  await owner.query(`alter database parts_db set search_path = "$user", public, extensions`);
  await owner.query(readFileSync(join(here, "bootstrap.sql"), "utf8"));
  for (const f of all) if (f <= upTo) await owner.query(readFileSync(join(dir, f), "utf8"));
  await owner.end();
}
// One part, in a session of its own (the SQL editor does not keep a session between runs): the rows of its final table.
async function run(i) {
  const c = new pg.Client({ connectionString: url }); await c.connect();
  try { await c.query(`set search_path = "$user", public, extensions`); return (await c.query(parts[i])).at(-1).rows; } finally { await c.end(); }
}
async function look(fn) { const c = await connect(url); try { return await fn(c); } finally { await c.end(); } }
const leftOver = () => look(async (c) => (await sql(c, `select count(*)::int as n from pg_namespace where nspname = 'catch_up'`))[0].n);

const full = await (async () => { const c = await connect(await createDatabase({ database: "parts_full_db" })); const s = await schema(c); await c.end(); return s; })();
const diff = (a, b) => Object.keys(a).filter((k) => a[k] !== b[k]);

for (const upTo of ["0037", "0085", "0099", "0131", "0135"]) {
  test(`a database stopped after ${upTo} reaches the latest schema by running the ${parts.length} parts in order`, async () => {
    await partial(upTo + "~");
    let rows;
    for (let i = 0; i < parts.length; i++) {
      rows = await run(i);
      const end = rows.at(-1).result;
      assert.equal(end, i === parts.length - 1 ? `Finished: all ${parts.length} parts have run.` : `Next: run part ${i + 2} of ${parts.length}.`);
    }
    assert.ok(rows.some((r) => r.result === "applied"));
    assert.deepEqual(rows.filter((r) => /^SKIPPED/.test(r.result)).map((r) => r.migration + ": " + r.result.slice(0, 160)), []);
    const got = await look(schema);
    assert.deepEqual(diff(full.fns, got.fns), [], "functions differ");
    assert.deepEqual(diff(got.fns, full.fns), [], "extra functions");
    assert.deepEqual(diff(full.cols, got.cols), [], "columns differ");
    assert.equal(await leftOver(), 0, "the catch_up schema is removed at the end");
    const again = await run(0);
    assert.match(again[0].result, /Nothing to do/);
    assert.equal(again.at(-1).result, "Finished: nothing else to run.");
    assert.equal(await leftOver(), 0);
  });
}

test("a current database: part 1 says there is nothing to do and leaves nothing behind; part 2 then says to run part 1", async () => {
  await partial("9999");
  const rows = await run(0);
  assert.match(rows[0].result, /Nothing to do/);
  assert.equal(rows.at(-1).result, "Finished: nothing else to run.");
  assert.equal(await leftOver(), 0);
  await assert.rejects(run(1), /Run part 1 first/);
});

test("parts run out of order stop without changing anything; a part can be run again", async () => {
  await partial("0037~");
  await run(0);
  const before = await look(schema);
  await assert.rejects(run(2), /Run part 2 next/);
  assert.deepEqual(await look(schema), before, "the refused part changed nothing");
  await run(1);
  const twice = await run(1);
  assert.equal(twice.at(-1).result, `Next: run part 3 of ${parts.length}.`);
  assert.deepEqual(twice.filter((r) => /^SKIPPED/.test(r.result)), []);
  for (let i = 2; i < parts.length; i++) await run(i);
  const got = await look(schema);
  assert.deepEqual(diff(full.fns, got.fns), []);
  assert.deepEqual(diff(full.cols, got.cols), []);
});
