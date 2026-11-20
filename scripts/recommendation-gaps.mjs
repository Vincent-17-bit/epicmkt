// Which real product names can the recommendation engines NOT read yet? Feed it item names, one per line (stdin or a file), e.g. from
//   psql -At -c "select name from public_items" | node scripts/recommendation-gaps.mjs
// It prints the most common unread names for "Goes well with" (no group) and for "Similar" (head word the vocabulary does not know),
// so the next vocabulary additions come from what sellers actually list, not from guesses. Read-only; changes nothing.
import fs from "node:fs";
import { complementGroupOf, hasComplements } from "../shared/src/related/complements.js";
import { analyseName } from "../shared/src/similar.js";

const input = process.argv[2] ? fs.readFileSync(process.argv[2], "utf8") : fs.readFileSync(0, "utf8");
const names = input.split("\n").map((line) => line.trim()).filter(Boolean);
const top = (map, n = 40) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `  ${String(v).padStart(5)}  ${k}`).join("\n");

const ungrouped = new Map();
const noPartners = new Map();
const unknownHeads = new Map();
for (const name of names) {
  const group = complementGroupOf({ name });
  if (!group) ungrouped.set(name.toLowerCase(), (ungrouped.get(name.toLowerCase()) ?? 0) + 1);
  else if (!hasComplements({ name })) noPartners.set(group, (noPartners.get(group) ?? 0) + 1);
  const a = analyseName(name);
  if (a.head && !a.known) unknownHeads.set(a.head, (unknownHeads.get(a.head) ?? 0) + 1);
}
const pct = (n) => `${n} (${names.length ? Math.round((100 * n) / names.length) : 0}%)`;
console.log(`${names.length} names read`);
console.log(`\nGoes well with: no group for ${pct([...ungrouped.values()].reduce((a, b) => a + b, 0))}. Most common (add a phrase to PHRASES in shared/src/related/data/complementMap.js):\n${top(ungrouped)}`);
console.log(`\nGoes well with: grouped but nothing goes with them, by group (intended for services, medicine, alcohol; check the rest):\n${top(noPartners, 20)}`);
console.log(`\nSimilar: head word the vocabulary does not know ${pct([...unknownHeads.values()].reduce((a, b) => a + b, 0))}. Most common (add to NOUNS in shared/src/similarVocab.js):\n${top(unknownHeads)}`);
