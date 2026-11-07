import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const synced = join(root, "supabase", "functions", "_shared", "synced");
const check = () => spawnSync(process.execPath, [join(root, "scripts", "sync-shared.mjs"), "--check"], { encoding: "utf8" });

test("sync:shared --check passes on a clean checkout (synced copies match shared/src)", () => {
  const r = check();
  assert.equal(r.status, 0, r.stderr);
});
test("the scales are synced with their sub-folder, and tests and testkit stay behind", () => {
  for (const f of ["scales/index.js", "scales/registry.js", "scales/validate.js", "scales/shoeChart.js", "scales/remaining/index.js", "scales/remaining/kit.js"]) assert.ok(existsSync(join(synced, f)), f);
  const all = [...readdirSync(join(synced, "scales")), ...readdirSync(join(synced, "scales", "remaining"))];
  assert.ok(!all.some((n) => n.endsWith(".test.js") || n === "testkit.js"), all.join(", "));
});
test("the synced scales run on their own (what an edge function imports): parse, key, validate", async () => {
  const { parse, sizeKey, format, validateAxisValues, listScales } = await import(pathToFileURL(join(synced, "scales", "index.js")).href);
  assert.equal(listScales().length, 35);
  const shoe = parse("shoe", "EU 42");
  assert.equal(shoe.ok, true);
  assert.equal(sizeKey(shoe.value), "shoe:eu:42");
  assert.equal(format(parse("storage", "1024 GB").value), "1 TB");
  assert.equal(validateAxisValues({ key: "size", scale: "volume" }, ["5 L", "5 litres", "10 L"], {}).values.length, 2);
});
test("--check fails when a synced file is edited, missing, or left over after a rename", () => {
  const edited = join(synced, "scales", "util.js");
  const original = readFileSync(edited, "utf8");
  const stale = join(synced, "scales", "old-renamed-scale.js");
  try {
    writeFileSync(edited, `${original}\n// drift\n`);
    let r = check();
    assert.equal(r.status, 1);
    assert.match(r.stderr, /out of sync: scales\/util\.js/);
    writeFileSync(edited, original);
    writeFileSync(stale, "export const x = 1;\n");
    r = check();
    assert.equal(r.status, 1);
    assert.match(r.stderr, /stale in synced: scales\/old-renamed-scale\.js/);
  } finally {
    writeFileSync(edited, original);
    rmSync(stale, { force: true });
  }
  assert.equal(check().status, 0);
});
