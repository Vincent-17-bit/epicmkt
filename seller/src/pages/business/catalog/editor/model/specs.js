// Slice "specs": owns these form keys. See ../README.md for how to add a slice.
export const specsSlice = {
  id: "specs",
  keys: ["specs", "highlights", "includes", "packSize", "terms"],
  // Optional: handle slice-specific actions. Return the next form, or undefined to fall through to the default patch.
  reduce: () => undefined,
};
