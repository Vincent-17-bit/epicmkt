import { getServerTime } from "../api/index.js";

const MAX_ROUND_TRIP_MS = 4000;
const WAKE_EVENTS = ["visibilitychange", "pageshow", "focus"];

const listeners = new Set();
let offset = 0;
let synced = false;
let tick = 0;
let timer = null;
let pending = null;

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

export const isSynced = () => synced;

export const getSnapshot = () => (timer === null ? snap() : tick);

export function subscribe(listener) {
  listeners.add(listener);
  if (timer === null) {
    tick = snap();
    schedule();
    WAKE_EVENTS.forEach((name) => (name === "visibilitychange" ? document : window).addEventListener(name, resume));
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      window.clearTimeout(timer);
      WAKE_EVENTS.forEach((name) => (name === "visibilitychange" ? document : window).removeEventListener(name, resume));
      timer = null;
    }
  };
}

export function syncServerTime() {
  if (pending) return pending;
  pending = (async () => {
    const sent = Date.now();
    try {
      const { now } = await getServerTime();
      const received = Date.now();
      const server = Date.parse(now);
      if (!Number.isFinite(server) || received < sent) return;
      if (synced && received - sent > MAX_ROUND_TRIP_MS) return;
      offset = server - (sent + received) / 2;
      synced = true;
      if (timer !== null) {
        window.clearTimeout(timer);
        emit();
      }
    } catch {
      return;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

export const clockOffset = () => offset;

export function resetClock() {
  offset = 0;
  synced = false;
  pending = null;
}
