import { KINDS } from "./data/facetCatalog.js";
import { describe, searchProducts, stem } from "./search.js";
import { normalizeText } from "../utils.js";

const keyOf = (term) => normalizeText(term).split(" ").filter(Boolean).map(stem).sort().join(" ");
const pathOf = (value) => (typeof value === "string" && value ? value : typeof value?.url === "string" && value.url ? value.url : typeof value?.path === "string" && value.path ? value.path : null);
const pictured = (p) => pathOf(p.image) ?? pathOf(p.imagePath) ?? pathOf(p.imageUrl) ?? pathOf(p.images?.[0]) ?? null;

function entry(term, products, extra = {}, taken = new Set()) {
  const found = searchProducts(products, { q: term }, { pageSize: 8, itemsOnly: true });
  if (!found.total) return null;
  const free = found.items.filter((p) => !taken.has(p.id));
  const top = free.find((p) => pictured(p)) ?? free[0];
  if (!top) return null;
  return { term, ...extra, itemId: top.id, label: top.name, slug: top.slug, image: pictured(top), price: top.price ?? null };
}

export function tidyTrending(items, products, limit = 10) {
  const out = [];
  const seen = new Set();
  const pictures = new Set();
  const take = (candidate) => {
    const key = keyOf(candidate.term);
    if (!key || seen.has(key)) return;
    if (candidate.itemId && (!candidate.kind || candidate.kind === "product")) {
      if (pictures.has(candidate.itemId)) return;
      pictures.add(candidate.itemId);
    }
    seen.add(key);
    out.push(candidate);
  };
  for (const item of items ?? []) {
    if (out.length >= limit) break;
    // A store, a flash sale or a category was already checked live by the database (trending_lists). A store's name rarely matches a
    // product, so it is not looked up in the catalogue again; only a product word (or one of unknown kind) must still find something.
    if (item.kind && item.kind !== "product") {
      take({ ...item });
      continue;
    }
    const found = entry(item.term, products, { count: item.count, hot: item.hot }, pictures);
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
    const found = entry(term, products, { count: 0, hot: false, kind: "product" }, pictures);
    if (found && found.image) take(found);
  }
  return out;
}
