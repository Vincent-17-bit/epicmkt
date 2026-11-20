export const ZOOM_SCALES = [2, 2.5, 3];

export const ZOOM_LENSES = {
  sky: { label: "Sky", fill: "#3b82f6", edge: "#1d4ed8", edgeDark: "#93c5fd" },
  royal: { label: "Royal", fill: "#2563eb", edge: "#1e3a8a", edgeDark: "#bfdbfe" },
  teal: { label: "Teal", fill: "#0ea5e9", edge: "#0369a1", edgeDark: "#7dd3fc" },
  indigo: { label: "Indigo", fill: "#6366f1", edge: "#3730a3", edgeDark: "#c7d2fe" }
};

export const DEFAULT_ZOOM_SETTINGS = { enabled: true, scale: 2, lens: "sky" };

export function normalizeZoomSettings(raw) {
  const base = DEFAULT_ZOOM_SETTINGS;
  if (!raw || typeof raw !== "object") return { ...base };
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : base.enabled,
    scale: ZOOM_SCALES.includes(raw.scale) ? raw.scale : base.scale,
    lens: Object.hasOwn(ZOOM_LENSES, raw.lens) ? raw.lens : base.lens
  };
}

export const isValidZoomSettings = (raw) =>
  Boolean(raw) &&
  typeof raw === "object" &&
  typeof raw.enabled === "boolean" &&
  ZOOM_SCALES.includes(raw.scale) &&
  Object.hasOwn(ZOOM_LENSES, raw.lens);

/** The `zoom` prop of the photo gallery for these settings: false when switched off. */
export function zoomOptions(settings) {
  const s = normalizeZoomSettings(settings);
  if (!s.enabled) return false;
  const lens = ZOOM_LENSES[s.lens];
  return { scale: s.scale, lensColor: lens.fill, lensBorder: lens.edge, lensBorderDark: lens.edgeDark };
}
