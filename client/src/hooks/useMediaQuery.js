import { useSyncExternalStore } from "react";

const match = (query) => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query) : null);

export function useMediaQuery(query) {
  const subscribe = (notify) => {
    const list = match(query);
    list?.addEventListener?.("change", notify);
    return () => list?.removeEventListener?.("change", notify);
  };
  return useSyncExternalStore(
    subscribe,
    () => match(query)?.matches ?? false,
    () => false
  );
}
