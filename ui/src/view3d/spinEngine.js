import { ZOOM, clampZoom } from "./contract.js";

// Photo spin (C15): a sequence of pictures taken around the item. Drag to turn it, let go and it keeps turning for a moment,
// wheel or pinch to zoom. The first frame is shown at once; the rest load in an order that makes a coarse spin possible early.

/** The order frames load in: the first, then every 8th, 4th, 2nd, and the rest. [0, 8, 16, 4, 12, 20, 2, ...] for 24 frames. */
export function loadOrder(count) {
  const seen = new Set();
  const out = [];
  for (const gap of [count, 8, 4, 2, 1]) {
    for (let i = 0; i < count; i += Math.max(1, gap)) if (!seen.has(i)) { seen.add(i); out.push(i); }
  }
  return out;
}

export const wrap = (value, count) => ((Math.round(value) % count) + count) % count;

/** A drag across `width` pixels is one full turn. */
export const dragToFrames = (dx, width, count) => (width > 0 ? (dx / width) * count : 0);

// Speed is measured in time, not in screen refreshes, so a spin turns at the same pace on a 60 Hz laptop and a 120 Hz phone.
// One full turn when turning by itself takes 5 to 10 seconds: about a fifth of a second per picture, never faster than 5 s a turn
// (a 13-picture spin would otherwise flash round in under 3 s) and never slower than 10 s (a 72-picture spin).
export const SPIN_PICTURE_MS = 220;
export const SPIN_TURN_MS = Object.freeze({ min: 5000, max: 10000 });
export const spinTurnMs = (count) => Math.min(SPIN_TURN_MS.max, Math.max(SPIN_TURN_MS.min, (count || 0) * SPIN_PICTURE_MS));
/** How long each picture stays when the spin turns by itself (also the pace of the seller's "Play the turn" preview). */
export const spinPictureMs = (count) => (count > 0 ? Math.round(spinTurnMs(count) / count) : SPIN_PICTURE_MS);

const FRAME_MS = 1000 / 60;          // velocity is in pictures per 1/60 s
const DECAY = 0.94;                  // per 1/60 s after letting go of a drag
const STOP = 0.02;
const FLING_TURN_MS = 1500;          // a hard flick turns at most one full turn in 1.5 s, then slows down
const MAX_DT = 100;                  // a long pause (tab in the background) does not jump the spin

export function createSpinEngine({ frames, startFrame = 0, ImageClass, raf, caf } = {}) {
  const list = Array.isArray(frames) ? frames.filter((f) => typeof f === "string" && f) : [];
  const count = list.length;
  const Img = ImageClass ?? (typeof Image !== "undefined" ? Image : null);
  const request = raf ?? ((fn) => requestAnimationFrame(fn));
  const cancel = caf ?? ((id) => cancelAnimationFrame(id));

  let position = count ? wrap(startFrame, count) : 0; // may be fractional while turning
  let zoom = ZOOM.start;
  let auto = false;
  let velocity = 0;
  let dragging = null;
  let timer = null;
  let root = null;
  let host = null;
  let view = null;
  let loaded = [];
  let destroyed = false;
  let ready = false;
  let offs = [];

  const shown = () => (count ? wrap(position, count) : 0);
  const paint = () => {
    if (!view) return;
    const i = shown();
    // Show the nearest frame that has arrived, so the picture never goes blank while frames are still loading.
    let src = list[i];
    for (let d = 0; d < count; d += 1) {
      const hit = loaded[wrap(i + d, count)] ?? loaded[wrap(i - d, count)];
      if (hit) { src = hit.src; break; }
    }
    if (view.getAttribute("src") !== src) view.setAttribute("src", src);
    view.style.transform = `scale(${zoom})`;
    root?.setAttribute("data-frame", String(i));
  };

  const turnMs = spinTurnMs(count);
  const maxVelocity = (count * FRAME_MS) / FLING_TURN_MS;
  let last = null; // time of the previous tick, ms
  const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

  const tick = (time) => {
    timer = null;
    if (destroyed) return;
    const t = typeof time === "number" ? time : now();
    const dt = last === null ? FRAME_MS : Math.min(MAX_DT, Math.max(0, t - last));
    last = t;
    if (!dragging) {
      if (Math.abs(velocity) > STOP) { position += velocity * (dt / FRAME_MS); velocity *= DECAY ** (dt / FRAME_MS); }
      else if (auto) position += (dt * count) / turnMs;
    }
    paint();
    if (!dragging && (auto || Math.abs(velocity) > STOP)) timer = request(tick);
    else last = null;
  };
  const kick = () => { if (timer === null && !destroyed) { last = null; timer = request(tick); } };

  const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); offs.push(() => target.removeEventListener(type, fn, opts)); };

  const engine = {
    count,
    async mount(container, { onProgress } = {}) {
      if (destroyed) throw new Error("destroyed");
      if (!count || !Img) throw new Error("spin_unavailable");
      host = container;
      root = container.ownerDocument.createElement("div");
      root.setAttribute("data-view3d", "spin");
      root.style.cssText = "position:relative;inline-size:100%;block-size:100%;overflow:hidden;touch-action:none;cursor:grab;user-select:none";
      view = container.ownerDocument.createElement("img");
      view.alt = "";
      view.draggable = false;
      view.style.cssText = "inline-size:100%;block-size:100%;object-fit:contain;transform-origin:center;pointer-events:none;will-change:transform";
      root.appendChild(view);
      container.appendChild(root);

      const pointers = new Map();
      let pinch = 0;
      on(root, "pointerdown", (e) => {
        pointers.set(e.pointerId ?? 0, { x: e.clientX, y: e.clientY });
        if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); dragging = null; return; }
        dragging = { x: e.clientX, last: e.clientX, t: Date.now() };
        velocity = 0;
        root.style.cursor = "grabbing";
        try { root.setPointerCapture?.(e.pointerId); } catch { /* a synthetic event has no pointer to capture */ }
      });
      on(root, "pointermove", (e) => {
        if (pointers.has(e.pointerId ?? 0)) pointers.set(e.pointerId ?? 0, { x: e.clientX, y: e.clientY });
        if (pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinch > 0) engine.setZoom(zoom * (d / pinch));
          pinch = d;
          return;
        }
        if (!dragging) return;
        const width = root.clientWidth || host.clientWidth || root.getBoundingClientRect?.().width || 300;
        const step = dragToFrames(e.clientX - dragging.last, width, count);
        position -= step; // dragging right turns the item right: the previous frame
        velocity = Math.max(-maxVelocity, Math.min(maxVelocity, -step));
        dragging.last = e.clientX;
        paint();
      });
      const release = (e) => { pointers.delete(e.pointerId ?? 0); if (pointers.size < 2) pinch = 0; if (dragging && pointers.size === 0) { dragging = null; root.style.cursor = "grab"; kick(); } };
      on(root, "pointerup", release);
      on(root, "pointercancel", release);
      on(root, "wheel", (e) => { e.preventDefault?.(); engine.setZoom(zoom + (e.deltaY < 0 ? ZOOM.step : -ZOOM.step)); }, { passive: false });

      // Frames: the first decides when we are ready; the rest follow in priority order.
      loaded = new Array(count).fill(null);
      let done = 0;
      const first = await new Promise((resolve, reject) => {
        const order = loadOrder(count);
        order.forEach((index, n) => {
          const img = new Img();
          img.decoding = "async";
          const finish = (ok) => {
            if (destroyed) return;
            done += 1;
            if (ok) loaded[index] = img;
            onProgress?.(done / count);
            if (index === order[0]) { if (ok) resolve(img); else reject(new Error("spin_first_frame")); }
            else if (ok && ready) paint();
          };
          img.onload = () => finish(true);
          img.onerror = () => finish(false);
          img.src = list[index];
          if (n === 0 && img.complete && img.naturalWidth) { /* cached: onload still fires */ }
        });
      });
      if (destroyed) return;
      ready = true;
      void first;
      paint();
      if (auto) kick();
    },
    setZoom(z) { zoom = clampZoom(z); paint(); return zoom; },
    rotateBy(steps) { velocity = 0; position += steps; paint(); },
    setAutoRotate(on_) { auto = Boolean(on_); if (auto) kick(); },
    getState: () => ({ zoom, autoRotate: auto, ready, frame: shown() }),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (timer !== null) cancel(timer);
      timer = null;
      offs.forEach((off) => off());
      offs = [];
      for (const img of loaded) if (img) { img.onload = null; img.onerror = null; img.src = ""; }
      loaded = [];
      root?.remove();
      root = null;
      host = null;
      view = null;
    }
  };
  return engine;
}
