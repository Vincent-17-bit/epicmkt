import { getServerTime } from "../api/index.js";

const listeners = new Set();
let offset = 0;
let tick = 0;
let timer = null;

const snap = () => Math.floor((Date.now() + offset) / 1000) * 1000;

const schedule = () => {
  const wait = 1000 - ((Date.now() + offset) % 1000) + 8;
  timer = window.setTimeout(emit, wait);
};

function emit() {
  tick = snap();
  listeners.forEach((listener) => listener());
  if (listeners.size > 0) schedule();
  else timer = null;
}

const resume = () => {
  if (timer === null || document.visibilityState !== "visible") return;
  window.clearTimeout(timer);
  emit();
};

export const serverNow = () => Date.now() + offset;

export const getSnapshot = () => (timer === null ? snap() : tick);

export function subscribe(listener) {
  listeners.add(listener);
  if (timer === null) {
    tick = snap();
    schedule();
    document.addEventListener("visibilitychange", resume);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
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
    if (timer !== null) {
      window.clearTimeout(timer);
      emit();
    }
  } catch {
    return;
  }
}

export const clockOffset = () => offset;
