import { useCallback, useEffect, useRef, useState } from "react";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * A horizontal strip that scrolls with snap points (swipe on a phone, arrows elsewhere). Its children are the slides.
 *   ref              put it on the scrolling element
 *   index            the slide nearest the start (the one go() chose last, while the strip has no layout yet)
 *   go(i)            scroll so slide i is at the start (clamped)
 *   prevOff/nextOff  whether the arrows have nowhere to go
 *   arrows           false when every slide already fits, so arrows would do nothing
 */
export function useScroller(count) {
  const ref = useRef(null);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState({ laidOut: false, scrollable: false, atStart: true, atEnd: true });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const laidOut = el.clientWidth > 0;
    const scrollable = el.scrollWidth > el.clientWidth + 2;
    if (laidOut && scrollable) {
      let best = 0;
      let dist = Infinity;
      [...el.children].forEach((k, i) => {
        const d = Math.abs(k.offsetLeft - el.offsetLeft - el.scrollLeft);
        if (d < dist) { dist = d; best = i; }
      });
      setIndex(best);
    }
    setBox({ laidOut, scrollable, atStart: el.scrollLeft <= 2, atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let frame = 0;
    const onScroll = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onScroll) : null;
    ro?.observe(el);
    measure();
    return () => { el.removeEventListener("scroll", onScroll); ro?.disconnect(); cancelAnimationFrame(frame); };
  }, [measure, count]);

  const go = useCallback((i) => {
    const el = ref.current;
    const to = Math.max(0, Math.min(count - 1, i));
    setIndex(to);
    const kid = el?.children?.[to];
    if (!el || !kid) return;
    const left = kid.offsetLeft - el.offsetLeft;
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
