import { LABEL_SET_KEYS, LABEL_SETS, MAX_REQUIRED_ROWS, checkSpecRows, resolveRows, specIssues } from "@epicmkt/shared";

export const LEVELS = [["required", "Required"], ["recommended", "Recommended"], ["optional", "Optional"]];
export const INPUTS = [["text", "Text"], ["number", "Number"], ["choice", "Choice"], ["openValue", "Dictionary value"], ["boolean", "Yes or no"], ["dimension", "Dimension"]];
export const OPS = [["equals", "is"], ["in", "is one of"], ["tag", "has tag"], ["present", "is filled in"]];
export const LABEL_SET_OPTIONS = LABEL_SET_KEYS.map((k) => [k, LABEL_SETS[k].label]);
export { MAX_REQUIRED_ROWS };

let seq = 0;
const nextId = () => `r${++seq}`;

export const slugOf = (label) => String(label ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const uniqueKey = (base, taken) => {
  const root = base || "row";
  let key = root;
  for (let n = 2; taken.includes(key); n += 1) key = `${root}-${n}`;
  return key;
};

const LEAVES = ["equals", "in", "tag", "present"];

function leafOf(c) {
  const op = LEAVES.find((k) => c[k] !== undefined);
  if (!op || typeof c.row !== "string" || Object.keys(c).length !== 2) return null;
  const value = op === "in" ? c.in.join(", ") : op === "present" ? (c.present ? "yes" : "no") : String(c[op]);
  return { row: c.row, op, value };
}

export function conditionFrom(cond) {
  if (cond === undefined || cond === null) return null;
  const single = leafOf(cond);
  if (single) return { join: "all", leaves: [single] };
  const join = Array.isArray(cond.all) ? "all" : Array.isArray(cond.any) ? "any" : null;
  if (join && Object.keys(cond).length === 1) {
    const leaves = cond[join].map((c) => (c && typeof c === "object" ? leafOf(c) : null));
    if (leaves.length > 0 && leaves.every(Boolean)) return { join, leaves };
  }
  return { raw: cond };
}

const listOf = (text) => String(text ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function leafTo(l) {
  if (l.op === "in") return { row: l.row, in: listOf(l.value) };
  if (l.op === "present") return { row: l.row, present: l.value !== "no" };
  return { row: l.row, [l.op]: String(l.value ?? "").trim() };
}

export function conditionTo(form) {
  if (!form) return undefined;
  if (form.raw) return form.raw;
  const leaves = form.leaves.filter((l) => l.row).map(leafTo);
  if (leaves.length === 0) return undefined;
  return leaves.length === 1 ? leaves[0] : { [form.join]: leaves };
}

export const blankLeaf = (rowKey = "") => ({ row: rowKey, op: "equals", value: "" });

export function fromRows(rows) {
  return (rows ?? []).map((r) => ({
    key: r.key,
    label: r.label,
    level: r.level,
    input: r.input,
    choicesText: Array.isArray(r.choices) ? r.choices.join(", ") : "",
    labelSet: r.labelSet ?? "",
    requiredIf: conditionFrom(r.requiredIf),
    showIf: conditionFrom(r.showIf),
    fresh: false,
    id: nextId(),
  }));
}

export function toRows(drafts) {
  return drafts.map((d) => {
    const out = { key: d.key, label: d.label.trim(), level: d.level, input: d.input };
    if (d.input === "choice") {
      if (d.labelSet) out.labelSet = d.labelSet;
      else out.choices = listOf(d.choicesText);
    }
    const requiredIf = conditionTo(d.requiredIf);
    const showIf = conditionTo(d.showIf);
    if (requiredIf) out.requiredIf = requiredIf;
    if (showIf) out.showIf = showIf;
    return out;
  });
}

export function addRow(drafts) {
  return [...drafts, { key: uniqueKey("", drafts.map((d) => d.key)), label: "", level: "optional", input: "text", choicesText: "", labelSet: "", requiredIf: null, showIf: null, fresh: true, id: nextId() }];
}

export function removeRow(drafts, index) {
  const gone = drafts[index]?.key;
  const mentions = (c) => c && (c.raw ? JSON.stringify(c.raw).includes(`"row":"${gone}"`) : c.leaves.some((l) => l.row === gone));
  if (drafts.some((d, i) => i !== index && (mentions(d.requiredIf) || mentions(d.showIf)))) return null;
  return drafts.filter((_, i) => i !== index);
}

export function moveRow(drafts, index, by) {
  const to = index + by;
  if (to < 0 || to >= drafts.length) return drafts;
  const next = [...drafts];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

export function setRow(drafts, index, patch) {
  return drafts.map((d, i) => {
    if (i !== index) return d;
    const next = { ...d, ...patch };
    if (patch.label !== undefined && d.fresh) next.key = uniqueKey(slugOf(patch.label), drafts.filter((_, j) => j !== i).map((x) => x.key));
    return next;
  });
}

export const requiredCount = (rows) => rows.filter((r) => r.level === "required" || r.requiredIf !== undefined).length;

export function validate(drafts) {
  const rows = toRows(drafts);
  const errors = checkSpecRows(rows);
  drafts.forEach((d, i) => { if (!d.label.trim()) errors.push(`Row ${i + 1} needs a label`); });
  return { rows, errors: [...new Set(errors)], required: requiredCount(rows), ok: errors.length === 0 };
}

export const isDirty = (drafts, original) => JSON.stringify(toRows(drafts)) !== JSON.stringify(original ?? []);

export function conditionText(form, labelOf) {
  if (!form) return "";
  if (form.raw) return "Custom rule";
  const part = (l) => `${labelOf(l.row)} ${l.op === "present" ? (l.value === "no" ? "is empty" : "is filled in") : `${OPS.find((o) => o[0] === l.op)[1]} ${l.value}`}`;
  return form.leaves.map(part).join(form.join === "all" ? " and " : " or ");
}

export function previewOf(rows, answers = {}, tagAnswers = {}) {
  const specs = rows.filter((r) => answers[r.key] !== undefined && String(answers[r.key]).trim() !== "").map((r) => ({ group: "Features & Specs", label: r.label, value: answers[r.key] }));
  const item = { specs };
  const tags = (_value, row) => listOf(tagAnswers[row.key]);
  const shown = resolveRows(item, rows, { tags });
  if (checkSpecRows(rows).length > 0) return { shown, blockers: [], warnings: [], score: null, invalid: true };
  const verdict = specIssues(item, { specRows: rows }, { tags });
  return { shown, blockers: verdict.blockers, warnings: verdict.warnings, score: verdict.score };
}

export const tagRows = (rows) => {
  const out = new Set();
  const walk = (c) => {
    if (!c || typeof c !== "object") return;
    if (c.tag !== undefined && c.row) out.add(c.row);
    for (const k of ["all", "any"]) if (Array.isArray(c[k])) c[k].forEach(walk);
    if (c.not) walk(c.not);
  };
  rows.forEach((r) => { walk(r.requiredIf); walk(r.showIf); });
  return out;
};

export const SAVE_ERRORS = {
  forbidden: "Only the owner can change these rules.",
  type_not_found: "That product type no longer exists.",
  invalid_spec_rows: "The server rejected these rows. Check keys, labels, choices and conditions.",
  too_many_required: `A type can have at most ${MAX_REQUIRED_ROWS} required rows. A row with a “required when” rule counts.`,
};
export const saveError = (e) => SAVE_ERRORS[e?.code ?? e?.message] ?? SAVE_ERRORS[String(e?.message ?? "").match(/[a-z_]+/)?.[0]] ?? "Could not save. Try again.";
