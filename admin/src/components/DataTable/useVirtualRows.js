import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { buildOffsets, visibleRange } from "../../lib/virtual.js";

/**
 * Draws only the rows near the visible part of a scrolling box.
 *
 *   const { start, end, padTop, padBottom, total } = useVirtualRows({ count, estimate: 56, scrollRef, getKey });
 *
 * Rows are measured after they render (so cards that wrap onto more lines are handled), and sizes are remembered by
 * key. `estimate` is used for rows not yet seen. Change `resetKey` when the layout changes (density, table to cards)
 * to forget the old measurements. Put `data-vkey={key}` on each rendered row and attach `contentRef` to the element
 * that holds them, so a row that grows later (a font loading, text wrapping) is picked up.
 */
export function useVirtualRows({ count, estimate, overscan = 6, scrollRef, getKey, resetKey }) {
  const [view, setView] = useState({ top: 0, height: 640 });
  const [version, setVersion] = useState(0);
  const sizes = useRef(new Map());
  const contentRef = useRef(null);

  // Scroll position and box height, at most once per frame.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    let frame = 0;
    const read = () => {
      frame = 0;
      setView((prev) => (prev.top === el.scrollTop && prev.height === el.clientHeight ? prev : { top: el.scrollTop, height: el.clientHeight }));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(read); };
    read();
    el.addEventListener("scroll", schedule, { passive: true });
    const resize = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    resize?.observe(el);
    return () => { el.removeEventListener("scroll", schedule); resize?.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, [scrollRef]);

  useEffect(() => { sizes.current = new Map(); setVersion((v) => v + 1); }, [resetKey, estimate]);

  const offsets = useMemo(
    () => buildOffsets(count, (i) => sizes.current.get(getKey(i)) ?? estimate),
    // `version` stands for "the measurements changed"
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [count, estimate, version, getKey],
  );
  const range = visibleRange(offsets, view.top, view.height, overscan);

  const measure = useCallback(() => {
    const host = contentRef.current;
    if (!host) return;
    let changed = false;
    for (const el of host.querySelectorAll("[data-vkey]")) {
      const height = el.getBoundingClientRect().height;
      const key = el.dataset.vkey;
      if (height > 0 && Math.abs((sizes.current.get(key) ?? -1) - height) > 0.5) { sizes.current.set(key, height); changed = true; }
    }
    if (changed) setVersion((v) => v + 1);
  });

  // After every render, read the real heights of the drawn rows.
  useLayoutEffect(() => { measure(); });
  useEffect(() => {
    const host = contentRef.current;
    if (!host || typeof ResizeObserver !== "function") return undefined;
    const watch = new ResizeObserver(() => measure());
    watch.observe(host);
    return () => watch.disconnect();
  }, [measure, range.total > 0]);

  return { ...range, contentRef };
}
