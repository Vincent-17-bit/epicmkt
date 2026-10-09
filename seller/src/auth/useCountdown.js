import { useCallback, useEffect, useRef, useState } from "react";

export function useCountdown() {
  const target = useRef(0);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.ceil((target.current - Date.now()) / 1000)));
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, []);

  const start = useCallback((seconds) => {
    target.current = Date.now() + seconds * 1000;
    setLeft(Math.ceil(seconds));
  }, []);

  return [left, start];
}
