import { useQuery } from "@tanstack/react-query";
import { api } from "../api/index.js";

// The signed-in admin's role (owner, reviewer, finance, support), or null while unknown. The database re-checks it on
// every action; this only decides which buttons to offer.
export function useAdminRole() {
  const { data } = useQuery({ queryKey: ["admin-role"], queryFn: () => api.getAdminRole(), staleTime: 5 * 60_000 });
  return data ?? null;
}
