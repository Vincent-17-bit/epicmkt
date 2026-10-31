import test from "node:test";
import assert from "node:assert/strict";
import { STOP_WORDS, UNIT_WORDS, NEVER_HEAD, SHORT_NOUNS, SYNONYM_GROUPS, RELATED_GROUPS, NOUNS, COMPOUNDS, IRREGULAR_PLURALS, INVARIANT_WORDS } from "./similarVocab.js";
import { singular, relevance } from "./similar.js";

const WORD = /^[a-z0-9]+$/;
const flat = (groups) => groups.flat();
const dupes = (list) => list.filter((word, i) => list.indexOf(word) !== i);

// The vocabulary is data: these checks keep it honest as people add words.

test("every entry is a lowercase single word", () => {
  for (const [name, list] of Object.entries({ STOP_WORDS, UNIT_WORDS, NEVER_HEAD, SHORT_NOUNS, NOUNS, synonyms: flat(SYNONYM_GROUPS), related: flat(RELATED_GROUPS), invariant: INVARIANT_WORDS })) {
    for (const word of list) assert.match(word, WORD, `${name}: ${word}`);
  }
  for (const [from, to] of Object.entries({ ...COMPOUNDS, ...IRREGULAR_PLURALS })) {
    assert.ok(from.split(" ").every((w) => WORD.test(w)) && WORD.test(to), `${from} -> ${to}`);
  }
});

test("nouns, synonyms and related words are written in the singular, since plurals fold automatically", () => {
  for (const word of [...NOUNS, ...flat(SYNONYM_GROUPS), ...flat(RELATED_GROUPS)]) assert.equal(singular(word), word, `${word} should be singular`);
});

test("no word is listed twice, and no word is in two synonym groups", () => {
  assert.deepEqual(dupes(flat(SYNONYM_GROUPS)), []);
  assert.deepEqual(dupes(NOUNS), []);
  assert.deepEqual(dupes(STOP_WORDS), []);
  assert.deepEqual(dupes(NEVER_HEAD), []);
  assert.deepEqual(dupes(UNIT_WORDS), []);
});

test("a word cannot be both something that can be a head and something that never is", () => {
  const heads = new Set([...NOUNS, ...flat(SYNONYM_GROUPS), ...flat(RELATED_GROUPS)]);
  for (const word of [...NEVER_HEAD, ...STOP_WORDS, ...UNIT_WORDS]) assert.equal(heads.has(word), false, `${word} is both a noun and a non-head`);
});

test("synonym groups have at least two words and related groups are never inside one synonym group", () => {
  for (const group of SYNONYM_GROUPS) assert.ok(group.length >= 2, group.join());
  for (const group of RELATED_GROUPS) {
    assert.ok(group.length >= 2, group.join());
    for (const syn of SYNONYM_GROUPS) assert.ok(group.filter((w) => syn.includes(w)).length < 2, `${group.join()} overlaps ${syn.join()}`);
  }
});

test("things people must never confuse stay apart: not synonyms and not related", () => {
  const apart = [["bread", "cake"], ["bread", "biscuit"], ["cake", "cupcake"], ["cake", "biscuit"], ["milk", "bread"], ["sofa", "lamp"], ["sofa", "table"], ["phone", "laptop"], ["shoe", "shirt"], ["bread", "flour"]];
  const item = (name) => ({ id: name, name, section: "Same" });
  for (const [a, b] of apart) {
    const r = relevance(item(`Fresh ${a}`), item(`Fresh ${b}`));
    assert.equal(r.qualifies, false, `${a} must not match ${b} (${r.state})`);
  }
});

test("the synonym and related pairs the product depends on", () => {
  const item = (name) => ({ id: name, name, section: "Same" });
  for (const [a, b] of [["loaf", "bread"], ["sofa", "couch"], ["phone", "mobile"], ["tv", "television"], ["fridge", "refrigerator"], ["sneakers", "trainers"]]) {
    assert.equal(relevance(item(a), item(b)).state, "same", `${a} ~ ${b}`);
  }
  assert.equal(relevance(item("sofa"), item("armchair")).state, "related");
});

test("short nouns are the only allowed words under three letters", () => {
  for (const word of SHORT_NOUNS) assert.ok(word.length < 3, word);
  for (const word of [...NOUNS, ...flat(SYNONYM_GROUPS)]) if (word.length < 3) assert.ok(SHORT_NOUNS.includes(word), `${word} needs to be in SHORT_NOUNS`);
});
