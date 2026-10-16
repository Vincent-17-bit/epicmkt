import { useSyncExternalStore } from "react";

/** True while the media query matches, and updates when it changes. False on the server and where matchMedia is missing. */
export function useMediaQuery(query) {
  return useSyncExternalStore(
    (notify) => {
      if (typeof matchMedia !== "function") return () => {};
      const list = matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => (typeof matchMedia === "function" ? matchMedia(query).matches : false),
    () => false,
  );
}
