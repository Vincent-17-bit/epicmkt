import { useQuery } from "@tanstack/react-query";
import { flash } from "../api/index.js";
import { useGeoStore } from "../stores/geo.js";
import { useLiveSales } from "./useCountdown.js";

const EMPTY = [];

export function useFlashStrip({ businessId = null, categoryId = null, limit = 10 } = {}) {
  const coords = useGeoStore((s) => s.coords);
  const query = useQuery({
    queryKey: ["flash-strip", businessId, categoryId, limit, coords?.lat ?? null, coords?.lng ?? null],
    queryFn: () => flash.list({ businessId, categoryId, limit, sort: "ending", origin: coords ?? null }),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true
  });
  const live = useLiveSales(query.data?.items ?? EMPTY);
  return { ...query, entries: live, total: query.data?.total ?? 0 };
}
