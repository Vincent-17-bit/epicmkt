// Guards the numbering of supabase/migrations so a migration can never be silently missing, duplicated or reordered.
//
// Supabase records each migration by its numeric prefix, so:
//   * two files with the same number clash (the CLI can record only one of them),
//   * renaming an applied file makes the old number "missing" and the new one "pending",
//   * a number that is skipped without a reason hides a migration that was lost or never merged.
// Every gap must therefore be written down in RESERVED with the reason, every file must keep its number forever, and
// the only way two files may share a number is the split form below: 004200_a.sql, 004201_b.sql (number 0042, parts 00 and 01).
//
//   node scripts/check-migrations.mjs        exits 1 and lists every problem
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Numbers that have no file on purpose. Nothing was ever committed under these numbers, on any branch.
// 0035-0037 were renumbered from 0024-0026 after main gained admin migrations 0024-0031, and the numbers in between
// were never used. Do not create files for them: databases that already applied 0035 or later would see a migration
// "inserted before the last one" and refuse a plain `supabase db push`.
export const RESERVED = {
  32: "never used (public-exception migrations were renumbered from 0024-0026 straight to 0035-0037)",
  33: "never used (see 0032)",
  34: "never used (see 0032)"
};

// Two files used to share 0042 and two shared 0046, which the Supabase CLI cannot record (one history row per version). They
// are now 004200/004201 and 004600/004601: the version sorts exactly where the old pair did, in file order and as text, so
// nothing else moved. A split number is allowed only when every file with that number has a two-digit part and the parts
// are all different. SHARED_NUMBERS stays as an (empty) hook for the unit tests; never add to it.
export const SHARED_NUMBERS = {};

const NAME = /^(\d{4})(\d{2})?_([a-z0-9_]+)\.sql$/;
const pad = (n) => String(n).padStart(4, "0");

export function checkMigrations(files, { reserved = RESERVED, shared = SHARED_NUMBERS, readme = "", read = () => "" } = {}) {
  const problems = [];
  const entries = [];
  for (const file of files) {
    const m = NAME.exec(file);
    if (!m) {
      problems.push(`${file}: name must look like 0001_snake_case.sql`);
      continue;
    }
    entries.push({ file, n: Number(m[1]), part: m[2] ?? null });
  }
  entries.sort((a, b) => a.n - b.n || a.file.localeCompare(b.file));

  const byNumber = new Map();
  for (const e of entries) byNumber.set(e.n, [...(byNumber.get(e.n) ?? []), e.file]);

  for (const [n, names] of byNumber) {
    if (names.length < 2) continue;
    const allowed = shared[n];
    const parts = entries.filter((e) => e.n === n).map((e) => e.part);
    if (!allowed && parts.every((p) => p !== null) && new Set(parts).size === parts.length) continue;   // split number: 004200, 004201
    if (!allowed) problems.push(`${names[1]}: number ${pad(n)} is already used by ${names[0]}`);
    else if (names.join("|") !== [...allowed].sort().join("|")) problems.push(`number ${pad(n)} is shared by ${names.join(", ")} but SHARED_NUMBERS allows only ${allowed.join(", ")}`);
  }
  for (const [n, allowed] of Object.entries(shared)) {
    const names = byNumber.get(Number(n)) ?? [];
    if (names.length < 2) problems.push(`number ${pad(Number(n))} is listed in SHARED_NUMBERS but only ${names.length} file(s) use it (${allowed.join(", ")}): remove it from SHARED_NUMBERS`);
  }

  const numbers = [...byNumber.keys()];
  if (numbers.length) {
    if (numbers[0] !== 1) problems.push(`the first migration must be 0001, found ${pad(numbers[0])}`);
    const last = numbers[numbers.length - 1];
    for (let n = 1; n <= last; n += 1) {
      if (!byNumber.has(n) && !(n in reserved)) problems.push(`migration ${pad(n)} is missing: add the file, or record why in RESERVED`);
    }
    for (const n of Object.keys(reserved).map(Number)) {
      if (byNumber.has(n)) problems.push(`${byNumber.get(n)[0]}: number ${pad(n)} is listed in RESERVED but a file exists; remove it from RESERVED`);
    }
  }

  // The first comment line may name the file; it has to be this file.
  for (const e of entries) {
    const head = read(e.file).split("\n", 3).join("\n");
    const named = /^--\s*(\d{4,6}_[a-z0-9_]+\.sql)\b/m.exec(head);
    if (named && named[1] !== e.file) problems.push(`${e.file}: header says ${named[1]}`);
  }

  // Docs may only point at migrations that exist.
  const present = new Set(entries.map((e) => e.file));
  for (const ref of new Set(readme.match(/\b\d{4,6}_[a-z0-9_]+\.sql\b/g) ?? [])) {
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
  console.log(`Migrations OK: ${files.length} files, 0001 to ${files.sort().at(-1).slice(0, 4)}, ${Object.keys(RESERVED).length} reserved numbers.`);
}
