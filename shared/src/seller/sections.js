// Rules for renaming and removing an item section. The database functions rename_item_section and
// remove_item_section (migration 0008) are the authority; the mock API and the UI use these pure functions so that
// local state matches what the database does. A shared case table runs through both (see section-cases.js).
//
// Sections are an ordered list of names (seller_settings.settings.sections). items.section holds the name.

import { LIMITS } from "./item.js";

export class SectionError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export const normalizeSectionName = (name) => String(name ?? "").trim().replace(/\s+/g, " ");

const same = (a, b) => String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();
const indexOfName = (list, name, skip = -1) => list.findIndex((s, i) => i !== skip && same(s, name));

export function validSectionName(name) {
  const n = normalizeSectionName(name);
  return n.length >= 2 && n.length <= LIMITS.section;
}

// Rename keeps the section's position. If another section already has the new name (ignoring case), the two are
// merged: items move into the existing section and the old name is dropped from the list.
// Returns { sections, rewrite: { from, to }, merged, changed }.
export function planRename(list, from, to) {
  const next = normalizeSectionName(to);
  if (next.length < 2 || next.length > LIMITS.section) throw new SectionError("invalid_section_name");
  const i = indexOfName(list, normalizeSectionName(from));
  if (i < 0) throw new SectionError("section_not_found");
  const current = list[i];
  if (current === next) return { sections: [...list], rewrite: { from: current, to: current }, merged: false, changed: false };
  const j = indexOfName(list, next, i);
  if (j >= 0) {
    return { sections: list.filter((_, k) => k !== i), rewrite: { from: current, to: list[j] }, merged: true, changed: true };
  }
  return { sections: list.map((s, k) => (k === i ? next : s)), rewrite: { from: current, to: next }, merged: false, changed: true };
}

// Remove never deletes items: they move to moveTo, or to no section when moveTo is empty.
export function planRemove(list, name, moveTo = null) {
  const i = indexOfName(list, normalizeSectionName(name));
  if (i < 0) throw new SectionError("section_not_found");
  const target = normalizeSectionName(moveTo);
  let to = null;
  if (target) {
    const j = indexOfName(list, target);
    if (j < 0 || j === i) throw new SectionError("invalid_move_target");
    to = list[j];
  }
  return { sections: list.filter((_, k) => k !== i), rewrite: { from: list[i], to }, merged: false, changed: true };
}

// The section an item ends up with after a rewrite. Matching ignores case, like the database does.
export const applyRewrite = (section, rewrite) => (rewrite && same(section, rewrite.from) && section !== "" && section != null ? rewrite.to ?? "" : section);
