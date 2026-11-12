import { useSyncExternalStore } from "react";

let more = false;
const listeners = new Set();
const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const setMoreDetails = (value) => {
  more = value;
  listeners.forEach((fn) => fn());
};

export const useMoreDetails = () => [useSyncExternalStore(subscribe, () => more), setMoreDetails];
