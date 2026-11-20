import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./HoverZoom.module.css";

export const HOVER_ZOOM_DEFAULTS = {
  scale: 2,
  width: 560,
  height: null,
  gap: 16,
  lensColor: "#3b82f6",
  lensOpacity: 0.18,
  lensBorder: "#1d4ed8",
  borderColor: null,
  lensBorderDark: "#93c5fd",
  background: "#ffffff",
  minWidth: 1024
};

const sizes = new Map();
const failed = new Set();
const listeners = new Set();
const warm = (url) => {
  if (!url || sizes.has(url) || typeof Image === "undefined") return;
  sizes.set(url, null);
  const img = new Image();
  img.decoding = "async";
  img.fetchPriority = "low";
  img.onload = () => sizes.set(url, VECTOR.test(url) ? Infinity : img.naturalWidth || null);
  img.onerror = () => {
    sizes.set(url, null);
    failed.add(url);
    listeners.forEach((fn) => fn());
  };
  img.src = url;
};
const NO_ZOOM = 1.15;
const VECTOR = /^data:image\/svg|\.svg(\?|$)/i;

const SMOOTH = 0.22;
const FINE_HOVER = "(hover: hover) and (pointer: fine)";

export function zoomPlan({ area, roomWidth, roomHeight, scale, real, dpr = 1 }) {
  const sharp = real ? real / (area.width * dpr) : Infinity;
  if (sharp < NO_ZOOM) return null;
  const fitted = sharp < scale ? sharp : Math.max(scale, roomWidth / area.width, roomHeight / area.height);
  return { scale: fitted, width: Math.min(roomWidth, area.width * fitted), height: Math.min(roomHeight, area.height * fitted) };
}

function contentRect(img) {
  const box = img.getBoundingClientRect();
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (!nw || !nh || !box.width || !box.height) return null;
  const fit = Math.min(box.width / nw, box.height / nh);
  const w = nw * fit;
  const h = nh * fit;
  return { left: box.left + (box.width - w) / 2, top: box.top + (box.height - h) / 2, width: w, height: h };
}

/**
 * Amazon-style hover zoom. Put it inside a `position: relative` photo box: while the pointer is over that box a lens
 * follows it and a magnified pane appears beside the box, floating over the page, so nothing on the page moves.
 *   src: the large picture of the photo being shown; fallback: the original url, used when src cannot be loaded
 *   scale, width, height (px; height defaults to the photo box's height), gap (px), lensColor (fill), lensOpacity, lensBorder, borderColor,
 *   background, minWidth (viewport px below which it stays off): see HOVER_ZOOM_DEFAULTS.
 * The pane takes the left and width of the nearest [data-zoom-fit] element in the same layout (the item's info column); without one it
 * uses `width` and `gap`.

 * A photo too small to stay sharp at the set scale gets a lower scale and a smaller pane; one that cannot be magnified at all gets no zoom.
 * Off on touch screens and narrow windows, where there is no hover or no room beside the photo.
 */
export default function HoverZoom({ src: wanted, fallback = null, options }) {
  const o = { ...HOVER_ZOOM_DEFAULTS, ...options };
  const lensRef = useRef(null);
  const paneRef = useRef(null);
  const anchorRef = useRef(null);
  const [pane, setPane] = useState(null);
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  const src = failed.has(wanted) && fallback ? fallback : wanted;
  const srcRef = useRef(src);
  srcRef.current = src;
  const optRef = useRef(o);
  optRef.current = o;

  useEffect(() => {
    const host = anchorRef.current?.parentElement;
    if (!host || typeof window === "undefined" || !window.matchMedia) return undefined;
    let geo = null;
    let frame = 0;
    const place = () => {
      if (!geo) return;
      const { area, hostBox, scale, cx, cy } = geo;
      const lens = lensRef.current;
      if (lens) {
        lens.style.left = `${cx - hostBox.left}px`;
        lens.style.top = `${cy - hostBox.top}px`;
      }
      if (paneRef.current) paneRef.current.style.backgroundPosition = `${-(cx - area.left) * scale}px ${-(cy - area.top) * scale}px, ${-(cx - area.left) * scale}px ${-(cy - area.top) * scale}px`;
    };
    const glide = () => {
      frame = 0;
      if (!geo) return;
      const dx = geo.tx - geo.cx;
      const dy = geo.ty - geo.cy;
      if (Math.abs(dx) < 0.3 && Math.abs(dy) < 0.3) {
        geo.cx = geo.tx;
        geo.cy = geo.ty;
        place();
        return;
      }
      geo.cx += dx * SMOOTH;
      geo.cy += dy * SMOOTH;
      place();
      frame = requestAnimationFrame(glide);
    };
    const hide = () => {
      geo = null;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (lensRef.current) lensRef.current.style.display = "none";
      setPane(null);
    };
    const move = (event) => {
      const cfg = optRef.current;
      if (!window.matchMedia(FINE_HOVER).matches || window.innerWidth < cfg.minWidth) return hide();
      const img = host.querySelector('[tabindex="0"] img') ?? host.querySelector("img");
      const area = img ? contentRect(img) : null;
      if (!area) return hide();
      const hostBox = host.getBoundingClientRect();
      const fit = host.closest("[data-variant]")?.querySelector("[data-zoom-fit]")?.getBoundingClientRect();
      const beside = Boolean(fit && fit.left > hostBox.right);
      const inner = !beside;
      const left = inner ? hostBox.left : fit.left;
      const roomWidth = inner ? hostBox.width : fit.width;
      const roomHeight = inner ? hostBox.height : cfg.height ?? hostBox.height;
      if (roomWidth < 240) return hide();
      const plan = zoomPlan({ area, roomWidth, roomHeight, scale: cfg.scale, real: sizes.get(srcRef.current), dpr: window.devicePixelRatio || 1 });
      if (!plan) return hide();
      const { scale, width, height } = plan;
      const lensW = width / scale;
      const lensH = height / scale;
      const inside = event.clientX >= area.left && event.clientX <= area.left + area.width && event.clientY >= area.top && event.clientY <= area.top + area.height;
      if (!inside) return hide();
      const tx = Math.min(Math.max(event.clientX - lensW / 2, area.left), area.left + area.width - lensW);
      const ty = Math.min(Math.max(event.clientY - lensH / 2, area.top), area.top + area.height - lensH);
      const first = !geo;
      geo = { area, hostBox, scale, lensW, lensH, tx, ty, cx: first ? tx : geo.cx, cy: first ? ty : geo.cy };
      const lens = lensRef.current;
      if (lens) Object.assign(lens.style, { display: inner ? "none" : "block", width: `${lensW}px`, height: `${lensH}px` });
      const next = {
        left,
        inner,
        top: inner ? hostBox.top : Math.min(Math.max(hostBox.top, 8), Math.max(window.innerHeight - height - 8, 8)),
        width,
        height,
        low: img.currentSrc || img.src,
        size: `${area.width * scale}px ${area.height * scale}px`,
        position: `${-(geo.cx - area.left) * scale}px ${-(geo.cy - area.top) * scale}px`
      };
      setPane((prev) => (prev && ["left", "top", "width", "height", "low", "size", "inner"].every((k) => prev[k] === next[k]) ? prev : { ...next, position: next.position }));
      place();
      if (!frame) frame = requestAnimationFrame(glide);
    };
    const prime = (event) => {
      if (event.pointerType === "mouse") warm(srcRef.current);
    };
    host.addEventListener("pointerenter", prime);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", hide);
    window.addEventListener("scroll", hide, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      host.removeEventListener("pointerenter", prime);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", hide);
      window.removeEventListener("scroll", hide);
    };
  }, []);

  return (
    <>
      <span ref={anchorRef} hidden />
      <span
        ref={lensRef}
        className={styles.lens}
        aria-hidden="true"
        style={{ "--zoom-lens": o.lensColor, "--zoom-lens-border": o.lensBorder, "--zoom-lens-border-dark": o.lensBorderDark, "--zoom-lens-opacity": o.lensOpacity, display: "none" }}
      />
      {pane &&
        createPortal(
          <div
            ref={paneRef}
            className={`${styles.pane} ${pane.inner ? styles.inner : ""}`}
            aria-hidden="true"
            style={{
              left: pane.left,
              top: pane.top,
              width: pane.width,
              height: pane.height,
              ...(o.borderColor ? { borderColor: o.borderColor } : null),
              backgroundColor: o.background,
              backgroundImage: `url("${src}"), url("${pane.low}")`,
              backgroundSize: `${pane.size}, ${pane.size}`,
              backgroundPosition: `${pane.position}, ${pane.position}`
            }}
          />,
          document.body
        )}
    </>
  );
}
