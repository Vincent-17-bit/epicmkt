import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BASELINE, SCRATCH } from "./targets.js";

export default function teardown() {
  if (!process.env.UPDATE_TARGET_BASELINE || !existsSync(SCRATCH)) return;
  const merged = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {};
  const fresh = {};
  for (const file of readdirSync(SCRATCH)) {
    const { id, keys } = JSON.parse(readFileSync(join(SCRATCH, file), "utf8"));
    fresh[id] = [...new Set([...(fresh[id] ?? []), ...keys])];
  }
  for (const [id, keys] of Object.entries(fresh)) {
    if (keys.length) merged[id] = keys.sort();
    else delete merged[id];
  }
  const sorted = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE, `${JSON.stringify(sorted, null, 2)}\n`);
  rmSync(SCRATCH, { recursive: true, force: true });
}
