import { useEffect, useState } from "react";
import * as api from "../api/index.js";
import { serverNow, setServerOffset } from "./clock.js";

const SYNC_MS = 5 * 60 * 1000;

export async function syncServerClock() {
  const sent = Date.now();
  try {
    const { now } = await api.getServerTime();
    setServerOffset(Date.parse(now) - (sent + Date.now()) / 2);
  } catch {
    return;
  }
}

export function useServerClock() {
  useEffect(() => {
    syncServerClock();
    const timer = window.setInterval(syncServerClock, SYNC_MS);
    const wake = () => document.visibilityState === "visible" && syncServerClock();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", syncServerClock);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", syncServerClock);
    };
  }, []);
}

export function useServerNow() {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const tick = () => setNow(serverNow());
    const timer = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("pageshow", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("pageshow", tick);
    };
  }, []);
  return now;
}
