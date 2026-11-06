// A18: settle the brand against the shared dictionary at save time, and link the saved item to it.
//   - a brand picked from the list (or added) keeps its dictionary id;
//   - a brand that was only typed is looked up or added, so "SAMSUNG" and "Samsung" end up as one value;
//   - an empty brand has no value.
// A failure here never blocks the save: the item is saved with the brand as typed and without a link.
import * as api from "../../../../api/index.js";

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

// Links the saved item. The links of an item are replaced as a whole, so this sends every dictionary use the editor owns (only the brand
// today; TODO(contract:A01) add spec and option values when the editor stores them as dictionary values).
// Nothing is sent for an item that never had a brand and still has none.
export async function linkBrand(itemId, valueId, hadBrand) {
  if (!valueId && !hadBrand) return;
  try {
    await api.linkItemValues(itemId, valueId ? [{ slot: "brand", valueId }] : []);
  } catch { /* the item is saved; the link is retried on the next save */ }
}
