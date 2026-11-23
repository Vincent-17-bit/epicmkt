import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { items } from "../api/index.js";
import { countyOfTown } from "../lib/county.js";
import { useGeoStore } from "../stores/geo.js";

// What shoppers search for, every kind ranked together (store, product, flash sale, category), as "popular this week" and "rising now".
// Used by the menu and the search panel. It follows the town the shopper chose: their county's list when it has enough searches of
// its own, otherwise the national one (the server says which). An older response with only `items` is read as the popular list.
const TOP = 10;

export function useTrending({ enabled = true, refetch = true } = {}) {
  const county = countyOfTown(useGeoStore((s) => s.town));
  const query = useQuery({
    queryKey: ["trending", county],
    queryFn: () => items.getTrending(county),
    enabled,
    staleTime: 10 * 60_000,
    refetchInterval: enabled && refetch ? 10 * 60_000 : false,
    placeholderData: keepPreviousData
  });
  const [chosen, setTab] = useState("popular");
  const data = query.data;
  const popular = data?.popular ?? data?.items ?? [];
  const rising = data?.rising ?? [];
  const tab = chosen === "rising" && rising.length > 0 ? "rising" : "popular";
  // Most searched first, whatever order the server sent: the top ten are the ten with the highest search counts (ties alphabetical),
  // and the flame goes to the one at the top. Rising keeps the server's own order (it ranks by how fast a word is growing).
  const ranked = tab === "rising" ? rising : [...popular].sort((a, b) => Number(Boolean(a.filler)) - Number(Boolean(b.filler)) || (b.count ?? 0) - (a.count ?? 0) || String(a.term).localeCompare(String(b.term)));
  const list = ranked.slice(0, TOP).map((item, index) => ({ ...item, top: index === 0 && !item.filler }));
  let scopeNote = null;
  if (county && data && !data.live) {
    if (data.fallback === "national") scopeNote = `Not many searches in ${county} yet, showing all of Kenya`;
    else if (data.scope && data.scope !== "*") scopeNote = `Trending in ${county}`;
  }
  const real = list.filter((item) => !item.filler);
  const filler = list.filter((item) => item.filler);
  return { query, county, tab, setTab, list, real, filler, hasRising: rising.length > 0, scopeNote };
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
