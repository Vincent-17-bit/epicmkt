import { useCallback, useEffect, useState } from "react";

/** A countdown in whole seconds: start(30) counts 30, 29, ... 0 and then stops. Used to say how long to wait before asking for another code. */
export function useCountdown() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return undefined;
    const t = setTimeout(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(t);
  }, [left]);
  const start = useCallback((seconds) => setLeft(Math.max(0, Math.ceil(Number(seconds) || 0))), []);
  return { left, start };
}

/** 75 -> "1 minute 15 seconds", 3600 -> "1 hour", 45 -> "45 seconds". */
export function waitText(seconds) {
  const s = Math.max(1, Math.round(seconds));
  if (s >= 3600) { const h = Math.round(s / 3600); return `${h} hour${h === 1 ? "" : "s"}`; }
  if (s >= 120) return `${Math.ceil(s / 60)} minutes`;
  if (s >= 60) return `1 minute${s % 60 ? ` ${s % 60} second${s % 60 === 1 ? "" : "s"}` : ""}`;
  return `${s} second${s === 1 ? "" : "s"}`;
}
