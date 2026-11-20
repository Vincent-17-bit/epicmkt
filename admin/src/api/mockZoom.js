import { DEFAULT_ZOOM_SETTINGS, isValidZoomSettings } from "@epicmkt/shared";
import { ApiError } from "./errors.js";

let current = { ...DEFAULT_ZOOM_SETTINGS };
const wait = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getZoomSettings() {
  await wait();
  return { ...current };
}

export async function saveZoomSettings(next) {
  await wait();
  if (!isValidZoomSettings(next)) throw new ApiError("invalid_zoom_settings");
  current = { enabled: next.enabled, scale: next.scale, lens: next.lens };
  return { ...current };
}
