import { useCallback, useSyncExternalStore } from "react";

const match = (query) => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query) : null);

export function useMediaQuery(query) {
  // Stable per query: a new function every render makes React unsubscribe and resubscribe on each render.
  const subscribe = useCallback(
    (notify) => {
      const list = match(query);
      list?.addEventListener?.("change", notify);
      return () => list?.removeEventListener?.("change", notify);
    },
    [query]
  );
  const getSnapshot = useCallback(() => match(query)?.matches ?? false, [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
