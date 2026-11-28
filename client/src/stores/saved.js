import { useSyncExternalStore } from "react";
import { savedList } from "../lib/savedList.js";

const subscribe = (fn) => savedList().subscribe(fn);
const snapshot = () => savedList().getSnapshot();

/** Reads one value from the Saved list. Only components whose selected value changed re-render. Select primitives or stable references. */
export function useSaved(selector = (s) => s) {
  return selector(useSyncExternalStore(subscribe, snapshot, snapshot));
}

export const useSavedCount = () => useSaved((s) => s.count);
export const useIsSaved = (itemId, optionParam) => useSaved((s) => (optionParam === undefined ? s.entries.some((e) => e.itemId === itemId) : s.entries.some((e) => e.key === `${itemId}|${optionParam || ""}`)));
