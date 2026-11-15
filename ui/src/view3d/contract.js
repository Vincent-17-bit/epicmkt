// The engine contract the "View in 3D" shell talks to (C14). An engine is created from data and does nothing until mounted.
//
//   engine = createEngine(...)                       (createSpinEngine or createModelEngine)
//   await engine.mount(container, { onProgress })    draws into `container`; rejects if it cannot (the shell then falls back)
//   engine.setZoom(z)                                clamped to [ZOOM.min, ZOOM.max]; returns the zoom now in use
//   engine.rotateBy(steps)                           one step is one keyboard press: a frame for a spin, ROTATE_DEGREES for a model
//   engine.setAutoRotate(on)
//   engine.getState()                                { zoom, autoRotate, ready }
//   engine.destroy()                                 stops everything and lets go of images, geometry and textures; safe to call twice
export const ZOOM = Object.freeze({ min: 1, max: 4, step: 0.5, start: 1 });
export const ROTATE_DEGREES = 15;

export const clampZoom = (z) => {
  const n = Number(z);
  if (!Number.isFinite(n)) return ZOOM.start;
  return Math.min(ZOOM.max, Math.max(ZOOM.min, n));
};

export const reducedMotion = () => {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};
