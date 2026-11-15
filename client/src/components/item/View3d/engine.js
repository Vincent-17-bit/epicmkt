// The lazy engine loader (C14). Nothing here pulls in a renderer until createEngine runs, so a page that never opens
// the viewer never downloads one; the model engine's chunk is the only one that carries the 3D library.
export { ZOOM, clampZoom, reducedMotion } from "@epicmkt/ui/view3d";

/** Which engines the data can drive, model first: ["model", "spin"], ["spin"], ["model"] or []. */
export const kindsOf = (view) => [view?.model?.url ? "model" : null, view?.spin?.frames?.length ? "spin" : null].filter(Boolean);

export async function createEngine(kind, view) {
  if (kind === "model") return (await import("./modelEngine.js")).createModelEngine({ url: view.model.url });
  if (kind === "spin") return (await import("./spinEngine.js")).createSpinEngine({ frames: view.spin.frames });
  throw new Error("unknown_engine");
}
