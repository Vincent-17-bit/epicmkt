import { addAxis, addValue, canAddAxis, choicesIn, colourHexOf, effectiveLimits, emptyOptionsForm, isColourNamedAxis, limitMessage } from "@epicmkt/shared";

const same = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
const colourLabel = (label) => /colou?r|rangi/i.test(String(label ?? ""));

// A specification row buyers choose between ("Color: Black, Grey, White", "Weight: 400 g, 700 g, 900 g") becomes an option type with one
// value per choice, so each choice can have its own price, stock and photo in the Options step. An option type with the same name is
// reused and only the missing choices are added. Colours get their swatch from the name.
// Returns { options, count } or { error } (a sentence for the seller).
export function specToOption(current, label, value, limits = effectiveLimits()) {
  const choices = choicesIn(value);
  if (choices.length === 0) return { error: "Type the choices first, separated by commas." };
  let options = current ?? emptyOptionsForm();
  let axis = options.axes.find((a) => same(a.label, label));
  if (!axis) {
    if (!canAddAxis(options, limits)) return { error: limitMessage("axes", limits) };
    options = addAxis(options, { label: String(label).trim(), display: colourLabel(label) ? "swatch" : "button" }, limits);
    axis = options.axes[options.axes.length - 1];
  }
  let count = 0;
  let problem = "";
  for (const choice of choices) {
    const extras = isColourNamedAxis(axis) && colourHexOf(choice) ? { color: colourHexOf(choice) } : {};
    const r = addValue(options, axis.key, choice, extras, limits);
    if (r.error === "duplicate") { count += 1; continue; }
    if (r.error) { problem = r.error === "long" ? `“${choice.slice(0, 30)}” is too long for a choice (40 characters at most).` : limitMessage(r.error, limits, r.plan); continue; }
    options = r.options;
    count += 1;
  }
  if (count === 0) return { error: problem || "None of those choices could be added." };
  return { options, count, ...(problem ? { problem } : {}) };
}
