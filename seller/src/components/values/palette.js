// A short list of common colours to tap. It is only a shortcut: a tap looks the name up in the shared list and adds it (with this shade) if it is missing.
// A shop can pass its own palette to ColorValueInput.
export const DEFAULT_PALETTE = Object.freeze([
  { name: "Black", hex: "#000000" }, { name: "White", hex: "#ffffff" }, { name: "Grey", hex: "#808080" },
  { name: "Red", hex: "#d32f2f" }, { name: "Orange", hex: "#f57c00" }, { name: "Yellow", hex: "#fbc02d" },
  { name: "Green", hex: "#388e3c" }, { name: "Blue", hex: "#1976d2" }, { name: "Purple", hex: "#7b1fa2" },
  { name: "Pink", hex: "#e91e63" }, { name: "Brown", hex: "#795548" }, { name: "Beige", hex: "#d9c4a0" },
]);
