import { copyFileSync, mkdirSync, readFileSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "shared", "src");
const to = join(root, "supabase", "functions", "_shared", "synced");
// [path under shared/src, name under supabase/functions/_shared/synced]
const files = [
  ["seller/password.js", "password.js"], ["seller/media.js", "media.js"], ["seller/images.js", "images.js"],
  ["seller/cloudinarySign.js", "cloudinarySign.js"], ["time.js", "time.js"], ["openValues.js", "openValues.js"],
  ["media3d.js", "media3d.js"]
];
// Whole folders, copied with their sub-folders so relative imports keep working: [folder under shared/src, folder under synced].
// Tests and test helpers stay behind. Add a folder here when an edge function imports from it (A02: seller_save_item / seller_check_item).
const folders = [["scales", "scales"], ["specRules", "specRules"]];
const skip = (name) => !name.endsWith(".js") || name.endsWith(".test.js") || name === "testkit.js";

function walk(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, base));
    else if (!skip(name)) out.push(relative(base, full).split("\\").join("/"));
  }
  return out;
}

const pairs = [...files.map(([rel, f]) => [rel, f])];
for (const [from, into] of folders) for (const rel of walk(join(src, from))) pairs.push([`${from}/${rel}`, `${into}/${rel}`]);

const check = process.argv.includes("--check");
mkdirSync(to, { recursive: true });
let drift = 0;
for (const [rel, f] of pairs) {
  const from = join(src, rel);
  const dst = join(to, f);
  if (check) {
    if (!existsSync(dst) || readFileSync(from, "utf8") !== readFileSync(dst, "utf8")) {
      drift += 1;
      console.error(`out of sync: ${f}`);
    }
  } else {
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(from, dst);
    console.log(`synced ${f}`);
  }
}
// A file removed or renamed in shared/src must not linger in synced/ (it would keep an old copy alive).
for (const [, into] of folders) {
  const want = new Set(pairs.map(([, f]) => f));
  const dir = join(to, into);
  if (!existsSync(dir)) continue;
  for (const rel of walk(dir)) {
    const f = `${into}/${rel}`;
    if (want.has(f)) continue;
    if (check) { drift += 1; console.error(`stale in synced: ${f}`); }
    else { rmSync(join(to, f)); console.log(`removed stale ${f}`); }
  }
}
if (drift) process.exit(1);
