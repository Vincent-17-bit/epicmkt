import { create } from "zustand";
import { mergeSettings, resolveSettings } from "@epicmkt/shared";
import * as api from "../api/index.js";
import { validatePatch } from "../lib/settingsSchema.js";
import { applyAppearance, writeDeviceAppearance } from "./appearance.js";
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
  load(raw, sellerId) {
    const settings = resolveSettings(raw);
    applyAppearance(settings.appearance);
    writeDeviceAppearance(settings.appearance);
    set({ settings, loaded: true, sellerId });
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
    version += 1;
    const mine = version;
    set({ settings: next });
    if (patch.appearance) {
      applyAppearance(next.appearance);
      writeDeviceAppearance(next.appearance);
    }
    const run = chain.then(() => api.saveSettings(patch));
    chain = run.catch(() => undefined);
    try {
      await run;
      if (!quiet) showToast(message);
      return { ok: true };
    } catch (err) {
      if (version === mine) {
        set({ settings: previous });
        applyAppearance(previous.appearance);
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
