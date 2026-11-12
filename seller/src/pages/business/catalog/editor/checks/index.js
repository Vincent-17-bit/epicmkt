import { PRICED, filled, parseKes } from "../fields.js";

// The quality-check registry. A check is a plain definition:
//   { id, weight, step, focus, todo, done_text, isDone(form, mediaCount), when?(form) }
// qualityChecks() turns the registered definitions into the rows the checklist and the score read.
// Checks are advisory only: nothing here ever stops a save (validateItemForm does that).
// Add a check by creating its own file in this folder and appending one line below (see ../README.md).

const photo = { id: "photo", weight: 25, step: "media", focus: "media-add", todo: "Add a photo", done_text: "Has a photo", isDone: (_form, mediaCount) => mediaCount > 0 };
const name = { id: "name", weight: 5, step: "basics", focus: "name", todo: "Give it a name", done_text: "Has a name", isDone: (form) => String(form.name ?? "").trim().length >= 2 };
const short = { id: "short", weight: 15, step: "basics", focus: "shortDescription", todo: "Add a short description", done_text: "Has a short description", isDone: (form) => filled(form.shortDescription) };
const description = { id: "description", weight: 15, step: "basics", focus: "description", todo: "Write the full description", done_text: "Has a full description", isDone: (form) => String(form.description ?? "").trim().length >= 60 };
const section = { id: "section", weight: 5, step: "basics", focus: "section", todo: "Choose a section", done_text: "Has a section", isDone: (form) => filled(form.section) };
const price = { id: "price", weight: 15, step: "price", focus: "price", todo: "Set a price", done_text: "Has a price", isDone: (form) => !PRICED.includes(form.priceType) || parseKes(form.price) !== null };
const highlights = { id: "highlights", weight: 10, step: "details", focus: "add-highlight", todo: "Add 1 highlight", done_text: "Has highlights", isDone: (form) => (form.highlights ?? []).some((h) => filled(h.text)) };
const specs = { id: "specs", weight: 10, step: "details", focus: "add-spec", todo: "Add 1 specification", done_text: "Has specifications", isDone: (form) => (form.specs ?? []).some((s) => filled(s.label) && filled(s.value)) };

// Order is the order of the checklist on screen. Other prompts append their own block at the end of this list.
export const CHECKS = [photo, name, short, description, section, price, highlights, specs];

// Appends a check (or inserts it after another one by id). Throws on a repeated id so two prompts cannot silently shadow each other.
export const registerCheck = (def, { after } = {}) => {
  if (CHECKS.some((c) => c.id === def.id)) throw new Error(`Quality check "${def.id}" is already registered.`);
  const at = after ? CHECKS.findIndex((c) => c.id === after) : -1;
  if (at === -1) CHECKS.push(def);
  else CHECKS.splice(at + 1, 0, def);
  return def;
};

export const qualityChecks = (form, mediaCount = 0) =>
  CHECKS.filter((c) => !c.when || c.when(form)).map((c) => ({
    id: c.id, weight: c.weight, done: Boolean(c.isDone(form, mediaCount)), step: c.step, focus: c.focus, todo: c.todo, done_text: c.done_text,
  }));

export { publishIssues } from "./publish.js";
