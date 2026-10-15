import { useQuery } from "@tanstack/react-query";
import { getDashboard, getNotifications } from "../api/index.js";
import { useAuth } from "../auth/AuthProvider.jsx";

/** Everything on the Command Center except the counts (those come from useAdminCounts, shared with the sidebar). */
export function useDashboard() {
  const { status } = useAuth();
  return useQuery({ queryKey: ["dashboard"], queryFn: getDashboard, enabled: status === "ready", refetchInterval: 120_000, staleTime: 30_000 });
}

/** The newest notifications and the unread count: the bell, the drawer and the live activity feed all read this one query. */
export function useNotifications() {
  const { status } = useAuth();
  return useQuery({ queryKey: ["notifications"], queryFn: () => getNotifications({ limit: 30 }), enabled: status === "ready", refetchInterval: 120_000, staleTime: 15_000 });
}
