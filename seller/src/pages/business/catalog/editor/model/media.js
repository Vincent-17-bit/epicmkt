// Slice "media": the form owns no media keys. Files live in useMediaSlot (MediaSlot.jsx), never in the saved form or the draft.
export const mediaSlice = {
  id: "media",
  keys: [],
  // Optional: handle slice-specific actions. Return the next form, or undefined to fall through to the default patch.
  reduce: () => undefined,
};
