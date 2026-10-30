// Prints (and with --write, writes) the contrast table for docs/admin-contrast.md from the live tokens in theme.css.
import { readFileSync, writeFileSync } from "node:fs";
import { audit } from "../src/lib/contrast.js";

const css = readFileSync(new URL("../src/styles/theme.css", import.meta.url), "utf8");
const rows = [...audit(css, "light"), ...audit(css, "dark")];
const failing = rows.filter((r) => !r.pass);
if (process.argv.includes("--json")) console.log(JSON.stringify(rows.map((r) => ({ ...r, ratio: +r.ratio.toFixed(2) })), null, 1));
else for (const r of failing) console.log(`FAIL ${r.theme.padEnd(5)} ${r.fg} on ${r.bg}: ${r.ratio.toFixed(2)} (needs ${r.min}) ${r.note}`);
console.log(`${rows.length - failing.length}/${rows.length} pairs pass`);
process.exitCode = failing.length ? 1 : 0;
