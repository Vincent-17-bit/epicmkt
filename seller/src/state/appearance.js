import { readStore, writeStore } from "../lib/storage.js";

export const APPEARANCE_KEY = "epicmkt-seller-appearance";
const ATTRS = { text_size: "textSize", density: "density" };

// Applies text size, density and reduced motion to the whole portal. Theme is handled by ThemeProvider.
export function applyAppearance(a) {
  if (typeof document === "undefined" || !a) return;
  const root = document.documentElement;
  if (a.text_size) root.dataset[ATTRS.text_size] = a.text_size;
  if (a.density) root.dataset[ATTRS.density] = a.density;
  if (typeof a.reduce_motion === "boolean") root.dataset.reduceMotion = a.reduce_motion ? "true" : "false";
}

export function readDeviceAppearance() {
  try {
    const raw = JSON.parse(readStore(APPEARANCE_KEY) ?? "null");
    return raw && typeof raw === "object" ? raw : null;
  } catch {
    return null;
  }
}

export function writeDeviceAppearance(a) {
  writeStore(APPEARANCE_KEY, JSON.stringify({ text_size: a.text_size, density: a.density, reduce_motion: a.reduce_motion, card_view: a.card_view, remember_card_view: a.remember_card_view }));
}
