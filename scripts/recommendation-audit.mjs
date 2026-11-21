// Offline audit of the two product-page rows ("Goes well with" and "Similar items") over the seeded catalogue.
//
//   node scripts/recommendation-audit.mjs           prints a markdown table (paste it into a PR description)
//   node scripts/recommendation-audit.mjs --json    prints the numbers as JSON
//
// WHAT THIS IS NOT: independent proof. The items are derived from scripts/seeds (the "what is it" axis values of each type, the type's
// own name, and the examples written in its parentheses), the same material the vocabulary was written from. It measures whether the
// engines read the catalogue and whether a change moves a number; it cannot say recommendations are good. Only labelled real names
// (docs/qa/recommendation-gold-set.csv) and click data can say that.
//
// Every item is treated as sold by a different store, so every pair is a pair the live "Similar" row could show.
import { fileURLToPath } from "node:url";
import { ALL_TYPES } from "./seeds/index.mjs";
import { complementGroupOf, complementsOf } from "../shared/src/related/complements.js";
import { analyseName, relevance, similarTerms } from "../shared/src/similar.js";
import { hasNoTypeEvidence } from "../shared/src/productType/other.js";

// Axes whose values name a different product or service, not a size or a colour of the same one.
const WHAT_AXES = new Set(["item", "service", "kind", "vehicle", "bird", "test", "event", "package", "dish", "product"]);
const MAX_PER_TYPE = 6;

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const splitList = (s) => s.split(/,|\/|\band\b|\bor\b/i).map(clean).filter((x) => x.length > 1);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** The audit catalogue: [{ id, name, typeId, departmentId, kind }]. Deterministic. */
export function buildCatalogue(types = ALL_TYPES) {
  const items = [];
  for (const type of types) {
    const names = new Map();
    const add = (name) => {
      const n = cap(clean(name));
      if (n.length > 1 && !names.has(n.toLowerCase())) names.set(n.toLowerCase(), n);
    };
    const match = /^(.*?)\s*\((.*)\)\s*$/.exec(type.name);
    const base = match ? match[1] : type.name;
    add(base);
    for (const axis of type.axes ?? []) {
      if (WHAT_AXES.has(axis.key) && (axis.suggested?.length ?? 0) >= 2) for (const v of axis.suggested) add(v.label);
    }
    if (match) for (const part of splitList(match[2])) add(part);
    for (const part of splitList(base)) add(part);
    [...names.values()].slice(0, MAX_PER_TYPE).forEach((name, i) => items.push({ id: `${type.id}#${i}`, name, typeId: type.id, departmentId: type.departmentId, kind: type.kind }));
  }
  return items;
}

const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : 0);

/**
 * @param {object[]} items  buildCatalogue()
 * @param {{ qualifies?: (a, b, typed: boolean) => boolean }} [opts]  override the pair test (a later change plugs its rule in the same way)
 */
export function runAudit(items = buildCatalogue(), opts = {}) {
  const qualifies = opts.qualifies ?? ((a, b, typed) => relevance(typed ? { name: a.name, productTypeId: a.typeId } : { name: a.name }, typed ? { name: b.name, productTypeId: b.typeId } : { name: b.name }).qualifies);
  const analysed = items.map((item) => ({ item, a: analyseName(item.name) }));

  // Goes well with: how many items land in a group that has partners.
  const group = (item, typed) => complementGroupOf(typed ? { name: item.name, productTypeId: item.typeId } : { name: item.name });
  const withPartners = (item, typed) => { const g = group(item, typed); return Boolean(g) && complementsOf(g).length > 0; };
  const goods = items.filter((i) => i.kind === "good");

  // Share of main (head) words the vocabulary knows.
  const heads = analysed.filter((x) => x.a.head);
  const known = heads.filter((x) => x.a.known);

  // Similar, same type: pairs of items of one type.
  const byType = new Map();
  for (const x of analysed) byType.set(x.item.typeId, [...(byType.get(x.item.typeId) ?? []), x]);
  let samePairs = 0, sameQualNameOnly = 0, sameQualTyped = 0, sameReachByWords = 0, sameReachTypedPool = 0;
  const reached = new Set();
  const total = new Set();
  for (const list of byType.values()) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const [p, q] = [list[i].item, list[j].item];
        samePairs += 1;
        total.add(p.id).add(q.id);
        const nameOnly = qualifies(p, q, false);
        if (nameOnly) sameQualNameOnly += 1;
        if (qualifies(p, q, true)) { sameQualTyped += 1; reached.add(p.id).add(q.id); }
        // Could the database's name-word net even fetch it? (the typed pool, 0143, fetches every one of these: counted below.)
        const terms = new Set(similarTerms(p.name));
        const sharesWord = terms.size > 0 && [...new Set(similarTerms(q.name))].some((t) => terms.has(t));
        if (sharesWord) sameReachByWords += 1;
        // With the typed pool (0143) the database also fetches every item of the same real type (not null, not "other") from other stores.
        if (sharesWord || !hasNoTypeEvidence(p.typeId)) sameReachTypedPool += 1;
      }
    }
  }

  // Wrong type: pairs of different types that still qualify. Different types can only qualify through the same head word, so the
  // pairs are found by head; a sample is re-checked against the real ranker below.
  const byHead = new Map();
  for (const x of analysed) if (x.a.head) byHead.set(x.a.head, [...(byHead.get(x.a.head) ?? []), x.item]);
  let wrongPairs = 0, wrongSameDept = 0, wrongGoodService = 0;
  const wrongItems = new Set();
  const wrongSamples = [];
  for (const list of byHead.values()) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const [p, q] = [list[i], list[j]];
        if (p.typeId === q.typeId) continue;
        if (!qualifies(p, q, true)) continue;
        wrongPairs += 1;
        if (p.departmentId === q.departmentId) wrongSameDept += 1;
        if ((p.kind === "service") !== (q.kind === "service")) wrongGoodService += 1;
        wrongItems.add(p.id).add(q.id);
        if (wrongSamples.length < 12 && p.departmentId !== q.departmentId) wrongSamples.push(`${p.name} [${p.typeId}] ~ ${q.name} [${q.typeId}]`);
      }
    }
  }

  return {
    items: items.length,
    types: new Set(items.map((i) => i.typeId)).size,
    services: items.filter((i) => i.kind === "service").length,
    goesWith: {
      itemsWithGroup: pct(items.filter((i) => withPartners(i, true)).length, items.length),
      itemsWithGroupNameOnly: pct(items.filter((i) => withPartners(i, false)).length, items.length),
      goodsWithGroup: pct(goods.filter((i) => withPartners(i, true)).length, goods.length)
    },
    vocabulary: { itemsWithHead: heads.length, headKnownPct: pct(known.length, heads.length) },
    sameType: {
      pairs: samePairs,
      recallNameOnlyPct: pct(sameQualNameOnly, samePairs),
      recallTypedPct: pct(sameQualTyped, samePairs),
      itemsWithASameTypeMatchPct: pct(reached.size, total.size),
      pairsFoundByNameWordsPct: pct(sameReachByWords, samePairs),
      pairsFetchedWithTypedPoolPct: pct(sameReachTypedPool, samePairs)
    },
    wrongType: { pairs: wrongPairs, sameDepartmentPairs: wrongSameDept, goodVsServicePairs: wrongGoodService, itemsShowingOne: wrongItems.size, itemsShowingOnePct: pct(wrongItems.size, items.length), examples: wrongSamples }
  };
}

export function toMarkdown(r) {
  const rows = [
    ["Items / types in the audit catalogue", `${r.items} / ${r.types} (${r.services} services)`],
    ["Goes well with: items with a partner group (name + type)", `${r.goesWith.itemsWithGroup}%`],
    ["Goes well with: items with a partner group (name only)", `${r.goesWith.itemsWithGroupNameOnly}%`],
    ["Goes well with: goods with a partner group (name + type)", `${r.goesWith.goodsWithGroup}%`],
    ["Vocabulary: main words it knows", `${r.vocabulary.headKnownPct}% of ${r.vocabulary.itemsWithHead}`],
    ["Similar: same-type pairs judged similar, name only", `${r.sameType.recallNameOnlyPct}% of ${r.sameType.pairs}`],
    ["Similar: same-type pairs judged similar, type passed", `${r.sameType.recallTypedPct}%`],
    ["Similar: items with at least one same-type match (type passed)", `${r.sameType.itemsWithASameTypeMatchPct}%`],
    ["Similar: same-type pairs the name-word net can fetch", `${r.sameType.pairsFoundByNameWordsPct}%`],
    ["Similar: same-type pairs fetched with the typed pool (0143)", `${r.sameType.pairsFetchedWithTypedPoolPct}%`],
    ["Wrong-type pairs that qualify (type passed)", `${r.wrongType.pairs} (${r.wrongType.sameDepartmentPairs} same department, ${r.wrongType.goodVsServicePairs} good vs service)`],
    ["Items that would show a wrong-type item", `${r.wrongType.itemsShowingOne} (${r.wrongType.itemsShowingOnePct}%)`]
  ];
  return ["| Measure | Value |", "|---|---|", ...rows.map(([k, v]) => `| ${k} | ${v} |`)].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runAudit();
  if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(toMarkdown(result));
    console.log("\nExamples of cross-department pairs that qualify:\n" + result.wrongType.examples.map((e) => `  ${e}`).join("\n"));
    console.log("\nSynthetic catalogue derived from scripts/seeds: not independent proof (see the header of this file).");
  }
}
