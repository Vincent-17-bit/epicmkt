import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./HoverZoom.module.css";

export const HOVER_ZOOM_DEFAULTS = {
  scale: 2.5,
  width: 560,
  height: null,
  gap: 16,
  lensColor: "#007185",
  lensOpacity: 0.16,
  borderColor: "#d5d9d9",
  background: "#ffffff",
  minWidth: 1024
};

const FINE_HOVER = "(hover: hover) and (pointer: fine)";

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
 *   src: the large picture of the photo being shown
 *   scale, width, height (px; height defaults to the photo box's height), gap (px), lensColor, lensOpacity, borderColor,
 *   background, minWidth (viewport px below which it stays off): see HOVER_ZOOM_DEFAULTS.
 * Off on touch screens and narrow windows, where there is no hover or no room beside the photo.
 */
export default function HoverZoom({ src, options }) {
  const o = { ...HOVER_ZOOM_DEFAULTS, ...options };
  const lensRef = useRef(null);
  const anchorRef = useRef(null);
  const [pane, setPane] = useState(null);
  const srcRef = useRef(src);
  srcRef.current = src;
  const optRef = useRef(o);
  optRef.current = o;

  useEffect(() => {
    const host = anchorRef.current?.parentElement;
    if (!host || typeof window === "undefined" || !window.matchMedia) return undefined;
    const hide = () => {
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
      const width = Math.min(cfg.width, window.innerWidth - hostBox.right - cfg.gap - 16);
      const height = cfg.height ?? hostBox.height;
      if (width < 240) return hide();
      const scale = Math.max(cfg.scale, width / area.width, height / area.height);
      const lensW = width / scale;
      const lensH = height / scale;
      const inside = event.clientX >= area.left && event.clientX <= area.left + area.width && event.clientY >= area.top && event.clientY <= area.top + area.height;
      if (!inside) return hide();
      const lx = Math.min(Math.max(event.clientX - lensW / 2, area.left), area.left + area.width - lensW);
      const ly = Math.min(Math.max(event.clientY - lensH / 2, area.top), area.top + area.height - lensH);
      const lens = lensRef.current;
      if (lens) {
        Object.assign(lens.style, { display: "block", width: `${lensW}px`, height: `${lensH}px`, left: `${lx - hostBox.left}px`, top: `${ly - hostBox.top}px` });
      }
      setPane({
        left: hostBox.right + cfg.gap,
        top: Math.min(Math.max(hostBox.top, 8), Math.max(window.innerHeight - height - 8, 8)),
        width,
        height,
        size: `${area.width * scale}px ${area.height * scale}px`,
        position: `${-(lx - area.left) * scale}px ${-(ly - area.top) * scale}px`
      });
    };
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", hide);
    window.addEventListener("scroll", hide, { passive: true });
    return () => {
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
        style={{ "--zoom-lens": o.lensColor, "--zoom-lens-opacity": o.lensOpacity, display: "none" }}
      />
      {pane &&
        createPortal(
          <div
            className={styles.pane}
            aria-hidden="true"
            style={{
              left: pane.left,
              top: pane.top,
              width: pane.width,
              height: pane.height,
              borderColor: o.borderColor,
              backgroundColor: o.background,
              backgroundImage: `url("${src}")`,
              backgroundSize: pane.size,
              backgroundPosition: pane.position
            }}
          />,
          document.body
        )}
    </>
  );
}
