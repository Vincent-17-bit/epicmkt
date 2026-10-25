import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/index.js";
import { BELL_KEY } from "../components/Layout.jsx";

export default function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids) => api.markRead(ids),
    onMutate: (ids) => {
      const stamp = new Date().toISOString();
      const cleared = new Set();
      qc.setQueriesData({ queryKey: ["messages"] }, (list) => {
        if (!Array.isArray(list)) return list;
        return list.map((m) => {
          if (m.readAt || (ids && !ids.includes(m.id))) return m;
          cleared.add(m.id);
          return { ...m, readAt: stamp };
        });
      });
      qc.setQueryData(BELL_KEY, (n) => (ids ? Math.max(0, (n ?? 0) - cleared.size) : 0));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["messages"] });
      qc.invalidateQueries({ queryKey: BELL_KEY });
    },
  });
}
