import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { items } from "../api/index.js";

// What shoppers search for, every kind ranked together (store, product, flash sale, category), as "popular this week" and "rising now".
// Used by the menu and the search panel. One list for everyone, wherever they are. An older response with only `items` is read as the popular list.
const TOP = 10;

export function useTrending({ enabled = true, refetch = true } = {}) {
  const query = useQuery({
    queryKey: ["trending"],
    queryFn: () => items.getTrending(),
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
  // and the one at the top is the one shown with the flame. Rising keeps the server's own order (it ranks by how fast a word is growing).
  const ranked = tab === "rising" ? rising : [...popular].sort((a, b) => Number(Boolean(a.filler)) - Number(Boolean(b.filler)) || (b.count ?? 0) - (a.count ?? 0) || String(a.term).localeCompare(String(b.term)));
  const list = ranked.slice(0, TOP);
  const real = list.filter((item) => !item.filler);
  const filler = list.filter((item) => item.filler);
  return { query, tab, setTab, list, real, filler, hasRising: rising.length > 0 };
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
