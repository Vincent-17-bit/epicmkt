import { getServerTime } from "../api/index.js";

const listeners = new Set();
let offset = 0;
let tick = 0;
let timer = null;

const snap = () => Math.floor((Date.now() + offset) / 1000) * 1000;

const emit = () => {
  tick = snap();
  listeners.forEach((listener) => listener());
};

export const serverNow = () => Date.now() + offset;

export const getSnapshot = () => (timer === null ? snap() : tick);

export function subscribe(listener) {
  listeners.add(listener);
  if (timer === null) {
    tick = snap();
    timer = window.setInterval(emit, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

export async function syncServerTime() {
  const sent = Date.now();
  try {
    const { now } = await getServerTime();
    const received = Date.now();
    offset = Date.parse(now) - (sent + received) / 2;
    if (timer !== null) emit();
  } catch {
    return;
  }
}

export const clockOffset = () => offset;
