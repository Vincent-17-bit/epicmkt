import { useEffect } from "react";

// The one set of rules for every video customers see (the item gallery's stage, MediaVideo's player):
//   - Nothing ever autoplays: no `autoplay` attribute, and play() is only called from a person's tap on Play or a real
//     hover (below).
//   - Muted until the person turns sound on. Playing never unmutes.
//   - Hover preview (muted, from the start) only where the device has a real hover pointer, `(hover: hover)`, and the
//     person has not asked for reduced motion. Leaving pauses it.
//   - Only one video plays at a time: when one starts, every other one is paused.

const registry = new Set();

export const safePlay = (el) => {
  try {
    const result = el?.play?.();
    if (result && typeof result.catch === "function") result.catch(() => {});
  } catch {
    /* the browser refused; the person can tap Play */
  }
};

export const safePause = (el) => {
  try {
    el?.pause?.();
  } catch {
    /* nothing to pause */
  }
};

export const safeRewind = (el) => {
  try {
    if (el) el.currentTime = 0;
  } catch {
    /* not loaded yet */
  }
};

const matches = (query) => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;

// Checked at the moment of hovering, so a changed setting or a docked tablet is respected without a reload.
export const canHoverPreview = () => matches("(hover: hover)") && !matches("(prefers-reduced-motion: reduce)");

/** Registers a <video> so that starting it pauses all the others. */
export function useExclusivePlayback(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    el.muted = true; // the muted *property* is what browsers honour; React does not always reflect the attribute
    registry.add(el);
    const onPlay = () => registry.forEach((other) => other !== el && safePause(other));
    el.addEventListener("play", onPlay);
    return () => {
      el.removeEventListener("play", onPlay);
      registry.delete(el);
    };
  }, [ref]);
}
