// Slice "options": owns no form keys yet. B07 fills it and moves variants here. TODO(contract:B07)
export const optionsSlice = {
  id: "options",
  keys: [],
  // Optional: handle slice-specific actions. Return the next form, or undefined to fall through to the default patch.
  reduce: () => undefined,
};
