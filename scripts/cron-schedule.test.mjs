import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// A function that only runs when something calls it with the cron secret does nothing until it is scheduled.
// This fails when such a function exists but supabase/cron/schedule.sql never calls it.
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase");
const schedule = readFileSync(join(root, "cron", "schedule.sql"), "utf8");
const runbook = readFileSync(join(root, "..", "docs", "cron-runbook.md"), "utf8");

const cronFunctions = readdirSync(join(root, "functions"), { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
  .map((d) => d.name)
  .filter((name) => ["handler.ts", "index.ts"].some((f) => existsSync(join(root, "functions", name, f)) && readFileSync(join(root, "functions", name, f), "utf8").includes("x-cron-secret")));

test("the cron-driven functions are the ones this test knows about", () => {
  assert.deepEqual(cronFunctions.sort(), ["daily-lifecycle", "dispatch-messages", "media-gc", "proofs-purge"]);
});

for (const name of cronFunctions) {
  test(`${name} is scheduled and documented`, () => {
    assert.match(schedule, new RegExp(`cron\\.schedule\\(\\s*'${name}'`), `schedule.sql must schedule ${name}`);
    assert.ok(schedule.includes(`/functions/v1/${name}'`), `schedule.sql must call /functions/v1/${name}`);
    assert.ok(schedule.includes(`cron.unschedule('${name}')`), `schedule.sql should say how to remove ${name}`);
    assert.ok(runbook.includes(`\`${name}\``), `docs/cron-runbook.md must describe ${name}`);
  });
}

// Admin > Automation watches, pauses and runs exactly the jobs in admin_job_names(). A job that is scheduled but missing
// from that list cannot be seen or stopped from the admin (this was true of proofs-purge and media-gc).
test("the admin's job list (admin_job_names) is exactly the set of jobs schedule.sql schedules", () => {
  const dir = join(root, "migrations");
  const latest = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .filter((text) => /function public\.admin_job_names\(\)/.test(text)).pop();
  const listed = [...latest.match(/select array\[([^\]]+)\]/)[1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
  const scheduled = [...schedule.matchAll(/cron\.schedule\(\s*'([a-z-]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...listed].sort(), [...scheduled].sort());
});
