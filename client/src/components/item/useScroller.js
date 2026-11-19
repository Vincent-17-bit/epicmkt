import { useCallback, useEffect, useRef, useState } from "react";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const SETTLE_MS = 140;   // no scroll event for this long = the scroll has stopped (browsers without the scrollend event)

// Where slide `kid` starts inside the strip `el`, in the strip's own scroll coordinates (snap padding taken off). Rectangles, not
// offsetLeft, so it does not matter which ancestor is positioned.
const startOf = (el, kid) => {
  const pad = Number.parseFloat(getComputedStyle(el).scrollPaddingInlineStart) || 0;
  return kid.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft - pad;
};

const nearestOf = (el) => {
  let best = 0;
  let dist = Infinity;
  [...el.children].forEach((kid, i) => {
    const d = Math.abs(startOf(el, kid) - el.scrollLeft);
    if (d < dist) { dist = d; best = i; }
  });
  return best;
};

/**
 * A horizontal strip that scrolls with snap points (swipe on a phone, arrows elsewhere). Its children are the slides.
 *   ref              put it on the scrolling element
 *   index            the slide nearest the start (the one go() chose, while it scrolls there or while the strip has no layout)
 *   go(i)            scroll so slide i is at the start (clamped)
 *   prevOff/nextOff  whether the arrows have nowhere to go
 *   arrows           false when every slide already fits, so arrows would do nothing
 *
 * While go() scrolls, `index` stays on the slide it was asked for (the arrows do not flicker through the slides it passes); a swipe
 * updates it as the strip moves.
 */
export function useScroller(count) {
  const ref = useRef(null);
  const heading = useRef(null);   // the slide go() is scrolling to, until the scroll stops
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState({ laidOut: false, scrollable: false, atStart: true, atEnd: true });

  const measure = useCallback((settled = false) => {
    const el = ref.current;
    if (!el) return;
    const laidOut = el.clientWidth > 0;
    const scrollable = el.scrollWidth > el.clientWidth + 2;
    if (settled) heading.current = null;
    if (laidOut && scrollable && heading.current === null) setIndex(nearestOf(el));
    const next = { laidOut, scrollable, atStart: el.scrollLeft <= 2, atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 };
    setBox((prev) => (prev.laidOut === next.laidOut && prev.scrollable === next.scrollable && prev.atStart === next.atStart && prev.atEnd === next.atEnd ? prev : next));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let frame = 0;
    let timer = 0;
    const settle = () => { clearTimeout(timer); measure(true); };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => measure(false));
      clearTimeout(timer);
      timer = setTimeout(settle, SETTLE_MS);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("scrollend", settle);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measure(false)) : null;
    ro?.observe(el);
    measure(false);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("scrollend", settle);
      ro?.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [measure, count]);

  const go = useCallback((i) => {
    const el = ref.current;
    const to = Math.max(0, Math.min(count - 1, i));
    setIndex(to);
    const kid = el?.children?.[to];
    if (!el || !kid) return;
    const left = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, startOf(el, kid)));
    if (Math.abs(left - el.scrollLeft) < 2) return;   // already there: no scroll will come to clear `heading`
    heading.current = to;
    if (typeof el.scrollTo === "function") el.scrollTo({ left, behavior: reduced() ? "auto" : "smooth" });
    else el.scrollLeft = left;
  }, [count]);

  const onKeyDown = useCallback((e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); }
  }, [go, index]);

  // With a real layout the arrows follow the scroll position; before layout (or in tests) they follow the index.
  const live = box.laidOut && box.scrollable;
  return {
    ref, index, go, onKeyDown,
    prevOff: live ? box.atStart : index <= 0,
    nextOff: live ? box.atEnd : index >= count - 1,
    arrows: count > 1 && (!box.laidOut || box.scrollable)
  };
}
