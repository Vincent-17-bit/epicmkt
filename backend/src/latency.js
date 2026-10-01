import { sleep } from "@epicmkt/shared";
import { store } from "./store.js";

export const delay = () => {
  const { min, max } = store.latency;
  return sleep(min + Math.random() * (max - min));
};

export const setLatency = (min, max = min) => {
  store.latency = { min, max };
};
