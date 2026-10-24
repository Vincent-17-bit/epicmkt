import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getFeaturedBusinesses, items } from "../api/index.js";
import { rotationWindowSeed } from "../lib/rotation.js";
import { seenMemory } from "../lib/seen.js";
import { FEATURED_COUNT, FEATURED_POOL, PRODUCT_POOL, createShowcasePicker, pickStores } from "../lib/showcase.js";

/**
 * The stores and products for the home page's featured section. A pool of featured stores comes from the server,
 * shuffled; this picks the ones not shown lately, then asks for a small random window of products for just those
 * stores and picks four each, again favouring what has not been shown. Picks are made when the section appears, so
 * every visit shows something different, and are recorded so the next visit moves on.
 */
export function useFeaturedShowcase({ count = FEATURED_COUNT } = {}) {
  const seed = rotationWindowSeed();

  const pool = useQuery({
    queryKey: ["featured-pool", FEATURED_POOL, seed],
    queryFn: () => getFeaturedBusinesses({ limit: FEATURED_POOL, seed }),
    staleTime: 60_000
  });

  const stores = useMemo(() => (pool.data ? pickStores(pool.data, { seen: seenMemory(), count }) : []), [pool.data, count]);
  const ids = useMemo(() => stores.map((store) => store.id), [stores]);

  const products = useQuery({
    queryKey: ["showcase-products", PRODUCT_POOL, ...[...ids].sort()],
    queryFn: () => items.getShowcase(ids, { pool: PRODUCT_POOL }),
    enabled: ids.length > 0,
    staleTime: 60_000
  });

  const picker = useMemo(() => createShowcasePicker({ seen: seenMemory() }), [products.data]);

  const cards = useMemo(
    () =>
      stores.map((store) => ({
        store,
        products: products.data ? picker.productsFor(store.id, products.data[store.id]?.items ?? []) : []
      })),
    [stores, products.data, picker]
  );

  useEffect(() => {
    seenMemory().mark("b", ids);
  }, [ids]);

  useEffect(() => {
    if (products.data) picker.commit();
  }, [products.data, picker]);

  return {
    cards,
    isPending: pool.isPending,
    isError: pool.isError,
    productsPending: ids.length > 0 && products.isPending,
    refetch: pool.refetch
  };
}
