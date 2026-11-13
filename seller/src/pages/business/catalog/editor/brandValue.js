// A18: settle the brand against the shared dictionary at save time, and link the saved item to it.
//   - a brand picked from the list (or added) keeps its dictionary id;
//   - a brand that was only typed is looked up or added, so "SAMSUNG" and "Samsung" end up as one value;
//   - an empty brand has no value.
// A failure here never blocks the save: the item is saved with the brand as typed and without a link.
import * as api from "../../../../api/index.js";
import { hasTemplate, ownValue, valueKindOf } from "./typedRows.js";

// -> { brand, valueId }. `brand` is the text to save (the dictionary's own spelling when the value already existed).
export async function settleBrand(form) {
  const typed = String(form.brand ?? "").trim();
  if (!typed) return { brand: typed, valueId: null };
  if (form.brandValueId) return { brand: typed, valueId: form.brandValueId };
  try {
    const { value } = await api.addOptionValue("brand", typed);
    return { brand: value.label, valueId: value.id };
  } catch {
    return { brand: typed, valueId: null };
  }
}

export async function settleSpecLinks(form, type) {
  if (!hasTemplate(type)) return [];
  const ids = [];
  for (const row of type.specRows) {
    const kind = valueKindOf(row);
    if (row.input !== "openValue" || !kind || kind === "brand") continue;
    const text = ownValue(form, row);
    if (!text) continue;
    const stored = form.specValues?.[row.key];
    if (stored?.id && stored.label === text) { ids.push(stored.id); continue; }
    try {
      const { value } = await api.addOptionValue(kind, text);
      ids.push(value.id);
    } catch { /* the text is saved; the link is retried on the next save */ }
  }
  return [...new Set(ids)].map((valueId) => ({ slot: "spec", valueId }));
}

// The links of an item are replaced as a whole, so this sends the brand and the spec values together.
export async function linkBrand(itemId, valueId, hadLinks, spec = []) {
  const uses = [...(valueId ? [{ slot: "brand", valueId }] : []), ...spec];
  if (uses.length === 0 && !hadLinks) return;
  try {
    await api.linkItemValues(itemId, uses);
  } catch { /* the item is saved; the link is retried on the next save */ }
}
