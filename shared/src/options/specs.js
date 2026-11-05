// Per-variant spec overrides. A variant may carry spec rows { group, label, value } that replace the item's row with the same group
// and label (a row the item does not have is added). "Compatible devices" can differ between two styles of one product.
// Returns a new list; the item's own rows are never changed.

const same = (a, b) => a.group === b.group && String(a.label).trim().toLowerCase() === String(b.label).trim().toLowerCase();

export const applyVariantSpecs = (itemSpecs, variantSpecs) => {
  const base = Array.isArray(itemSpecs) ? itemSpecs.map((s) => ({ ...s })) : [];
  if (!Array.isArray(variantSpecs) || variantSpecs.length === 0) return base;
  for (const over of variantSpecs) {
    if (!over || typeof over !== "object") continue;
    const at = base.findIndex((s) => same(s, over));
    if (at >= 0) base[at] = { ...base[at], value: over.value };
    else base.push({ group: over.group, label: over.label, value: over.value });
  }
  return base;
};
