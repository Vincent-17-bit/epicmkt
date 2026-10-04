import { useEffect, useState } from "react";
import { watchCard } from "../lib/viewport.js";

export function useCardLife(ref) {
  const [revealed, setRevealed] = useState(false);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    return watchCard(el, setRevealed, setAnimate);
  }, [ref]);

  return { revealed, animate };
}
