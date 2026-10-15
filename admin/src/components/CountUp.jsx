import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./useReducedMotion.js";

const easeOut = (t) => 1 - (1 - t) ** 3;

/**
 * Counts from the previous value to `value`. Screen readers get the final number straight away
 * (the animated text is aria-hidden), so they never hear "1, 2, 3...". With reduced motion, or when
 * `duration` is 0, the final number is shown at once.
 */
export function CountUp({ value, duration = 800, format, locale = "en-KE", className, ...rest }) {
  const reduced = useReducedMotion();
  const target = Number.isFinite(Number(value)) ? Number(value) : 0;
  const fmt = format ?? ((n) => Math.round(n).toLocaleString(locale));
  const [shown, setShown] = useState(reduced || !duration ? target : 0);
  const from = useRef(reduced || !duration ? target : 0);

  useEffect(() => {
    if (reduced || !duration || typeof requestAnimationFrame !== "function") {
      from.current = target;
      setShown(target);
      return undefined;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const next = origin + (target - origin) * easeOut(t);
      from.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, reduced]);

  return (
    <span className={className} {...rest}>
      <span className="u-sr-only">{fmt(target)}</span>
      <span aria-hidden="true">{fmt(shown)}</span>
    </span>
  );
}
