import { GENERIC_GOODS_TEMPLATE } from "./genericTemplate.js";
import { checkSpecRows } from "./rows.js";
import { hasRowValue, resolveRows, specValue } from "./conditional.js";
import { rowChoices } from "./labels.js";
import { normalizeValueKey } from "../openValues.js";

const choiceOk = (row, value) => {
  const choices = rowChoices(row);
  if (!choices) return true;
  const key = normalizeValueKey(value);
  return choices.some((c) => normalizeValueKey(c) === key);
};

export function specIssues(item, type, { grandfathered = false, tags } = {}) {
  const defined = type?.specRows ?? GENERIC_GOODS_TEMPLATE.specRows;
  const problems = checkSpecRows(defined);
  if (problems.length) throw new Error(`specIssues: invalid specRows for "${type?.id ?? "generic"}": ${problems.join("; ")}`);

  const blockers = [];
  const warnings = [];
  let recommended = 0;
  let answered = 0;

  for (const row of resolveRows(item, defined, { tags })) {
    if (row.level === "optional") continue;
    const present = hasRowValue(item, row);
    const own = specValue(item, row);
    const invalid = present && own !== undefined && row.input === "choice" && !choiceOk(row, own);
    const base = { key: row.key, label: row.label, level: row.level };
    if (row.level === "recommended") {
      recommended += 1;
      if (present && !invalid) answered += 1;
      else if (invalid) warnings.push({ ...base, code: "invalid", message: `${row.label} must be one of: ${rowChoices(row).join(", ")}` });
      else warnings.push({ ...base, code: "missing", message: `${row.label} is recommended` });
      continue;
    }
    if (present && !invalid) continue;
    const issue = invalid
      ? { ...base, code: "invalid", message: `${row.label} must be one of: ${rowChoices(row).join(", ")}` }
      : { ...base, code: "missing", message: `${row.label} is required` };
    (grandfathered ? warnings : blockers).push(issue);
  }

  const score = recommended === 0 ? 100 : Math.round((answered / recommended) * 100);
  return { blockers, warnings, score };
}
