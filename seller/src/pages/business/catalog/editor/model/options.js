// Slice "options" (B07): owns the one `options` key, { axes, rows, defaultKey } (see shared/src/options/editor.js).
// The key exists on the form only for an item that went through the type picker or already has options, so an item with no
// options saves, drafts and compares exactly as before (it is not in emptyItemForm()).
export const optionsSlice = {
  id: "options",
  keys: ["options", "customSize", "sizeGuide"],
  reduce: () => undefined,
};
