import { useCallback, useEffect, useState } from "react";

// Counts down from `seconds` after start() so "Send again" cannot be spammed.
export function useCooldown(seconds = 60) {
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (left <= 0) return undefined;
    const timer = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);

  const start = useCallback(() => setLeft(seconds), [seconds]);
  return [left, start];
}
