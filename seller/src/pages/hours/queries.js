import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { resolveHoursDefaults } from "@epicmkt/shared/hours";
import * as api from "../../api/index.js";

export const KEYS = { hours: ["seller", "hours"], settings: ["seller", "hours-settings"] };

export const useHoursQuery = () => useQuery({ queryKey: KEYS.hours, queryFn: api.getHours });

export function useHoursDefaults() {
  const q = useQuery({ queryKey: KEYS.settings, queryFn: api.getHoursSettings, staleTime: 60000 });
  return useMemo(() => resolveHoursDefaults(q.data), [q.data]);
}
