// Renumbers ONE migration that has not been applied anywhere yet, for the day another branch takes its number first.
//
//   node scripts/renumber-migration.mjs 0094_option_scales_sizes.sql --next            show the plan (changes nothing)
//   node scripts/renumber-migration.mjs 0094_option_scales_sizes.sql --next --write    do it
//   node scripts/renumber-migration.mjs 0094_option_scales_sizes.sql --to 0097 --write
//
// Only a migration that never reached a database may be renumbered: Supabase records each by number, and renaming an applied one makes the
// old number "missing" and the new one "pending". The new number must be the next free one (the highest other migration + 1); a gap or a number
// below the highest is refused, exactly as `npm run check:migrations` refuses them. The tool renames the file, fixes its header line, and rewrites
// every other mention of the old file name or of "migration <old number>" in tracked text files (docs, tests, comments), then runs the checker.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RESERVED, checkMigrations } from "./check-migrations.mjs";

const pad = (n) => String(n).padStart(4, "0");
const NAME = /^(\d{4})(\d{2})?_([a-z0-9_]+)\.sql$/;
const TEXT_FILE = /\.(md|mjs|js|jsx|ts|tsx|sql|json|yml|yaml|txt)$/;
const SKIP = /(^|\/)(node_modules|dist|coverage)\//;
const SKIP_NAMES = /(^|\/)(package-lock\.json)$/;

/** The next free migration number: one more than the highest, ignoring `except` (the file being renumbered). */
export function nextFreeNumber(files, except = null) {
  const numbers = files.filter((f) => f !== except).map((f) => NAME.exec(f)).filter(Boolean).map((m) => Number(m[1]));
  return (numbers.length ? Math.max(...numbers) : 0) + 1;
}

/** Rewrites one text for the rename. Returns { text, count }. Replaces the old file name, the old stem, and the phrase "migration NNNN". */
export function rewriteText(text, { from, to, oldNumber, newNumber, phrase = true }) {
  const stem = (f) => f.replace(/\.sql$/, "");
  let count = 0;
  // The old stem (with or without ".sql"), not when it is the start of a longer name. Always safe: it names this one file.
  text = text.replace(new RegExp(`${stem(from)}(?![a-z0-9_])`, "g"), () => { count += 1; return stem(to); });
  // "migration 0094" / "Migrations 0094" in comments and docs. Only when the old number is still ours alone: once another migration holds it
  // (the reason for renumbering), the phrase may mean that one, so it is left for a person to read (see `ambiguousMentions`).
  const phrasePattern = new RegExp(`\\b([Mm]igrations? )${pad(oldNumber)}\\b`, "g");
  if (phrase) text = text.replace(phrasePattern, (_m, word) => { count += 1; return `${word}${pad(newNumber)}`; });
  return { text, count };
}

/** How many times a text says "migration <old number>" in words (not as a file name). */
export const ambiguousMentions = (text, oldNumber) => (text.match(new RegExp(`\\b[Mm]igrations? ${pad(oldNumber)}\\b`, "g")) ?? []).length;

/**
 * Plans the rename without touching anything.
 * files: the names in supabase/migrations. texts: { path: content } of the tracked text files to scan.
 */
export function planRenumber({ files, from, to, texts = {}, reserved = RESERVED }) {
  const problems = [];
  const m = NAME.exec(from ?? "");
  if (!m) return { ok: false, problems: [`${from}: name must look like 0001_snake_case.sql`] };
  if (!files.includes(from)) problems.push(`${from} is not in supabase/migrations`);
  if (m[2]) problems.push(`${from}: a split number (${m[1]}${m[2]}) cannot be renumbered`);
  const oldNumber = Number(m[1]);
  const newNumber = to === "next" ? nextFreeNumber(files, from) : Number(to);
  if (!Number.isInteger(newNumber) || newNumber < 1 || newNumber > 9999) problems.push(`${to}: not a migration number`);
  else {
    const next = nextFreeNumber(files, from);
    if (newNumber === oldNumber) problems.push(`${from} already has number ${pad(oldNumber)}`);
    else if (files.some((f) => f !== from && Number(f.slice(0, 4)) === newNumber)) problems.push(`number ${pad(newNumber)} is already used by another migration`);
    else if (newNumber in reserved) problems.push(`number ${pad(newNumber)} is reserved: ${reserved[newNumber]}`);
    else if (newNumber !== next) problems.push(`the next free number is ${pad(next)}; ${pad(newNumber)} would leave a gap or sit before the last migration`);
  }
  if (problems.length) return { ok: false, problems };
  const toName = `${pad(newNumber)}_${m[3]}.sql`;
  // Another migration already holds the old number (that is why we are renumbering): "migration 0094" in words may mean either, so it is
  // not rewritten; the places are listed in `review` for a person to check.
  const phrase = !files.some((f) => f !== from && Number(f.slice(0, 4)) === oldNumber);
  const edits = [];
  const review = [];
  for (const [path, text] of Object.entries(texts)) {
    const r = rewriteText(text, { from, to: toName, oldNumber, newNumber, phrase });
    if (r.count > 0 && r.text !== text) edits.push({ path, count: r.count });
    if (!phrase) { const n = ambiguousMentions(r.text, oldNumber); if (n > 0) review.push({ path, count: n }); }
  }
  return { ok: true, problems: [], from, to: toName, oldNumber, newNumber, phrase, edits, review };
}

function trackedTextFiles(root) {
  const out = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return out.split("\n").filter((f) => f && TEXT_FILE.test(f) && !SKIP.test(f) && !SKIP_NAMES.test(f));
}

/** The command. `root` is the repo root. Returns { code, lines } so it can be tested without a process. */
export function main({ root, args, tracked = () => trackedTextFiles(root) }) {
  const lines = [];
  const log = (l) => lines.push(l);
  const from = args.find((a) => !a.startsWith("--"));
  const write = args.includes("--write");
  const toIndex = args.indexOf("--to");
  const to = args.includes("--next") ? "next" : toIndex >= 0 ? args[toIndex + 1] : null;
  if (!from || !to) {
    log("usage: node scripts/renumber-migration.mjs <0094_name.sql> (--next | --to NNNN) [--write]");
    return { code: 2, lines };
  }
  const dir = join(root, "supabase", "migrations");
  const files = readdirSync(dir).filter((f) => !f.startsWith("."));
  const texts = {};
  for (const rel of tracked()) {
    const full = join(root, rel);
    try {
      if (statSync(full).size > 1_000_000) continue;
      const text = readFileSync(full, "utf8");
      const isOtherMigration = rel.startsWith("supabase/migrations/") && rel !== `supabase/migrations/${from}`;
      // Not other migrations, and not this tool or its test (their examples name a file on purpose).
      if (!isOtherMigration && !/^scripts\/renumber-migration\./.test(rel)) texts[rel] = text;
    } catch { /* a tracked file that is gone: skip */ }
  }
  const plan = planRenumber({ files, from, to: to === "next" ? "next" : to, texts });
  if (!plan.ok) {
    plan.problems.forEach((p) => log(`refused: ${p}`));
    return { code: 1, lines };
  }
  log(`${from} -> ${plan.to}`);
  for (const e of plan.edits) log(`  ${e.path}: ${e.count} mention${e.count === 1 ? "" : "s"}`);
  for (const r of plan.review) log(`  review: ${r.path} says "migration ${pad(plan.oldNumber)}" ${r.count} time${r.count === 1 ? "" : "s"} in words; left alone because another migration also has that number`);
  if (!write) {
    log("(dry run: nothing changed. Add --write to apply.)");
    return { code: 0, lines };
  }
  // Edit the contents first (the migration's own header line is among them), then rename.
  for (const e of plan.edits) {
    const r = rewriteText(texts[e.path], { from, to: plan.to, oldNumber: plan.oldNumber, newNumber: plan.newNumber, phrase: plan.phrase });
    writeFileSync(join(root, e.path), r.text);
  }
  renameSync(join(dir, from), join(dir, plan.to));
  const after = readdirSync(dir).filter((f) => !f.startsWith("."));
  const readme = readFileSync(join(root, "supabase", "README.md"), "utf8");
  const problems = checkMigrations(after, { readme, read: (f) => readFileSync(join(dir, f), "utf8") });
  if (problems.length) {
    problems.forEach((p) => log(`check failed: ${p}`));
    return { code: 1, lines };
  }
  log(`done. Migrations OK (${after.length} files). Run the tests that name it, then commit.`);
  return { code: 0, lines };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const { code, lines } = main({ root, args: process.argv.slice(2) });
  for (const l of lines) (code === 0 ? console.log : console.error)(l);
  process.exit(code);
}
