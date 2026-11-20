import { useEffect, useState } from "react";
import { DEFAULT_ZOOM_SETTINGS, normalizeZoomSettings } from "@epicmkt/shared";
import { isLive } from "./flash/mode.js";

export async function getZoomSettings() {
  if (!isLive()) return { ...DEFAULT_ZOOM_SETTINGS };
  try {
    const { supabase } = await import("./applications/supabaseClient");
    const { data, error } = await supabase.rpc("zoom_settings");
    return error ? { ...DEFAULT_ZOOM_SETTINGS } : normalizeZoomSettings(data);
  } catch {
    return { ...DEFAULT_ZOOM_SETTINGS };
  }
}

let loaded = null;
let cachedAt = 0;
const FRESH_MS = 10 * 60 * 1000;

const load = () => {
  if (!loaded || Date.now() - cachedAt > FRESH_MS) {
    cachedAt = Date.now();
    loaded = getZoomSettings();
  }
  return loaded;
};

export const resetZoomSettings = () => {
  loaded = null;
};

/** The site's photo zoom settings: the defaults at first, the saved ones as soon as they arrive. Fetched once per ten minutes. */
export function useZoomSettings() {
  const [settings, setSettings] = useState(DEFAULT_ZOOM_SETTINGS);
  useEffect(() => {
    let alive = true;
    load().then((value) => alive && setSettings(value));
    return () => {
      alive = false;
    };
  }, []);
  return settings;
}
