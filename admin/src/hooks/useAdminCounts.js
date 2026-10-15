import { useQuery } from "@tanstack/react-query";
import { getAdminCounts } from "../api/index.js";
import { useAuth } from "../auth/AuthProvider.jsx";

/** The numbers behind the sidebar badges and the bell. Refreshes every minute and when the tab regains focus. */
export function useAdminCounts() {
  const { status } = useAuth();
  return useQuery({
    queryKey: ["admin-counts"],
    queryFn: getAdminCounts,
    enabled: status === "ready",
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
