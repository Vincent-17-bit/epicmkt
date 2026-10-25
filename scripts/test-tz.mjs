// Runs the unit suites again with the MACHINE time zone set to each zone below (TZ=...), which is what a user's
// device does. Everything must pass in every zone, because nothing in the app may depend on the device zone.
//
//   npm run test:tz                 shared + admin, 10 zones (about a minute)
//   npm run test:tz -- --ui         also client + seller (slow), on the first 4 zones
//   npm run test:tz -- --ui --all   client + seller on every zone
//   npm run test:tz -- Asia/Kathmandu Pacific/Apia    only these zones
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const ui = args.includes("--ui");
const all = args.includes("--all");
const named = args.filter((a) => !a.startsWith("--"));

// Ordered so the first four cover the hardest cases for the slow suites: UTC, west of UTC with US DST, the
// +14 end of the world, and a +5:45 zone.
const ZONES = named.length ? named : [
  "UTC", "America/Los_Angeles", "Pacific/Kiritimati", "Asia/Kathmandu",
  "Pacific/Pago_Pago", "Europe/London", "Australia/Lord_Howe", "America/St_Johns", "Pacific/Chatham", "Africa/Nairobi"
];

const SUITES = [
  { name: "shared", cmd: ["npm", "run", "test:shared"], cwd: root, parse: node },
  { name: "admin", cmd: ["npm", "run", "test:admin-ui"], cwd: root, parse: node },
  ...(ui ? [
    { name: "client", cmd: ["npx", "vitest", "run"], cwd: join(root, "client"), parse: vitest, slow: true },
    { name: "seller", cmd: ["npx", "vitest", "run"], cwd: join(root, "seller"), parse: vitest, slow: true }
  ] : [])
];

function node(out) {
  const pass = Number(/^# pass (\d+)/m.exec(out)?.[1] ?? 0);
  const fail = Number(/^# fail (\d+)/m.exec(out)?.[1] ?? 0);
  return { pass, fail };
}
function vitest(out) {
  const clean = out.replace(/\x1b\[[0-9;]*m/g, "");
  const line = /Tests\s+(.*)/.exec(clean)?.[1] ?? "";
  return { pass: Number(/(\d+) passed/.exec(line)?.[1] ?? 0), fail: Number(/(\d+) failed/.exec(line)?.[1] ?? 0) };
}

const rows = [];
let failed = false;
for (const [i, zone] of ZONES.entries()) {
  for (const suite of SUITES) {
    if (suite.slow && !all && i >= 4) continue;
    const started = Date.now();
    const run = spawnSync(suite.cmd[0], suite.cmd.slice(1), { cwd: suite.cwd, env: { ...process.env, TZ: zone }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const { pass, fail } = suite.parse(`${run.stdout}\n${run.stderr}`);
    const ok = run.status === 0 && fail === 0 && pass > 0;
    if (!ok) failed = true;
    rows.push({ zone, suite: suite.name, pass, fail, seconds: Math.round((Date.now() - started) / 1000), ok });
    console.log(`${ok ? "ok  " : "FAIL"} TZ=${zone.padEnd(22)} ${suite.name.padEnd(7)} ${String(pass).padStart(4)} passed ${fail} failed  (${rows.at(-1).seconds}s)`);
    if (!ok) console.log((run.stdout + run.stderr).split("\n").filter((l) => /not ok|FAIL|Error|expected|actual/.test(l)).slice(0, 15).join("\n"));
  }
}
console.log(`\n${rows.filter((r) => r.ok).length}/${rows.length} runs passed across ${new Set(rows.map((r) => r.zone)).size} machine time zones`);
process.exit(failed ? 1 : 0);
