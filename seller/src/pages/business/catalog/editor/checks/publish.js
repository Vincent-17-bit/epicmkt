import { specIssues } from "@epicmkt/shared";
import { hasTemplate, itemOfForm, tagsOfForm } from "../typedRows.js";

const issue = (i, step) => ({ id: `row-${i.key}`, key: i.key, label: i.label, level: i.level, message: i.message, step, focus: `row-${i.key}` });

export function publishIssues(form, { type, grandfathered = false, colourPhotos, sizeChart } = {}) {
  if (!hasTemplate(type)) return null;
  const r = specIssues(itemOfForm(form), type, { grandfathered, tags: tagsOfForm(form) });
  const blockers = r.blockers.map((i) => issue(i, "basics"));
  const warnings = r.warnings.map((i) => issue(i, i.level === "required" ? "basics" : "details"));
  if (Array.isArray(colourPhotos)) {
    colourPhotos.filter((c) => !c.count).forEach((c) => warnings.push({ id: `photo-${c.id}`, key: `photo-${c.id}`, label: `Photo of ${c.label}`, message: `Add a photo of the ${c.label} colour`, step: "media", focus: "media-add" }));
  }
  if (sizeChart?.needed && !sizeChart.has) warnings.push({ id: "size-chart", key: "size-chart", label: "Size chart", message: "Add a size chart so customers can choose a size", step: "sizeguide", focus: null });
  return { blockers, warnings, score: r.score, canPublish: blockers.length === 0 };
}
