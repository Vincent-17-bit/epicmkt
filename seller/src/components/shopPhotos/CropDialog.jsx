import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MAX_ZOOM, cropRect, panBy, safeShare, startState, viewFor, zoomAbout } from "../../lib/imageCrop.js";
import { renderCrop } from "../../lib/photoCanvas.js";
import { errorText } from "../../lib/errors.js";
import Modal from "../../pages/business/catalog/Modal.jsx";
import ui from "../../styles/ui.module.css";
import styles from "./shopPhotos.module.css";

const KEY_STEP = 24; // screen pixels per arrow press
const ZOOM_STEP = 0.25;

// Lets the seller frame a picture inside a fixed-shape window. The window has the shape the picture will be stored in,
// so what they see here is exactly what customers get: no stretching, no empty bars (see lib/imageCrop.js).
export default function CropDialog({ spec, photo, onCancel, onSave }) {
  const img = { w: photo.width, h: photo.height };
  const frameRef = useRef(null);
  const [frameW, setFrameW] = useState(320);
  const [state, setState] = useState(() => startState(img));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const frame = { w: frameW, h: frameW / spec.ratio };
  const ctx = { img, frame };
  const view = viewFor({ ...ctx, ...state });

  // Handlers run later than the render that created them, so they read the latest values from refs.
  const live = useRef({ ctx, state });
  live.current = { ctx, state };

  // Follow the real width of the frame (it changes when a phone is rotated). Dragging and zooming stay in the same place
  // because the position is kept in picture pixels, not screen pixels.
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return undefined;
    const measure = () => { if (el.clientWidth > 0) setFrameW(el.clientWidth); };
    measure();
    if (typeof ResizeObserver !== "function") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pointers = useRef(new Map());
  const pinch = useRef(null);

  const focusOf = (clientX, clientY) => {
    const r = frameRef.current.getBoundingClientRect();
    return { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 };
  };

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: live.current.state.zoom };
    }
  };

  const onPointerMove = (e) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      setState((s) => panBy(s, live.current.ctx, dx, dy));
    } else if (pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const focus = focusOf((a.x + b.x) / 2, (a.y + b.y) / 2);
      const next = (pinch.current.zoom * d) / pinch.current.dist;
      setState((s) => zoomAbout(s, live.current.ctx, next, focus));
    }
  };

  const onPointerEnd = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  // The mouse wheel zooms on desktop. It needs a non-passive listener to stop the page scrolling at the same time.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const focus = focusOf(e.clientX, e.clientY);
      setState((s) => zoomAbout(s, live.current.ctx, s.zoom * Math.exp(-e.deltaY * 0.0015), focus));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const zoomTo = (z) => setState((s) => zoomAbout(s, live.current.ctx, z));

  // Keyboard: arrows move the picture, plus and minus zoom. Without this the cropper would be mouse-and-touch only.
  const onKeyDown = (e) => {
    const move = { ArrowLeft: [KEY_STEP, 0], ArrowRight: [-KEY_STEP, 0], ArrowUp: [0, KEY_STEP], ArrowDown: [0, -KEY_STEP] }[e.key];
    if (move) {
      e.preventDefault();
      setState((s) => panBy(s, live.current.ctx, move[0], move[1]));
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoomTo(live.current.state.zoom + ZOOM_STEP);
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      zoomTo(live.current.state.zoom - ZOOM_STEP);
    }
  };

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const blob = await renderCrop(photo.img, cropRect(live.current.state, live.current.ctx), spec);
      await onSave(blob);
    } catch (err) {
      setError(errorText(err, "We could not save that photo. Check your connection and try again."));
      setBusy(false);
    }
  };

  const card = safeShare(spec, "card");
  const what = spec.kind === "logo" ? "logo" : "cover photo";

  return (
    <Modal
      open
      onClose={busy ? () => {} : onCancel}
      title={`Adjust your ${what}`}
      labelId="crop-title"
      wide={spec.kind === "cover"}
      footer={(
        <div className={styles.cropFoot}>
          <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className={ui.btn} onClick={save} disabled={busy}>{busy ? "Saving" : "Use photo"}</button>
        </div>
      )}
    >
      <div className={styles.crop}>
        <p className={styles.cropHint}>Drag the photo to move it. Pinch, scroll or use the slider to zoom.</p>
        <div
          ref={frameRef}
          className={`${styles.cropFrame} ${spec.kind === "logo" ? styles.cropFrameLogo : ""}`}
          style={{ aspectRatio: String(spec.ratio) }}
          role="group"
          aria-label={`Crop area for your ${what}. Drag, or use the arrow keys to move it and plus and minus to zoom.`}
          tabIndex={0}
          data-testid="crop-frame"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onKeyDown={onKeyDown}
        >
          <img
            src={photo.url}
            alt=""
            draggable={false}
            className={styles.cropImg}
            style={{ width: img.w, height: img.h, transform: `translate(calc(-50% + ${view.tx}px), calc(-50% + ${view.ty}px)) scale(${view.scale})` }}
          />
          {spec.round && <span className={styles.circleMask} aria-hidden="true" />}
          {card && (
            <span className={styles.guide} style={{ width: `${card * 100}%` }} aria-hidden="true">
              <span className={styles.guideLabel}>Shop cards show this part</span>
            </span>
          )}
        </div>
        <div className={styles.zoomRow}>
          <button type="button" className={styles.zoomBtn} onClick={() => zoomTo(view.zoom - ZOOM_STEP)} disabled={view.zoom <= 1} aria-label="Zoom out">−</button>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={view.zoom}
            onChange={(e) => zoomTo(Number(e.target.value))}
            aria-label="Zoom"
          />
          <button type="button" className={styles.zoomBtn} onClick={() => zoomTo(view.zoom + ZOOM_STEP)} disabled={view.zoom >= MAX_ZOOM} aria-label="Zoom in">+</button>
        </div>
        {error && <p className={ui.error} role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
