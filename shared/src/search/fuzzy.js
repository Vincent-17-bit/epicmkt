// Spelling tolerance for search words. Pure, no dependencies.

/**
 * Optimal-string-alignment distance: insertions, deletions, substitutions and swapping two neighbours each cost 1, so the common
 * typing slip "haricut" is one step from "haircut" (plain edit distance would call it two).
 */
export function distance(a, b) {
  if (a === b) return 0;
  const n = a.length;
  const m = b.length;
  if (!n) return m;
  if (!m) return n;
  let prev2 = null;
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i += 1) {
    const row = [i];
    for (let j = 1; j <= m; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      row.push(v);
    }
    prev2 = prev;
    prev = row;
  }
  return prev[m];
}

/** How many slips a word of this length may have: short words must be almost exact, or "tab" would become "tap". */
export const allowedSlips = (length) => (length <= 6 ? 1 : length <= 9 ? 2 : 3);

/**
 * The closest known word to `word`, or null. `known` is a Map of word -> weight (how common it is in the catalogue); on equal
 * distance the more common word wins. The first letter must agree unless the word is long and one slip away ("phone" for "ohone"
 * is allowed, "cat" for "bat" is not).
 */
export function closestWord(word, known) {
  return closestWords(word, known, 1)[0] ?? null;
}

/** The nearest known words, best first (fewest slips, then most common), up to `count`. */
export function closestWords(word, known, count = 4) {
  if (word.length < 3) return [];
  const limit = allowedSlips(word.length);
  const found = [];
  for (const [candidate, weight] of known) {
    if (Math.abs(candidate.length - word.length) > limit) continue;
    if (candidate[0] !== word[0] && !(word.length >= 5 && candidate[1] === word[1])) continue;
    const d = distance(candidate, word);
    if (d > limit) continue;
    found.push({ word: candidate, d, weight });
  }
  found.sort((a, b) => a.d - b.d || b.weight - a.weight || (a.word < b.word ? -1 : 1));
  return found.slice(0, count).map((f) => f.word);
}
