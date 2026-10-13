import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { serializeHours, serializeException } from "@epicmkt/shared/hours";
import * as api from "../../api/index.js";
import { KEYS } from "./queries.js";

export function useHoursActions() {
  const qc = useQueryClient();
  return useMemo(() => {
    const current = () => qc.getQueryData(KEYS.hours);
    const patch = (p) => qc.setQueryData(KEYS.hours, (c) => (c ? { ...c, ...p } : c));
    return {
      current,
      reload: () => qc.fetchQuery({ queryKey: KEYS.hours, queryFn: api.getHours, staleTime: 0 }),
      async saveWeek(hours, version) {
        const r = await api.saveHours({ businessId: current().businessId, hours: serializeHours(hours), version });
        patch({ hours: r.hours, hours_version: r.hours_version });
        return r;
      },
      async saveExceptions(list) {
        const c = current();
        const r = await api.saveExceptions({ businessId: c.businessId, exceptions: list.map(serializeException), version: c.hours_version });
        patch({ exceptions: r.exceptions, hours_version: r.hours_version });
        return r;
      },
      async setOverride(override) {
        const r = await api.setClosureOverride({ businessId: current().businessId, override });
        patch({ override: r.override });
        return r.override;
      },
      async setPartial(scope, closure) {
        const r = await api.setPartialClosure({ businessId: current().businessId, scope, closure });
        patch({ partial_closures: r.partial_closures });
        return r.partial_closures;
      }
    };
  }, [qc]);
}
