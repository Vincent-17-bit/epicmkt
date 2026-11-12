// Slice "type": owns the product type chosen on the Add item screen. See ../README.md.
// The key is only on the form when the seller went through the picker (null means Other goods), so items with no type look and save exactly as before.
// Changing it later resets the rows that belong to the old type. TODO(contract:B03) list the type-specific keys here as B03 and B07 add them.
export const TYPE_SPECIFIC_KEYS = [];

export const typeSlice = {
  id: "type",
  keys: ["productTypeId"],
  reduce(form, action) {
    if (action.type !== "patch" || action.key !== "productTypeId") return undefined;
    if (form.productTypeId === action.value) return form;
    const next = { ...form, productTypeId: action.value };
    for (const k of TYPE_SPECIFIC_KEYS) delete next[k];
    return next;
  },
};
