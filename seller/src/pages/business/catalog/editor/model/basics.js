// Slice "basics": owns these form keys. See ../README.md for how to add a slice.
export const basicsSlice = {
  id: "basics",
  keys: ["name", "brand", "brandValueId", "section", "shortDescription", "description"],
  // Optional: handle slice-specific actions. Return the next form, or undefined to fall through to the default patch.
  reduce: () => undefined,
};
