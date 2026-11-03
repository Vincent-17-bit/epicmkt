import { readStore, writeStore } from "../lib/storage.js";
import { getThemeMode, setTheme } from "../lib/theme.js";

// "system" is a real choice, so it counts as one when comparing with what is stored on this device.
const sameTheme = (mode) => mode === getThemeMode();

export const APPEARANCE_KEY = "epicmkt-seller-appearance";
const ATTRS = { text_size: "textSize", density: "density" };

// Applies text size, density, reduced motion and theme to the whole portal.
// Pass `keepTheme: true` to leave the theme alone (used when the server's copy must not replace this device's choice).
export function applyAppearance(a, { keepTheme = false } = {}) {
  if (typeof document === "undefined" || !a) return;
  const root = document.documentElement;
  if (a.text_size) root.dataset[ATTRS.text_size] = a.text_size;
  if (a.density) root.dataset[ATTRS.density] = a.density;
  if (!keepTheme && a.theme && !sameTheme(a.theme)) setTheme(a.theme);
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
