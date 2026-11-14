export const DISPLAYS = [
  ["button", "Buttons"],
  ["swatch", "Colour swatches"],
  ["text-card", "Text cards"],
  ["image-card", "Photo cards"],
  ["dropdown", "Dropdown list"],
];
export const MAX_AXES = 3;

const slug = (s, sep) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, sep).replace(new RegExp(`^${sep}|${sep}$`, "g"), "");
export const axisKey = (label) => slug(label, "_").replace(/^[0-9_]+/, "").slice(0, 30);
export const typeId = (name) => slug(name, "-").replace(/^[0-9-]+/, "").slice(0, 40);

let seq = 0;
const uid = () => `a${++seq}`;

export const toDraft = (type) => ({
  id: type?.id ?? "",
  isNew: !type,
  name: type?.name ?? "",
  departmentId: type?.departmentId ?? "",
  categoryIds: [...(type?.categoryIds ?? [])],
  active: type?.active ?? true,
  axes: (type?.axes ?? []).map((a) => ({
    uid: uid(),
    key: a.key,
    label: a.label,
    display: a.display,
    suggestedText: (a.suggested ?? []).map((s) => s.label).join(", "),
    extra: a.dependsOn ? { dependsOn: a.dependsOn } : {},
  })),
});

export const blankAxis = () => ({ uid: uid(), key: "", label: "", display: "button", suggestedText: "", extra: {} });

const labels = (text) => [...new Set(String(text).split(",").map((s) => s.trim()).filter(Boolean))];

export const toType = (d) => ({
  name: d.name.trim(),
  departmentId: d.departmentId || null,
  categoryIds: d.categoryIds,
  active: d.active,
  axes: d.axes.map((a) => {
    const suggested = labels(a.suggestedText).map((label) => ({ id: slug(label, "-"), label }));
    return { key: a.key || axisKey(a.label), label: a.label.trim(), display: a.display, ...(suggested.length ? { suggested } : {}), ...a.extra };
  }),
});

export function validate(d) {
  const errors = [];
  if (!d.name.trim()) errors.push("Give the type a name.");
  if (d.isNew && !typeId(d.name)) errors.push("The name needs letters so an id can be made from it.");
  const keys = new Set();
  d.axes.forEach((a, i) => {
    if (!a.label.trim()) errors.push(`Option ${i + 1} needs a name.`);
    const key = a.key || axisKey(a.label);
    if (a.label.trim() && !key) errors.push(`Option ${i + 1} needs a name that starts with a letter.`);
    if (key && keys.has(key)) errors.push(`Two options are both called “${a.label.trim()}”.`);
    keys.add(key);
    if (labels(a.suggestedText).length > 40) errors.push(`Option ${i + 1} has too many suggested values (40 at most).`);
  });
  if (d.axes.length > MAX_AXES) errors.push(`A type can have at most ${MAX_AXES} options.`);
  return { ok: errors.length === 0, errors, type: toType(d) };
}

export const isDirty = (d, original) => JSON.stringify(toType(d)) !== JSON.stringify(original ? toType(toDraft(original)) : null);

export const SAVE_ERRORS = {
  forbidden: "Only the owner can change product types.",
  invalid_type_id: "That id is not allowed. Use letters, digits and dashes.",
  invalid_type_name: "The name must be 1 to 60 characters.",
  invalid_department: "That department no longer exists.",
  invalid_categories: "One of the chosen categories no longer exists.",
  invalid_axes: "The server rejected these options. Check names and suggested values.",
};
export const saveError = (e) => SAVE_ERRORS[e?.code ?? e?.message] ?? SAVE_ERRORS[String(e?.message ?? "").match(/[a-z_]+/)?.[0]] ?? "Could not save. Try again.";
