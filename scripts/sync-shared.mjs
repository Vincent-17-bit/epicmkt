import { copyFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "shared", "src");
const to = join(root, "supabase", "functions", "_shared", "synced");
// [path under shared/src, name under supabase/functions/_shared/synced]
const files = [
  ["seller/password.js", "password.js"], ["seller/media.js", "media.js"], ["seller/images.js", "images.js"],
  ["seller/cloudinarySign.js", "cloudinarySign.js"], ["time.js", "time.js"], ["seller/settings.js", "settings.js"]
];
const check = process.argv.includes("--check");

mkdirSync(to, { recursive: true });
let drift = 0;
for (const [rel, f] of files) {
  const from = join(src, rel);
  const dst = join(to, f);
  if (check) {
    if (!existsSync(dst) || readFileSync(from, "utf8") !== readFileSync(dst, "utf8")) {
      drift += 1;
      console.error(`out of sync: ${f}`);
    }
  } else {
    copyFileSync(from, dst);
    console.log(`synced ${f}`);
  }
}
if (drift) process.exit(1);
