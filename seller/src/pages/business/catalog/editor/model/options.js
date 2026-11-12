// Slice "options": the values the seller typed for each option axis of the item's type, { [axisKey]: [stored scale value] }.
// The key is on the form only after the seller used the Options step, so items with no options look and save exactly as before.
// They are kept in the draft on the device. The price and stock grid that turns them into sellable combinations belongs to the option generation
// prompt, so nothing here is sent to the server yet. TODO(contract:B07)
export const optionsSlice = {
  id: "options",
  keys: ["optionValues"],
  // Optional: handle slice-specific actions. Return the next form, or undefined to fall through to the default patch.
  reduce: () => undefined,
};

/** The saved values of one axis ([] when none). */
export const axisValues = (form, axisKey) => form.optionValues?.[axisKey] ?? [];

/** The form with one axis's values replaced. An empty list removes the axis; no axis left removes the key, so the form is as before. */
export function withAxisValues(form, axisKey, list) {
  const next = { ...(form.optionValues ?? {}) };
  if (list.length) next[axisKey] = list;
  else delete next[axisKey];
  const { optionValues, ...rest } = form; // eslint-disable-line no-unused-vars
  return Object.keys(next).length ? { ...rest, optionValues: next } : rest;
}
