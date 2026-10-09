import { copyFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "shared", "src", "seller");
const to = join(root, "supabase", "functions", "_shared", "synced");
const files = ["password.js", "media.js"];
const check = process.argv.includes("--check");

mkdirSync(to, { recursive: true });
let drift = 0;
for (const f of files) {
  const src = join(from, f);
  const dst = join(to, f);
  if (check) {
    if (!existsSync(dst) || readFileSync(src, "utf8") !== readFileSync(dst, "utf8")) {
      drift += 1;
      console.error(`out of sync: ${f}`);
    }
  } else {
    copyFileSync(src, dst);
    console.log(`synced ${f}`);
  }
}
if (drift) process.exit(1);
