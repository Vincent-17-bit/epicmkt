// Text and small helpers for the open values review page (migration 0090).
export const VALUE_KINDS = [
  { id: "material", label: "Material" },
  { id: "color", label: "Colour" },
  { id: "brand", label: "Brand" },
  { id: "finish", label: "Finish" },
  { id: "flavour", label: "Flavour" },
];
export const kindLabel = (id) => VALUE_KINDS.find((k) => k.id === id)?.label ?? id;

export const VALUE_TABS = [
  { id: "pending", label: "Waiting for review" },
  { id: "approved", label: "Approved" },
  { id: "merged", label: "Merged" },
  { id: "all", label: "All" },
];

export const VALUE_ERRORS = {
  value_exists: "Another value already has that spelling. Merge this value into it instead.",
  invalid_label: "Enter a name with letters or numbers.",
  label_too_long: "A value can be up to 60 characters.",
  invalid_hex: "A shade looks like #A1B2C3, and only colours have one.",
  invalid_tags: "Up to 8 tags, each 1 to 30 letters or numbers.",
  value_merged: "That value was already merged. Reload to see the result.",
  value_not_found: "That value no longer exists. Reload the list.",
  same_value: "Choose a different value to merge into.",
  kind_mismatch: "Values can only be merged within the same kind.",
  forbidden: "Only Reviewers and Owners can change the dictionary.",
};

export const valueError = (error) => VALUE_ERRORS[error?.code] ?? VALUE_ERRORS[String(error?.message ?? "").split(":")[0]] ?? error?.message ?? "Something went wrong. Try again.";

export const parseTags = (text) => String(text ?? "").split(",").map((t) => t.trim()).filter(Boolean);
export const itemsText = (n) => `${n} ${n === 1 ? "item" : "items"}`;
