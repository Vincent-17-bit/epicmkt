// "Jane Wanjiru" -> "JW", "jane@example.com" -> "J", nothing -> "?"
export function initialsOf(value) {
  const text = String(value ?? "").trim();
  if (!text) return "?";
  const words = text.includes("@") ? [text] : text.split(/\s+/);
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}
