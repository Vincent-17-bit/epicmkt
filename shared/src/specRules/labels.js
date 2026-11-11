const set = (key, label, choices) => Object.freeze({ key, label, choices: Object.freeze(choices.map(([id, text]) => Object.freeze({ id, label: text }))) });

export const LABEL_SETS = Object.freeze({
  condition: set("condition", "Condition", [["new", "New"], ["refurbished", "Refurbished"], ["used", "Used"]]),
  authenticity: set("authenticity", "Authenticity", [["original", "Original"], ["inspired", "Inspired"]]),
  fragranceState: set("fragranceState", "Fragrance state", [["sealed", "Sealed"], ["tester", "Tester"], ["decant", "Decant"]]),
  chargerKind: set("chargerKind", "Charger kind", [["original", "Original"], ["compatible", "Compatible"], ["refill", "Refill"]])
});

export const LABEL_SET_KEYS = Object.freeze(Object.keys(LABEL_SETS));

export const isLabelSet = (key) => typeof key === "string" && Object.hasOwn(LABEL_SETS, key);

export function rowChoices(row) {
  if (Array.isArray(row?.choices)) return row.choices;
  if (isLabelSet(row?.labelSet)) return LABEL_SETS[row.labelSet].choices.map((c) => c.label);
  return null;
}

export function labelFor(setKey, value) {
  if (!isLabelSet(setKey)) return null;
  const folded = String(value ?? "").trim().toLowerCase();
  const hit = LABEL_SETS[setKey].choices.find((c) => c.id === folded || c.label.toLowerCase() === folded);
  return hit ? hit.label : null;
}
