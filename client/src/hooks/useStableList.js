import { useRef } from "react";

/**
 * A list that never reshuffles under the person looking at it. `items` is the latest answer (a refetch, a page added); the result
 * keeps every item already on screen in the place it had, drops the ones that are gone, and puts new ones after them, in the
 * order they arrived. A different `listKey` (another filter or sort) starts a new list.
 */
export function useStableList(listKey, items, keyOf) {
  const kept = useRef({ key: listKey, order: [] });
  if (kept.current.key !== listKey) kept.current = { key: listKey, order: [] };
  const latest = new Map();
  for (const item of items) latest.set(keyOf(item), item);
  const result = [];
  for (const key of kept.current.order) {
    const item = latest.get(key);
    if (item) {
      result.push(item);
      latest.delete(key);
    }
  }
  for (const item of latest.values()) result.push(item);
  kept.current.order = result.map(keyOf);
  return result;
}
