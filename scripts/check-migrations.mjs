// Guards the numbering of supabase/migrations so a migration can never be silently missing, duplicated or reordered.
//
// Supabase records each migration by its numeric prefix, so:
//   * two files with the same number clash (the second is skipped or errors),
//   * renaming an applied file makes the old number "missing" and the new one "pending",
//   * a number that is skipped without a reason hides a migration that was lost or never merged.
// Every gap must therefore be written down in RESERVED with the reason, and every file must keep its number forever.
//
//   node scripts/check-migrations.mjs        exits 1 and lists every problem
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Numbers that have no file on purpose. Nothing was ever committed under these numbers, on any branch.
// 0035-0037 were renumbered from 0024-0026 (commit 45a3b85) after main gained admin migrations 0024-0031, and the
// numbers in between were never used. Do not create files for them: databases that already applied 0035 or later
// would see a migration "inserted before the last one" and refuse a plain `supabase db push`.
export const RESERVED = {
  32: "never used (public-exception migrations were renumbered from 0024-0026 straight to 0035-0037)",
  33: "never used (see 0032)",
  34: "never used (see 0032)"
};

const NAME = /^(\d{4})_([a-z0-9_]+)\.sql$/;

export function checkMigrations(files, { reserved = RESERVED, readme = "", read = () => "" } = {}) {
  const problems = [];
  const entries = [];
  for (const file of files) {
    const m = NAME.exec(file);
    if (!m) {
      problems.push(`${file}: name must look like 0001_snake_case.sql`);
      continue;
    }
    entries.push({ file, n: Number(m[1]) });
  }
  entries.sort((a, b) => a.n - b.n || a.file.localeCompare(b.file));

  const seen = new Map();
  for (const e of entries) {
    if (seen.has(e.n)) problems.push(`${e.file}: number ${String(e.n).padStart(4, "0")} is already used by ${seen.get(e.n)}`);
    else seen.set(e.n, e.file);
  }

  const numbers = [...seen.keys()];
  if (numbers.length) {
    if (numbers[0] !== 1) problems.push(`the first migration must be 0001, found ${String(numbers[0]).padStart(4, "0")}`);
    const last = numbers[numbers.length - 1];
    for (let n = 1; n <= last; n += 1) {
      if (!seen.has(n) && !(n in reserved)) problems.push(`migration ${String(n).padStart(4, "0")} is missing: add the file, or record why in RESERVED`);
    }
    for (const n of Object.keys(reserved).map(Number)) {
      if (seen.has(n)) problems.push(`${seen.get(n)}: number ${String(n).padStart(4, "0")} is listed in RESERVED but a file exists; remove it from RESERVED`);
    }
  }

  // The first comment line may name the file; it has to be this file.
  for (const e of entries) {
    const head = read(e.file).split("\n", 3).join("\n");
    const named = /^--\s*(\d{4}_[a-z0-9_]+\.sql)\b/m.exec(head);
    if (named && named[1] !== e.file) problems.push(`${e.file}: header says ${named[1]}`);
  }

  // Docs may only point at migrations that exist.
  const present = new Set(entries.map((e) => e.file));
  for (const ref of new Set(readme.match(/\b\d{4}_[a-z0-9_]+\.sql\b/g) ?? [])) {
    if (!present.has(ref)) problems.push(`supabase/README.md mentions ${ref}, which does not exist`);
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase");
  const dir = join(root, "migrations");
  const files = readdirSync(dir).filter((f) => !f.startsWith("."));
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const problems = checkMigrations(files, { readme, read: (f) => readFileSync(join(dir, f), "utf8") });
  if (problems.length) {
    console.error(`Migration check failed:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`Migrations OK: ${files.length} files, 0001 to ${files.at(-1).slice(0, 4)}, ${Object.keys(RESERVED).length} reserved numbers.`);
}
