import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { items } from "../api/index.js";
import { countyOfTown } from "../lib/county.js";
import { useGeoStore } from "../stores/geo.js";

// What shoppers search for, every kind ranked together (store, product, flash sale, category), as "popular this week" and "rising now".
// Used by the menu and the search panel. It follows the town the shopper chose: their county's list when it has enough searches of
// its own, otherwise the national one (the server says which). An older response with only `items` is read as the popular list.
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
  const list = (tab === "rising" ? rising : popular).slice(0, 10);
  let scopeNote = null;
  if (county && data && !data.live) {
    if (data.fallback === "national") scopeNote = `Not many searches in ${county} yet, showing all of Kenya`;
    else if (data.scope && data.scope !== "*") scopeNote = `Trending in ${county}`;
  }
  return { query, county, tab, setTab, list, hasRising: rising.length > 0, scopeNote };
}

// Where a trending row goes: a store opens its page, everything else opens the search for that word.
export const trendPath = (item, searchPath) => (item.kind === "store" && item.slug ? `/b/${item.slug}` : searchPath);
