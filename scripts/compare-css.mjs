import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";

const load = (dir) =>
  readdirSync(join(dir, "assets"))
    .filter((f) => f.endsWith(".css"))
    .map((f) => readFileSync(join(dir, "assets", f), "utf8"))
    .join("\n");

const normalize = (css) => {
  const rules = [];
  postcss.parse(css).each((node) => {
    const text = node.toString().replace(/_([A-Za-z0-9-]+?)_[a-z0-9]{5}_\d+\b/g, "$1").replace(/\s+/g, " ").trim();
    rules.push(text);
  });
  return rules;
};

const count = (list) => list.reduce((m, r) => m.set(r, (m.get(r) ?? 0) + 1), new Map());

const [before, after] = process.argv.slice(2);
const a = count(normalize(load(before)));
const b = count(normalize(load(after)));
const removed = [];
const added = [];
for (const [rule, n] of a) if ((b.get(rule) ?? 0) < n) removed.push(rule);
for (const [rule, n] of b) if ((a.get(rule) ?? 0) < n) added.push(rule);
console.log(`before rules: ${[...a.values()].reduce((x, y) => x + y, 0)}, after rules: ${[...b.values()].reduce((x, y) => x + y, 0)}`);
console.log(`removed: ${removed.length}`);
removed.forEach((r) => console.log(`- ${r.slice(0, 160)}`));
console.log(`added: ${added.length}`);
added.forEach((r) => console.log(`+ ${r.slice(0, 160)}`));
process.exit(removed.length ? 1 : 0);
