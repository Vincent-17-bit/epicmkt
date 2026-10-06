import { useQuery } from "@tanstack/react-query";
import { getCatalogPricing } from "../../api/applications/index.js";

export function useCatalog() {
  const query = useQuery({
    queryKey: ["catalog-pricing"],
    queryFn: getCatalogPricing,
    staleTime: 60_000,
    gcTime: 0,
    refetchOnWindowFocus: true,
    retry: 1
  });
  const catalog = query.isError ? null : query.data ?? null;
  return {
    catalog,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    category: (id) => catalog?.categories.find((c) => c.id === id) ?? null
  };
}
