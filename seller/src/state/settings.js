import { create } from "zustand";
import { mergeSettings, resolveSettings } from "@epicmkt/shared";
import * as api from "../api/index.js";
import { validatePatch } from "../lib/settingsSchema.js";
import { applyAppearance, writeDeviceAppearance } from "./appearance.js";
import { getThemeMode, isThemePending, setThemePending } from "../lib/theme.js";
import { showToast } from "./toast.js";

let chain = Promise.resolve();
let version = 0;

const explain = (err) => {
  if (err?.code === "premium_only") return "This setting is available on the Premium plan.";
  if (err?.code === "critical_in_app_required") return "In-app notifications are required for this event.";
  return "We could not save that change. Please try again.";
};

export const useSettings = create((set, get) => ({
  settings: resolveSettings({}),
  loaded: false,
  sellerId: null,

  // Takes the settings that came with /me. Applies appearance straight away.
  // A theme picked on this device that the server has not stored yet beats the server's older copy, then is sent again.
  load(raw, sellerId) {
    let settings = resolveSettings(raw);
    const pendingTheme = isThemePending() ? getThemeMode() : null;
    if (pendingTheme) settings = { ...settings, appearance: { ...settings.appearance, theme: pendingTheme } };
    applyAppearance(settings.appearance);
    writeDeviceAppearance(settings.appearance);
    set({ settings, loaded: true, sellerId });
    if (pendingTheme) get().update({ appearance: { theme: pendingTheme } }, { quiet: true });
  },

  reset() {
    set({ settings: resolveSettings({}), loaded: false, sellerId: null });
  },

  // Saves a partial change straight away: validated, applied optimistically, then sent to the server.
  async update(patch, { quiet = false, message = "Saved" } = {}) {
    const check = validatePatch(patch);
    if (!check.ok) {
      if (!quiet) showToast(check.message);
      return { ok: false, message: check.message };
    }
    const previous = get().settings;
    const next = resolveSettings(mergeSettings(previous, patch));
    const themeChange = Boolean(patch.appearance && "theme" in patch.appearance);
    version += 1;
    const mine = version;
    set({ settings: next });
    if (patch.appearance) {
      applyAppearance(next.appearance);
      writeDeviceAppearance(next.appearance);
    }
    // The choice is now on this device. It stays marked until the server has it too (see load above).
    if (themeChange) setThemePending(true);
    const run = chain.then(() => api.saveSettings(patch));
    chain = run.catch(() => undefined);
    try {
      await run;
      if (themeChange && version === mine) setThemePending(false);
      if (!quiet) showToast(message);
      return { ok: true };
    } catch (err) {
      if (version === mine) {
        // A theme the seller picked stays on screen even when the save failed; it is sent again on the next load.
        const kept = themeChange ? { ...previous, appearance: { ...previous.appearance, theme: next.appearance.theme } } : previous;
        set({ settings: kept });
        applyAppearance(previous.appearance, { keepTheme: themeChange });
        writeDeviceAppearance(previous.appearance);
      }
      const text = explain(err);
      showToast(text);
      return { ok: false, message: text };
    }
  },

  dismissTip(id) {
    const tips = get().settings.onboarding.dismissed_tips;
    if (tips.includes(id)) return Promise.resolve({ ok: true });
    return get().update({ onboarding: { dismissed_tips: [...tips, id] } }, { quiet: true });
  }
}));

export const selectSettings = (s) => s.settings;
export const DEFAULTS_FALLBACK = resolveSettings({});
