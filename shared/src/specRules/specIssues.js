import { GENERIC_GOODS_TEMPLATE } from "./genericTemplate.js";
import { checkSpecRows } from "./rows.js";

const FIELD_FALLBACK = { brand: "brand", "pack-size": "packSize", includes: "includes" };

const fold = (s) => String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

const filled = (v) => {
  if (typeof v === "string") return v.trim() !== "";
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "boolean") return true;
  if (Array.isArray(v)) return v.some(filled);
  return false;
};

function hasValue(item, row) {
  const label = fold(row.label);
  const specs = Array.isArray(item?.specs) ? item.specs : [];
  if (specs.some((s) => fold(s?.label) === label && filled(s?.value))) return true;
  const field = FIELD_FALLBACK[row.key];
  return field ? filled(item?.[field]) : false;
}

export function specIssues(item, type, { grandfathered = false } = {}) {
  const rows = type?.specRows ?? GENERIC_GOODS_TEMPLATE.specRows;
  const problems = checkSpecRows(rows);
  if (problems.length) throw new Error(`specIssues: invalid specRows for "${type?.id ?? "generic"}": ${problems.join("; ")}`);

  const blockers = [];
  const warnings = [];
  let recommended = 0;
  let answered = 0;

  for (const row of rows) {
    if (row.level === "optional") continue;
    const ok = hasValue(item, row);
    if (row.level === "recommended") {
      recommended += 1;
      if (ok) answered += 1;
      else warnings.push({ key: row.key, label: row.label, level: row.level, message: `${row.label} is recommended` });
    } else if (!ok) {
      const issue = { key: row.key, label: row.label, level: row.level, message: `${row.label} is required` };
      (grandfathered ? warnings : blockers).push(issue);
    }
  }

  const score = recommended === 0 ? 100 : Math.round((answered / recommended) * 100);
  return { blockers, warnings, score };
}
