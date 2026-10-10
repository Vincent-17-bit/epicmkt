import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { checkImageFile, clampOffset, cropRect, loadImage, renderCrop } from "../../lib/media.js";

/** Pick the part of a photo to keep: drag to move, slide to zoom. Square for logos, wide for covers. */
export default function CropDialog({ file, title, aspect, outW, outH, onCancel, onConfirm }) {
  const [state, setState] = useState({ status: "loading" });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [frameW, setFrameW] = useState(320);
  const [busy, setBusy] = useState(false);
  const frameRef = useRef(null);
  const drag = useRef(null);
  const frameH = Math.round(frameW / aspect);

  useEffect(() => {
    let url;
    let live = true;
    (async () => {
      const check = await checkImageFile(file);
      if (!check.ok) return live && setState({ status: "error", message: check.message });
      url = URL.createObjectURL(file);
      try {
        const img = await loadImage(url);
        if (live) setState({ status: "ready", img, url, w: img.naturalWidth, h: img.naturalHeight });
      } catch {
        if (live) setState({ status: "error", message: "We could not read that image. Try another file." });
      }
    })();
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  useLayoutEffect(() => {
    const measure = () => frameRef.current && setFrameW(Math.max(200, Math.min(480, frameRef.current.parentElement.clientWidth)));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [state.status]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const dims = state.status === "ready" ? { imgW: state.w, imgH: state.h, frameW, frameH } : null;
  const move = (dx, dy, z = zoom) => dims && setOffset((o) => clampOffset({ ...dims, zoom: z, offset: { x: o.x + dx, y: o.y + dy } }));
  const rect = dims ? cropRect({ ...dims, zoom, offset: clampOffset({ ...dims, zoom, offset }) }) : null;

  const onZoom = (z) => {
    setZoom(z);
    if (dims) setOffset((o) => clampOffset({ ...dims, zoom: z, offset: o }));
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const blob = await renderCrop(state.img, rect, outW, outH);
      onConfirm({ blob, preview: URL.createObjectURL(blob) });
    } catch {
      setState({ status: "error", message: "We could not prepare that image. Try another file." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sx-scrim" role="presentation">
      <div className="sx-dialog sx-dialog--wide" role="dialog" aria-modal="true" aria-labelledby="sx-crop-title">
        <h2 id="sx-crop-title">{title}</h2>
        {state.status === "loading" && <p role="status">Loading image…</p>}
        {state.status === "error" && <p className="sx-error" role="alert">{state.message}</p>}
        {state.status === "ready" && (
          <>
            <div
              ref={frameRef}
              className="sx-crop"
              style={{ width: frameW, height: frameH }}
              tabIndex={0}
              role="application"
              aria-label="Photo crop area. Drag, or use the arrow keys, to move the photo."
              onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY }; }}
              onPointerMove={(e) => {
                if (!drag.current) return;
                move(e.clientX - drag.current.x, e.clientY - drag.current.y);
                drag.current = { x: e.clientX, y: e.clientY };
              }}
              onPointerUp={() => { drag.current = null; }}
              onKeyDown={(e) => {
                const step = 12;
                const d = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
                if (d) { e.preventDefault(); move(d[0], d[1]); }
              }}
            >
              <img
                src={state.url}
                alt=""
                draggable={false}
                style={{ position: "absolute", left: 0, top: 0, width: state.w * rect.scale, height: state.h * rect.scale, transform: `translate(${-rect.sx * rect.scale}px, ${-rect.sy * rect.scale}px)`, maxWidth: "none" }}
              />
            </div>
            <label className="sx-zoom">
              <span>Zoom</span>
              <input type="range" min="1" max="4" step="0.05" value={zoom} onChange={(e) => onZoom(Number(e.target.value))} />
            </label>
          </>
        )}
        <div className="sx-row sx-row--end">
          <button type="button" className="sx-btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="sx-btn sx-btn--primary" onClick={confirm} disabled={state.status !== "ready" || busy}>{busy ? "Preparing…" : "Use this photo"}</button>
        </div>
      </div>
    </div>
  );
}
