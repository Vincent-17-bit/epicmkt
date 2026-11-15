import { formatDate } from "./time.js";
export const DISPLAYS = [
  ["button", "Buttons"],
  ["swatch", "Colour swatches"],
  ["text-card", "Text cards"],
  ["image-card", "Photo cards"],
  ["dropdown", "Dropdown list"],
];
export const MAX_AXES = 3;
export const KINDS = [
  ["good", "Goods"],
  ["service", "Service"],
  ["package", "Package (several things sold together)"],
];
export const QUANTITY_MODES = [
  ["units", "Whole units (1, 2, 3)"],
  ["measure", "A measure (1.5 kg, 3 m)"],
  ["none", "No quantity (buyers contact or book)"],
];
export const AFFECTS_PRICE = [
  ["auto", "Decide from the prices"],
  ["yes", "Yes, each value can have its own price"],
  ["no", "No, it never changes the price"],
];
const PRICE_FLAG = { auto: "auto", yes: true, no: false };
const priceChoice = (v) => (v === true ? "yes" : v === false ? "no" : "auto");

const slug = (s, sep) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, sep).replace(new RegExp(`^${sep}|${sep}$`, "g"), "");
export const axisKey = (label) => slug(label, "_").replace(/^[0-9_]+/, "").slice(0, 30);
export const typeId = (name) => slug(name, "-").replace(/^[0-9-]+/, "").slice(0, 40);

let seq = 0;
const uid = () => `a${++seq}`;

const EDITED = new Set(["key", "label", "display", "scale", "open", "optional", "affectsPrice", "suggested"]);

// What the editor starts from: the saved draft when there is one (the admin carries on where they stopped), else the live type.
export const sourceOf = (type) => (type?.draft ? { ...type, ...type.draft } : type);

export const toDraft = (given) => {
  const type = sourceOf(given);
  return {
    id: type?.id ?? "",
    isNew: !type,
    name: type?.name ?? "",
    kind: type?.kind ?? "good",
    quantityMode: type?.quantityMode ?? "units",
    sizeChartId: type?.sizeChartId ?? "",
    departmentId: type?.departmentId ?? "",
    categoryIds: [...(type?.categoryIds ?? [])],
    restrictedTo: [...(type?.restrictedTo ?? [])],
    active: type?.active ?? true,
    axes: (type?.axes ?? []).map((a) => ({
      uid: uid(),
      key: a.key,
      label: a.label,
      display: a.display,
      scale: a.scale ?? "",
      // open is true or the kind of value sellers type ("colour", "material"): the box shows either as ticked, and a kind is kept.
      open: Boolean(a.open),
      openKind: typeof a.open === "string" ? a.open : null,
      optional: a.optional === true,
      affectsPrice: priceChoice(a.affectsPrice),
      suggestedText: (a.suggested ?? []).map((s) => s.label).join(", "),
      // Everything the form does not edit (dependsOn, the seeds' sizeChart ...) is carried through unchanged.
      extra: Object.fromEntries(Object.entries(a).filter(([k]) => !EDITED.has(k))),
    })),
  };
};

export const blankAxis = () => ({ uid: uid(), key: "", label: "", display: "button", scale: "", open: false, openKind: null, optional: false, affectsPrice: "auto", suggestedText: "", extra: {} });

const labels = (text) => [...new Set(String(text).split(",").map((s) => s.trim()).filter(Boolean))];

// The type as it is saved. AxisDef fields left at their defaults (no scale, not open, not optional, price "auto") are left out,
// so a type that never used them saves exactly as before.
export const toType = (d) => ({
  name: d.name.trim(),
  kind: d.kind ?? "good",
  quantityMode: d.quantityMode ?? "units",
  sizeChartId: d.sizeChartId || null,
  departmentId: d.departmentId || null,
  categoryIds: d.categoryIds,
  restrictedTo: d.restrictedTo ?? [],
  active: d.active,
  axes: d.axes.map((a) => {
    const suggested = labels(a.suggestedText).map((label) => ({ id: slug(label, "-"), label }));
    return {
      key: a.key || axisKey(a.label),
      label: a.label.trim(),
      display: a.display,
      ...(a.scale ? { scale: a.scale } : {}),
      ...(a.open ? { open: a.openKind ?? true } : {}),
      ...(a.optional ? { optional: true } : {}),
      ...(a.affectsPrice && a.affectsPrice !== "auto" ? { affectsPrice: PRICE_FLAG[a.affectsPrice] } : {}),
      ...(suggested.length ? { suggested } : {}),
      ...a.extra,
    };
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
  if (d.kind && !KINDS.some(([id]) => id === d.kind)) errors.push("Pick what kind of thing this type is.");
  if (d.quantityMode && !QUANTITY_MODES.some(([id]) => id === d.quantityMode)) errors.push("Pick how buyers choose a quantity.");
  return { ok: errors.length === 0, errors, type: toType(d) };
}

export const isDirty = (d, original) => JSON.stringify(toType(d)) !== JSON.stringify(original ? toType(toDraft(original)) : null);

// Does the editor hold something other than the live type? (A saved draft that differs counts, so Publish stays on.)
export const differsFromLive = (d, type) => {
  if (!type) return true;
  const { draft, ...liveOnly } = type;
  return JSON.stringify(toType(d)) !== JSON.stringify(toType(toDraft(liveOnly)));
};

// "Version 3, published 12 Nov 2026" / "Not published yet" / a live type from before versions were kept.
export const versionText = (type) => {
  if (!type || type.unpublished) return "Not published yet";
  if (!type.version) return "Live since before versions were kept";
  const when = type.publishedAt ? formatDate(type.publishedAt) : null;
  return `Version ${type.version}${when ? `, published ${when}` : ""}`;
};

export const SAVE_ERRORS = {
  forbidden: "Only the owner can change product types.",
  invalid_type_id: "That id is not allowed. Use letters, digits and dashes.",
  invalid_type_name: "The name must be 1 to 60 characters.",
  invalid_department: "That department no longer exists.",
  invalid_categories: "One of the chosen categories no longer exists.",
  invalid_axes: "The server rejected these options. Check names and suggested values.",
  invalid_kind: "Pick goods, service or package.",
  invalid_quantity_mode: "Pick how buyers choose a quantity.",
  invalid_size_chart: "That size chart no longer exists. Pick another or none.",
  invalid_restricted_to: "One of the shop categories it is restricted to no longer exists.",
  no_draft: "There is no draft to publish. Save a draft first.",
  invalid_note: "Keep the version note under 200 characters.",
};
export const saveError = (e) => SAVE_ERRORS[e?.code ?? e?.message] ?? SAVE_ERRORS[String(e?.message ?? "").match(/[a-z_]+/)?.[0]] ?? "Could not save. Try again.";
