// node scripts/generate-type-registry.mjs           rewrites shared/src/productType/registry.generated.js
// node scripts/generate-type-registry.mjs --check   exits 1 when the file is stale
import { readFileSync, writeFileSync } from "node:fs";
import { REGISTRY_PATH, renderRegistry } from "./lib/type-registry.mjs";

const next = renderRegistry();
if (process.argv.includes("--check")) {
  let current = "";
  try { current = readFileSync(REGISTRY_PATH, "utf8"); } catch { /* missing counts as stale */ }
  if (current !== next) { console.error(`${REGISTRY_PATH} is stale: run node scripts/generate-type-registry.mjs`); process.exit(1); }
  console.log("type registry is current");
} else {
  writeFileSync(REGISTRY_PATH, next);
  console.log(`wrote ${REGISTRY_PATH}`);
}
