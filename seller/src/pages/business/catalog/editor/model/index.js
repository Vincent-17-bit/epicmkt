import { basicsSlice } from "./basics.js";
import { optionsSlice } from "./options.js";
import { pricesSlice } from "./prices.js";
import { mediaSlice } from "./media.js";
import { specsSlice } from "./specs.js";

// The form is split into slices, each owning a set of keys. The saved form is still ONE flat object, exactly as before,
// so the payload, the draft on the device and the dirty check are unchanged.
// Order is the order of the steps on screen. Other prompts append their slice at the end of this list.
export const SLICES = [basicsSlice, optionsSlice, pricesSlice, mediaSlice, specsSlice];

export const sliceOf = (key) => SLICES.find((s) => s.keys.includes(key)) ?? null;

// Actions: { type: "patch", key, value } sets one field; { type: "replace", form } swaps the whole form (after a save, or Start over).
export const itemReducer = (form, action) => {
  if (action.type === "replace") return action.form;
  if (action.type === "patch") {
    const owner = sliceOf(action.key);
    const custom = owner?.reduce(form, action);
    if (custom !== undefined) return custom;
    // A key no slice owns is still stored, so a field added later is never silently dropped.
    return { ...form, [action.key]: action.value };
  }
  const handled = SLICES.map((s) => s.reduce(form, action)).find((next) => next !== undefined);
  return handled ?? form;
};
