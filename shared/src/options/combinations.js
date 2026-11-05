// Every combination of the option axes: one value per axis, in axis order, as choice objects ({ color: "red", size: "m" }).
// Used by the editor's "generate variants" button. Capped so a careless axis set can never build more than the item limit + 1
// (the extra one lets the caller notice "too many"). An item with no axes has no combinations.

export const MAX_VARIANTS = 200;

export const generateCombinations = (axes, cap = MAX_VARIANTS + 1) => {
  const list = Array.isArray(axes) ? axes : [];
  if (list.length === 0) return [];
  let out = [{}];
  for (const axis of list) {
    const values = Array.isArray(axis?.values) ? axis.values : [];
    const next = [];
    for (const base of out) {
      for (const v of values) {
        next.push({ ...base, [axis.key]: v.id });
        if (next.length >= cap) break;
      }
      if (next.length >= cap) break;
    }
    out = next;
    if (out.length === 0) return [];
  }
  return out.slice(0, cap);
};
