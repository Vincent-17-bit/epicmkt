import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { items } from "../api/index.js";

// Top searches: what shoppers search for, every kind ranked together (store, product, flash sale, category). One list. The ten with the
// most searches come first, the most searched at the top; a word that is also climbing fast carries its "rising" mark inside that
// list (`rising` is its place among the risers, 1 = fastest). Risers that are not among the ten are kept apart in `alsoRising`, so
// nothing that was growing is lost. Used by the menu and the search panel. An older response with only `items` is read as the popular list.
const TOP = 10;
const ALSO = 3;
export const byCount = (a, b) => Number(Boolean(a.filler)) - Number(Boolean(b.filler)) || (b.count ?? 0) - (a.count ?? 0) || (a.rank ?? 1e9) - (b.rank ?? 1e9) || String(a.term).localeCompare(String(b.term));
const keyOf = (item) => `${item.kind ?? "product"}:${String(item.term).toLowerCase()}`;

/** Pure: the server's two lists in, the one ranked list out. */
export function topSearches(data) {
  const popular = data?.popular ?? data?.items ?? [];
  const rising = (data?.rising ?? []).filter((item) => !item.filler);
  const places = new Map(rising.map((item, index) => [keyOf(item), index + 1]));
  const list = [...popular].sort(byCount).slice(0, TOP).map((item) => ({ ...item, rising: places.get(keyOf(item)) ?? 0 }));
  const shown = new Set(list.map(keyOf));
  const alsoRising = rising.filter((item) => !shown.has(keyOf(item))).slice(0, ALSO).map((item) => ({ ...item, rising: places.get(keyOf(item)) }));
  return { list, alsoRising };
}

export function useTrending({ enabled = true, refetch = true } = {}) {
  const query = useQuery({
    queryKey: ["trending"],
    queryFn: () => items.getTrending(),
    enabled,
    staleTime: 10 * 60_000,
    refetchInterval: enabled && refetch ? 10 * 60_000 : false,
    placeholderData: keepPreviousData
  });
  const { list, alsoRising } = topSearches(query.data);
  const real = list.filter((item) => !item.filler);
  return { query, list, real, alsoRising };
}

const isProduct = (item) => !item.kind || item.kind === "product";

// A product word shows the exact product it finds (its full name) rather than the word that was typed.
export const trendLabel = (item) => (isProduct(item) && item.label ? item.label : item.term);

// Where a trending row goes: a store opens its page, a product word opens the product it found, everything else opens the search for that word.
export const trendPath = (item, searchPath) => {
  if (item.kind === "store" && item.slug) return `/b/${item.slug}`;
  if (isProduct(item) && item.itemId && item.slug) return `/b/${item.slug}/i/${encodeURIComponent(item.itemId)}`;
  return searchPath;
};
