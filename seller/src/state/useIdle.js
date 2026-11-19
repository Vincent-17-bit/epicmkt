import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS, IDLE_OPTIONS, idleMinutes } from "@epicmkt/shared";

export { IDLE_OPTIONS, idleMinutes };
export const DEFAULT_IDLE = DEFAULT_SETTINGS.idle_minutes;
export const WARN_SECONDS = 60;


const EVENTS = ["pointerdown", "keydown", "touchstart", "wheel", "scroll"];

export function useIdle({ minutes, active, onTimeout }) {
  const [remaining, setRemaining] = useState(null);
  const last = useRef(Date.now());
  const timeout = useRef(onTimeout);
  timeout.current = onTimeout;
  const total = minutes * 60;
  const warning = remaining !== null;

  const bump = useCallback(() => {
    last.current = Date.now();
    setRemaining(null);
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    last.current = Date.now();
    const onActivity = () => {
      const idle = (Date.now() - last.current) / 1000;
      if (idle < total - WARN_SECONDS) last.current = Date.now();
    };
    EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true, capture: true }));
    const tick = setInterval(() => {
      const left = total - (Date.now() - last.current) / 1000;
      if (left <= 0) {
        clearInterval(tick);
        timeout.current();
      } else setRemaining(left <= WARN_SECONDS ? Math.ceil(left) : null);
    }, 1000);
    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, onActivity, { capture: true }));
      clearInterval(tick);
    };
  }, [active, total]);

  return { warning, remaining, stay: bump };
}
