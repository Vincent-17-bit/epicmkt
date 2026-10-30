import { useCallback, useEffect, useRef, useState } from "react";

const THRESHOLD = 4;
const EDGE = 72;
const SPEED = 14;

const centerOf = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

export default function useTileDrag({ gridRef, onDrop, disabled = false }) {
  const [state, setState] = useState(null);
  const run = useRef(null);
  const raf = useRef(0);
  const speed = useRef(0);
  const drop = useRef(onDrop);
  drop.current = onDrop;

  const rects = () => {
    const grid = gridRef.current;
    if (!grid) return [];
    return [...grid.querySelectorAll("[data-tile]")].map((el) => ({ key: el.dataset.tile, rect: el.getBoundingClientRect() }));
  };

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    speed.current = 0;
    run.current = null;
    setState(null);
  }, []);

  const target = (x, y, list, fromKey) => {
    let best = null;
    for (const entry of list) {
      const c = centerOf(entry.rect);
      const d = Math.hypot(c.x - x, c.y - y);
      if (!best || d < best.d) best = { d, key: entry.key };
    }
    const to = list.findIndex((e) => e.key === best?.key);
    const from = list.findIndex((e) => e.key === fromKey);
    return { to: to < 0 ? from : to, from };
  };

  const measure = (x, y) => {
    const r = run.current;
    const dx = x - r.startX;
    const dy = y - r.startY;
    const list = rects().map((entry) => (entry.key === r.key
      ? { key: entry.key, rect: new DOMRect(entry.rect.x - dx, entry.rect.y - dy, entry.rect.width, entry.rect.height) }
      : entry));
    const { to, from } = target(x, y, list, r.key);
    const grid = gridRef.current.getBoundingClientRect();
    const tr = list[to]?.rect;
    const side = to > from ? "after" : "before";
    const indicator = tr && to !== from
      ? { left: (side === "before" ? tr.left : tr.right) - grid.left, top: tr.top - grid.top, height: tr.height }
      : null;
    return { to, from, indicator };
  };

  const loop = useCallback(() => {
    if (speed.current) window.scrollBy(0, speed.current);
    raf.current = requestAnimationFrame(loop);
  }, []);

  const move = useCallback((e) => {
    const r = run.current;
    if (!r || e.pointerId !== r.pointerId) return;
    const dx = e.clientX - r.startX;
    const dy = e.clientY - r.startY;
    if (!r.active) {
      if (Math.hypot(dx, dy) < THRESHOLD) return;
      r.active = true;
      raf.current = requestAnimationFrame(loop);
    }
    speed.current = e.clientY < EDGE ? -SPEED : e.clientY > window.innerHeight - EDGE ? SPEED : 0;
    const m = measure(e.clientX, e.clientY);
    r.to = m.to;
    setState({ key: r.key, dx, dy, to: m.to, indicator: m.indicator, active: true });
  }, [loop]);

  const end = useCallback((e) => {
    const r = run.current;
    if (!r || e.pointerId !== r.pointerId) return;
    const was = r.active;
    const { key, to } = r;
    stop();
    if (was && e.type === "pointerup") drop.current(key, to);
  }, [stop]);

  const live = state !== null;
  useEffect(() => {
    if (!live) return undefined;
    const onKey = (e) => { if (e.key === "Escape") stop(); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("keydown", onKey);
    };
  }, [live, move, end, stop]);

  useEffect(() => stop, [stop]);

  const begin = (key) => (e) => {
    if (disabled || (e.pointerType === "mouse" && e.button !== 0)) return;
    run.current = { key, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, active: false, to: -1 };
    setState({ key, dx: 0, dy: 0, to: -1, indicator: null, active: false });
  };

  return {
    dragKey: state?.active ? state.key : null,
    offset: state ? { x: state.dx, y: state.dy } : null,
    indicator: state?.indicator ?? null,
    handleProps: (key) => ({ onPointerDown: begin(key) }),
  };
}
