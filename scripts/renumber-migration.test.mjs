import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, nextFreeNumber, planRenumber, rewriteText } from "./renumber-migration.mjs";

const files = ["0001_a.sql", "0002_b.sql", "0003_taken.sql", "0003_mine.sql"]; // another branch took 0003 first

test("the next free number is one more than the highest other migration", () => {
  assert.equal(nextFreeNumber(files, "0003_mine.sql"), 4);
  assert.equal(nextFreeNumber(["0001_a.sql", "0002_b.sql"]), 3);
  assert.equal(nextFreeNumber([]), 1);
  assert.equal(nextFreeNumber(["004200_a.sql", "004201_b.sql"]), 43, "split numbers count as their number");
});

test("plans the rename to the next free number and counts the mentions it will fix", () => {
  const plan = planRenumber({
    files, from: "0003_mine.sql", to: "next",
    texts: { "docs/x.md": "See migration 0003 and 0003_mine.sql.", "t.mjs": 'read("0003_mine.sql")', "other.md": "nothing here", "n.md": "0003_mine_extra.sql is a different file" },
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.to, "0004_mine.sql");
  assert.deepEqual(plan.edits.map((e) => [e.path, e.count]), [["docs/x.md", 1], ["t.mjs", 1]]);   // the file name only: another migration has 0003
  assert.deepEqual(plan.review.map((r) => r.path), ["docs/x.md"]);
});

test("refuses a gap, a number below the highest, a used or reserved number, and the number it already has", () => {
  const refuse = (to, pattern, f = files) => { const p = planRenumber({ files: f, from: "0003_mine.sql", to }); assert.equal(p.ok, false, `refused ${to}`); assert.match(p.problems.join(" "), pattern); };
  refuse("0007", /next free number is 0004/);
  refuse("0002", /already used|next free number/);
  refuse("0003", /already has number 0003/);
  refuse("abc", /not a migration number/);
  const p = planRenumber({ files: ["0001_a.sql", "0002_b.sql", "0002_mine.sql"], from: "0002_mine.sql", to: "0003", reserved: { 3: "left empty on purpose" } });
  assert.equal(p.ok, false);
  assert.match(p.problems.join(" "), /reserved: left empty on purpose/);
});

test("refuses a file that is missing, badly named, or a split number", () => {
  assert.equal(planRenumber({ files, from: "0009_gone.sql", to: "next" }).ok, false);
  assert.equal(planRenumber({ files, from: "nope.sql", to: "next" }).ok, false);
  assert.match(planRenumber({ files: ["004200_a.sql", "004201_b.sql"], from: "004200_a.sql", to: "0050" }).problems.join(" "), /split number/);
});

test("rewriteText changes the file name, the stem and the phrase, and leaves longer names alone", () => {
  const r = rewriteText("-- 0003_mine.sql\nmigration 0003, Migration 0003 and 0003_mine_extra.sql and 00030_mine.sql, 0003_mine", { from: "0003_mine.sql", to: "0004_mine.sql", oldNumber: 3, newNumber: 4 });
  assert.equal(r.text, "-- 0004_mine.sql\nmigration 0004, Migration 0004 and 0003_mine_extra.sql and 00030_mine.sql, 0004_mine");
  assert.equal(r.count, 4);
});

test("when another migration holds the old number, the phrase 'migration 0003' is left alone and listed for review; the file name is still fixed", () => {
  const plan = planRenumber({
    files, from: "0003_mine.sql", to: "next",
    texts: { "docs/theirs.md": "Tiers (migration 0003) and Migration 0003.", "docs/mine.md": "Mine is 0003_mine.sql, see migration 0003." },
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.phrase, false);
  assert.deepEqual(plan.edits, [{ path: "docs/mine.md", count: 1 }]);
  assert.deepEqual(plan.review, [{ path: "docs/theirs.md", count: 2 }, { path: "docs/mine.md", count: 1 }]);
});

test("when no other migration has the old number, the phrase is rewritten too", () => {
  const plan = planRenumber({ files: ["0001_a.sql", "0002_b.sql", "0005_mine.sql"], from: "0005_mine.sql", to: "0003", texts: { "d.md": "see migration 0005 (0005_mine.sql)" } });
  assert.equal(plan.ok, true);
  assert.equal(plan.phrase, true);
  assert.deepEqual(plan.edits, [{ path: "d.md", count: 2 }]);
  assert.deepEqual(plan.review, []);
});

test("it does not rewrite its own examples", () => {
  const { root, tracked } = tree();
  writeFileSync(join(root, "scripts-note.md"), "x");
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "scripts", "renumber-migration.mjs"), "// usage: 0003_mine.sql\n");
  const r = main({ root, args: ["0003_mine.sql", "--next", "--write"], tracked: () => [...tracked(), "scripts/renumber-migration.mjs"] });
  assert.equal(r.code, 0, r.lines.join("\n"));
  assert.equal(readFileSync(join(root, "scripts", "renumber-migration.mjs"), "utf8"), "// usage: 0003_mine.sql\n");
});

function tree() {
  const root = mkdtempSync(join(tmpdir(), "renumber-"));
  const dir = join(root, "supabase", "migrations");
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(root, "docs"), { recursive: true });
  for (const f of files) writeFileSync(join(dir, f), f === "0003_mine.sql" ? "-- 0003_mine.sql\nselect 1;\n" : `-- ${f}\nselect 1;\n`);
  writeFileSync(join(root, "supabase", "README.md"), "Migrations: 0001_a.sql, 0002_b.sql, 0003_mine.sql\n");
  writeFileSync(join(root, "docs", "x.md"), "This is migration 0003 (0003_mine.sql).\n");
  writeFileSync(join(root, "docs", "untouched.md"), "nothing\n");
  return { root, dir, tracked: () => ["supabase/README.md", "docs/x.md", "docs/untouched.md", ...files.map((f) => `supabase/migrations/${f}`)] };
}

test("a dry run changes nothing", () => {
  const { root, dir, tracked } = tree();
  const before = readdirSync(dir).join();
  const r = main({ root, args: ["0003_mine.sql", "--next"], tracked });
  assert.equal(r.code, 0);
  assert.match(r.lines.join("\n"), /0003_mine.sql -> 0004_mine.sql/);
  assert.match(r.lines.join("\n"), /dry run/);
  assert.equal(readdirSync(dir).join(), before);
  assert.match(readFileSync(join(root, "docs", "x.md"), "utf8"), /migration 0003/);
});

test("--write renames the file, fixes its header and every mention, and the checker passes", () => {
  const { root, dir, tracked } = tree();
  const r = main({ root, args: ["0003_mine.sql", "--next", "--write"], tracked });
  assert.equal(r.code, 0, r.lines.join("\n"));
  assert.equal(existsSync(join(dir, "0003_mine.sql")), false);
  assert.equal(readFileSync(join(dir, "0004_mine.sql"), "utf8"), "-- 0004_mine.sql\nselect 1;\n");
  assert.equal(readFileSync(join(root, "docs", "x.md"), "utf8"), "This is migration 0003 (0004_mine.sql).\n", "the file name is fixed; the ambiguous phrase is left for a person");
  assert.match(r.lines.join("\n"), /review: docs\/x.md says "migration 0003"/);
  assert.equal(readFileSync(join(root, "docs", "untouched.md"), "utf8"), "nothing\n");
  assert.match(r.lines.join("\n"), /Migrations OK/);
  assert.equal(readdirSync(dir).filter((f) => f.startsWith("0003")).join(), "0003_taken.sql", "the other branch's migration was not touched");
});

test("it never edits another migration, even one that mentions the number", () => {
  const { root, dir, tracked } = tree();
  writeFileSync(join(dir, "0001_a.sql"), "-- 0001_a.sql\n-- see migration 0003\nselect 1;\n");
  main({ root, args: ["0003_mine.sql", "--to", "0004", "--write"], tracked });
  assert.match(readFileSync(join(dir, "0001_a.sql"), "utf8"), /migration 0003/);
});

test("a refused request exits 1 and says why; missing arguments exit 2", () => {
  const { root, tracked } = tree();
  const refused = main({ root, args: ["0003_mine.sql", "--to", "0009"], tracked });
  assert.equal(refused.code, 1);
  assert.match(refused.lines.join("\n"), /refused: .*next free number is 0004/);
  assert.equal(main({ root, args: [], tracked }).code, 2);
  assert.equal(main({ root, args: ["0003_mine.sql"], tracked }).code, 2);
});
