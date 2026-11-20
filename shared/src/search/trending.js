import { KINDS } from "./data/facetCatalog.js";
import { describe, searchProducts, stem } from "./search.js";
import { normalizeText } from "../utils.js";

const keyOf = (term) => normalizeText(term).split(" ").filter(Boolean).map(stem).sort().join(" ");
const pictured = (p) => p.image ?? p.images?.[0] ?? null;

function entry(term, products, extra = {}) {
  const found = searchProducts(products, { q: term }, { pageSize: 8, itemsOnly: true });
  if (!found.total) return null;
  const top = found.items.find((p) => pictured(p)) ?? found.items[0];
  return { term, ...extra, itemId: top.id, label: top.name, slug: top.slug, image: pictured(top), price: top.price ?? null };
}

export function tidyTrending(items, products, limit = 10) {
  const out = [];
  const seen = new Set();
  const take = (candidate) => {
    const key = keyOf(candidate.term);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(candidate);
  };
  for (const item of items ?? []) {
    if (out.length >= limit) break;
    const found = entry(item.term, products, { count: item.count, hot: item.hot });
    if (found) take({ ...item, ...found, image: found.image ?? item.image ?? null });
  }
  if (out.length >= limit) return out;
  const tally = new Map();
  for (const p of products) {
    const kind = describe(p).kind;
    if (kind) tally.set(kind.id, (tally.get(kind.id) ?? 0) + 1);
  }
  const noun = new Map(KINDS.map((k) => [k.id, k.noun]));
  const ranked = [...tally].sort((a, b) => b[1] - a[1]).map(([id]) => noun.get(id)).filter(Boolean);
  for (const term of ranked) {
    if (out.length >= limit) break;
    const found = entry(term, products, { count: 0, hot: false });
    if (found && found.image) take(found);
  }
  return out;
}
