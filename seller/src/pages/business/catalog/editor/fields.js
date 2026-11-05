// Small pure helpers shared by model.js, the steps registry and the quality-check registry.
// They live here (not in model.js) so those files can import them without importing each other.

export const PRICED = ["fixed", "from", "range"];

export const parseKes = (raw) => {
  const text = String(raw ?? "").replace(/,/g, "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const n = Number(text);
  return n > 9999999999.99 ? null : n;
};

export const filled = (s) => String(s ?? "").trim().length > 0;
