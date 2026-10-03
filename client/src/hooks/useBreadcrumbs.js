import { useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getBusiness, getCategories, getSearchFacets, getTowns } from "../api/index.js";
import { getTrail } from "../utils/getTrail.js";

const STALE = 5 * 60_000;

export function useBreadcrumbs() {
  const { pathname, search } = useLocation();
  const queryClient = useQueryClient();
  const businessSlug = /^\/b\/([^/]+)/.exec(pathname)?.[1];
  const onCategory = /^\/c\/[^/]+$/.test(pathname);
  const wantsTown = onCategory && new URLSearchParams(search).has("town");

  const categories = useQuery({ queryKey: ["categories"], queryFn: getCategories, staleTime: STALE, enabled: onCategory || Boolean(businessSlug) });
  const towns = useQuery({ queryKey: ["towns"], queryFn: getTowns, staleTime: STALE, enabled: wantsTown });
  const business = useQuery({
    queryKey: ["business", businessSlug],
    queryFn: () => getBusiness(businessSlug),
    retry: false,
    enabled: Boolean(businessSlug)
  });

  const result = getTrail({
    pathname,
    search,
    categories: { status: categories.status, data: categories.data },
    towns: { status: towns.status, data: towns.data },
    business: { status: business.status, data: business.data }
  });

  const prefetch = useCallback(
    (crumb) => {
      const target = crumb?.to;
      if (!target) return;
      const [path] = target.split("?");
      const category = /^\/c\/([^/]+)$/.exec(path)?.[1];
      const biz = /^\/b\/([^/]+)$/.exec(path)?.[1];
      if (category) {
        queryClient.prefetchQuery({ queryKey: ["categories"], queryFn: getCategories, staleTime: STALE });
        queryClient.prefetchQuery({ queryKey: ["towns"], queryFn: getTowns, staleTime: STALE });
        queryClient.prefetchQuery({ queryKey: ["facets", "", category], queryFn: () => getSearchFacets({ query: "", categoryId: category }), staleTime: STALE });
      }
      if (biz) queryClient.prefetchQuery({ queryKey: ["business", biz], queryFn: () => getBusiness(biz), staleTime: STALE });
    },
    [queryClient]
  );

  return { ...result, prefetch };
}
