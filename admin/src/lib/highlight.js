const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Splits text into [{ text, match }] segments so a component can wrap matches in <mark>. Case-insensitive.
export function splitHighlight(value, term) {
  const text = value === null || value === undefined ? "" : String(value);
  const needle = typeof term === "string" ? term.trim() : "";
  if (!text || !needle) return [{ text, match: false }];
  const parts = text.split(new RegExp(`(${escapeRegExp(needle)})`, "gi"));
  return parts.filter((p) => p !== "").map((p) => ({ text: p, match: p.toLowerCase() === needle.toLowerCase() }));
}
