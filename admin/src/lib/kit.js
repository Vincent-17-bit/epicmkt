// Category kits (Prompt 11.7): export a category's product types, spec rules, size charts and open values as JSON, import them into another
// environment after a diff preview, and clone a type. Pure functions; the page passes in what it loaded and the api to apply with.
//
// A kit is plain data and carries no ids that only exist in one environment: types are found by id (a slug), size charts by category and
// name, open values by kind and key. Everything is sorted, so exporting twice gives the same text, and export, import and export again
// gives the same kit.

import { checkSpecRows, cleanSizeChart, normalizeValueKey, validateOpenValue } from "@epicmkt/shared";

export const KIT_FORMAT = "epicmkt-kit";
export const KIT_VERSION = 1;
export const KIT_LIMITS = { bytes: 2_000_000, types: 100, sizeCharts: 100, values: 2000 };
export const TYPE_ID = /^[a-z][a-z0-9-]{1,39}$/;
const AXIS_DISPLAYS = ["swatch", "image-card", "button", "text-card", "dropdown"];

const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const by = (...keys) => (a, b) => keys.map((k) => String(a[k] ?? "").localeCompare(String(b[k] ?? ""))).find((n) => n !== 0) ?? 0;
const chartKey = (c) => `${c.category ?? ""}|${String(c.name ?? "").trim().toLowerCase()}`;
const valueKey = (v) => `${v.kind}|${normalizeValueKey(v.label)}`;
const sortedTags = (t) => [...new Set(t ?? [])].sort();

// ---- Export ------------------------------------------------------------------------------------------------------------------

/**
 * @param {object} input
 * @param {{ id: string, name: string }} input.category
 * @param {object[]} input.types       rows from listTypeSettings().types
 * @param {object[]} input.specTypes   rows from listSpecTypes()
 * @param {object[]} input.sizeCharts  rows from listSizeCharts()
 * @param {object[]|null} input.values approved open values (all of them: values belong to no category), or null to leave them out
 */
export function buildKit({ category, types = [], specTypes = [], sizeCharts = [], values = null }) {
  const mine = types.filter((t) => (t.categoryIds ?? []).includes(category.id));
  const ids = new Set(mine.map((t) => t.id));
  const kit = {
    format: KIT_FORMAT,
    version: KIT_VERSION,
    category: { id: category.id, name: category.name },
    types: mine.map((t) => ({
      id: t.id, name: t.name, kind: t.kind ?? "good", departmentId: t.departmentId ?? null,
      categoryIds: [...(t.categoryIds ?? [])].sort(), axes: clone(t.axes ?? []), specRows: clone(specTypes.find((s) => s.id === t.id)?.specRows ?? []), active: t.active !== false
    })).sort(by("id")),
    sizeCharts: sizeCharts.filter((c) => (c.product_type_ids ?? []).some((id) => ids.has(id))).map((c) => ({
      name: c.name, category: c.category ?? null, unit: c.unit, columns: clone(c.columns), rows: clone(c.rows), active: c.active !== false,
      typeIds: [...(c.product_type_ids ?? [])].filter((id) => ids.has(id)).sort()
    })).sort(by("category", "name")),
    values: (values ?? []).filter((v) => v.status === "approved").map((v) => ({ kind: v.kind, label: v.label, hex: v.hex ?? null, tags: sortedTags(v.tags) })).sort(by("kind", "label"))
  };
  if (values === null) delete kit.values;
  return kit;
}

export const kitText = (kit) => `${JSON.stringify(kit, null, 2)}\n`;
export const kitFileName = (kit) => `kit-${kit.category.id}.json`;
export const kitCounts = (kit) => ({ types: kit.types.length, specRows: kit.types.reduce((n, t) => n + t.specRows.length, 0), sizeCharts: kit.sizeCharts.length, values: kit.values?.length ?? 0 });

// ---- Read and validate -------------------------------------------------------------------------------------------------------

const axisProblems = (axes) => {
  if (!Array.isArray(axes) || axes.length > 3) return ["axes must be a list of at most 3"];
  const out = [];
  if (new Set(axes.map((a) => a?.key)).size !== axes.length) out.push("axis keys must be unique");
  axes.forEach((a, i) => {
    if (!/^[a-z][a-z0-9_]{0,29}$/.test(a?.key ?? "")) out.push(`axis ${i + 1}: the key is not valid`);
    if (!String(a?.label ?? "").trim() || a.label.length > 40) out.push(`axis ${i + 1}: needs a name of up to 40 characters`);
    if (!AXIS_DISPLAYS.includes(a?.display)) out.push(`axis ${i + 1}: unknown display "${a?.display}"`);
    for (const s of a?.suggested ?? []) if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(s?.id ?? "") || !String(s?.label ?? "").trim()) out.push(`axis ${i + 1}: a suggested value is not valid`);
  });
  return out;
};

/** @returns {{ ok: true, kit: object } | { ok: false, errors: string[] }} */
export function parseKit(text) {
  if (typeof text !== "string" || !text.trim()) return { ok: false, errors: ["Choose a kit file or paste its text."] };
  if (text.length > KIT_LIMITS.bytes) return { ok: false, errors: ["This file is too large to be a kit."] };
  let raw;
  try { raw = JSON.parse(text); } catch { return { ok: false, errors: ["This is not valid JSON."] }; }
  if (!raw || typeof raw !== "object" || raw.format !== KIT_FORMAT) return { ok: false, errors: ["This is not an EpicMKT kit file."] };
  if (raw.version !== KIT_VERSION) return { ok: false, errors: [`This kit is version ${raw.version}; this page reads version ${KIT_VERSION}.`] };
  const errors = [];
  if (!raw.category?.id || !raw.category?.name) errors.push("The kit does not say which category it is for.");
  for (const k of ["types", "sizeCharts"]) if (!Array.isArray(raw[k])) errors.push(`"${k}" must be a list.`);
  if (raw.values !== undefined && !Array.isArray(raw.values)) errors.push('"values" must be a list.');
  if (errors.length) return { ok: false, errors };
  if (raw.types.length > KIT_LIMITS.types || raw.sizeCharts.length > KIT_LIMITS.sizeCharts || (raw.values?.length ?? 0) > KIT_LIMITS.values) return { ok: false, errors: ["The kit has more entries than one import allows."] };

  const seen = new Set();
  for (const t of raw.types) {
    const at = `Type "${t?.id ?? "?"}"`;
    if (!TYPE_ID.test(t?.id ?? "")) { errors.push(`${at}: the id is not valid (lower-case letters, numbers and dashes, 2 to 40).`); continue; }
    if (seen.has(t.id)) errors.push(`${at} appears twice.`);
    seen.add(t.id);
    if (!String(t.name ?? "").trim() || t.name.length > 60) errors.push(`${at}: needs a name of up to 60 characters.`);
    for (const p of axisProblems(t.axes)) errors.push(`${at}: ${p}.`);
    if (!Array.isArray(t.specRows)) errors.push(`${at}: spec rows must be a list.`);
    else for (const p of checkSpecRows(t.specRows)) errors.push(`${at}: ${p}`);
    if (!Array.isArray(t.categoryIds)) errors.push(`${at}: category ids must be a list.`);
  }
  raw.sizeCharts.forEach((c, i) => {
    const r = cleanSizeChart({ name: c?.name, category: c?.category ?? null, unit: c?.unit, columns: c?.columns, rows: c?.rows });
    if (!r.ok) errors.push(`Size chart ${i + 1} ("${c?.name ?? "?"}"): ${Object.values(r.errors ?? {})[0] ?? "is not valid"}.`);
    for (const id of c?.typeIds ?? []) if (!seen.has(id) && !TYPE_ID.test(id)) errors.push(`Size chart "${c?.name}": "${id}" is not a type id.`);
  });
  (raw.values ?? []).forEach((v, i) => {
    const r = validateOpenValue({ kind: v?.kind, label: v?.label, tags: v?.tags ?? [], ...(v?.hex ? { hex: v.hex } : {}) });
    if (!r.ok) errors.push(`Value ${i + 1} ("${v?.label ?? "?"}"): ${r.error?.message ?? r.error?.code ?? "is not valid"}.`);
  });
  if (errors.length) return { ok: false, errors };
  return { ok: true, kit: raw };
}

// ---- Diff preview ------------------------------------------------------------------------------------------------------------

/**
 * What importing `kit` into an environment would do.
 * @param {object} kit
 * @param {{ types: object[], specTypes: object[], sizeCharts: object[], values?: object[], departments?: {id:string}[], categories?: {id:string}[] }} env
 *   what the target already has (the same lists the export reads, plus its departments and categories)
 */
export function diffKit(kit, env) {
  const entries = [];
  const add = (e) => entries.push({ changes: [], note: null, ...e });
  const haveType = new Map(env.types.map((t) => [t.id, t]));
  const knownCats = env.categories ? new Set(env.categories.map((c) => c.id)) : null;
  const knownDeps = env.departments ? new Set(env.departments.map((d) => d.id)) : null;
  const typeIdsAfter = new Set([...haveType.keys(), ...kit.types.map((t) => t.id)]);

  for (const t of kit.types) {
    const old = haveType.get(t.id);
    const dropCats = knownCats ? t.categoryIds.filter((c) => !knownCats.has(c) && !(env.types ?? []).some((x) => (x.categoryIds ?? []).includes(c))) : [];
    const dropDep = t.departmentId && knownDeps && !knownDeps.has(t.departmentId);
    const notes = [dropCats.length ? `not in this environment, left out: ${dropCats.join(", ")}` : null, dropDep ? `department "${t.departmentId}" is not here, left empty` : null].filter(Boolean);
    // Categories are only ever ADDED by an import: a category the kit does not mention keeps selling the type.
    const categoryIds = [...new Set([...(old?.categoryIds ?? []), ...t.categoryIds.filter((c) => !dropCats.includes(c))])].sort();
    const next = { name: t.name, departmentId: dropDep ? null : t.departmentId, categoryIds, axes: t.axes, active: t.active };
    if (!old) add({ entity: "type", key: t.id, label: t.name, action: "add", changes: [`${t.axes.length} ${t.axes.length === 1 ? "option" : "options"}`], note: notes.join("; ") || null, next });
    else {
      const changes = [];
      if (old.name !== next.name) changes.push(`name: "${old.name}" to "${next.name}"`);
      if ((old.departmentId ?? null) !== next.departmentId) changes.push(`department: ${old.departmentId ?? "none"} to ${next.departmentId ?? "none"}`);
      if (!same([...(old.categoryIds ?? [])].sort(), next.categoryIds)) changes.push("more categories");
      if (!same(old.axes ?? [], next.axes)) changes.push("options");
      if ((old.active !== false) !== next.active) changes.push(next.active ? "switched on" : "switched off");
      add({ entity: "type", key: t.id, label: t.name, action: changes.length ? "change" : "same", changes, note: notes.join("; ") || null, next });
    }
    const oldRows = env.specTypes.find((s) => s.id === t.id)?.specRows ?? [];
    if (t.specRows.length || oldRows.length) {
      if (same(oldRows, t.specRows)) add({ entity: "specRows", key: t.id, label: `${t.name}: spec rules`, action: "same", rows: t.specRows });
      else add({ entity: "specRows", key: t.id, label: `${t.name}: spec rules`, action: oldRows.length ? "change" : "add", changes: [`${oldRows.length} to ${t.specRows.length} rows`], rows: t.specRows });
    }
  }

  const haveChart = new Map(env.sizeCharts.map((c) => [chartKey(c), c]));
  for (const c of kit.sizeCharts) {
    const old = haveChart.get(chartKey(c));
    const typeIds = c.typeIds.filter((id) => typeIdsAfter.has(id));
    // An import only ever ADDS types to a chart: a type the kit does not mention keeps the chart it has (saving a shorter list would release it).
    const merged = [...new Set([...(old?.product_type_ids ?? []), ...typeIds])].sort();
    const fields = { name: c.name, category: c.category ?? null, unit: c.unit, columns: c.columns, rows: c.rows, active: c.active, product_type_ids: merged };
    const note = typeIds.length < c.typeIds.length ? `types not here, left out: ${c.typeIds.filter((id) => !typeIdsAfter.has(id)).join(", ")}` : null;
    if (!old) add({ entity: "sizeChart", key: chartKey(c), label: c.name, action: "add", changes: [`${c.rows.length} rows`], note, fields });
    else {
      const changes = [];
      if (old.unit !== c.unit) changes.push(`unit: ${old.unit} to ${c.unit}`);
      if (!same(old.columns, c.columns)) changes.push("columns");
      if (!same(old.rows, c.rows)) changes.push("rows");
      if ((old.active !== false) !== c.active) changes.push(c.active ? "switched on" : "switched off");
      if (!same([...(old.product_type_ids ?? [])].sort(), merged)) changes.push("more types it applies to");
      add({ entity: "sizeChart", key: chartKey(c), label: c.name, action: changes.length ? "change" : "same", changes, note, fields, existingId: old.id });
    }
  }

  const haveValue = new Map((env.values ?? []).filter((v) => v.status !== "merged").map((v) => [valueKey(v), v]));
  for (const v of kit.values ?? []) {
    const old = haveValue.get(valueKey(v));
    const fields = { ...(v.hex ? { hex: v.hex } : {}), ...(v.tags?.length ? { tags: v.tags } : {}) };
    if (!old) add({ entity: "value", key: valueKey(v), label: `${v.label} (${v.kind})`, action: "add", kind: v.kind, text: v.label, fields });
    else {
      const changes = [];
      if (old.status === "pending") changes.push("approved");
      if (v.hex && !old.hex) changes.push("shade added");
      if (v.tags?.length && !(old.tags ?? []).length) changes.push("tags added");
      add({ entity: "value", key: valueKey(v), label: `${v.label} (${v.kind})`, action: changes.length ? "change" : "same", changes, kind: v.kind, text: v.label, fields });
    }
  }

  const counts = { add: 0, change: 0, same: 0 };
  for (const e of entries) counts[e.action] += 1;
  return { entries, counts, empty: counts.add + counts.change === 0 };
}

/** Which operations an import runs, in the order that works: types, their spec rules, size charts (they point at types), then values. */
export function planImport(diff) {
  const todo = diff.entries.filter((e) => e.action === "add" || e.action === "change");
  const order = { type: 0, specRows: 1, sizeChart: 2, value: 3 };
  return todo.sort((a, b) => order[a.entity] - order[b.entity]).map((e) => ({
    op: { type: "saveTypeSettings", specRows: "saveSpecRows", sizeChart: "saveSizeChart", value: "importOptionValue" }[e.entity],
    key: e.key,
    label: e.label,
    args: e.entity === "type" ? [e.key, e.next] : e.entity === "specRows" ? [e.key, e.rows] : e.entity === "sizeChart" ? [e.existingId ?? null, e.fields] : [e.kind, e.text, Object.keys(e.fields).length ? e.fields : null]
  }));
}

/**
 * Runs a plan against the admin api, one operation at a time, and stops at the first refusal. What was applied stays applied (each
 * operation is its own saved change in the audit log); the result says how far it got so the rest can be fixed and run again.
 */
export async function applyPlan(plan, api, { onProgress = () => {} } = {}) {
  const done = [];
  for (const step of plan) {
    try {
      await api[step.op](...step.args);
      done.push(step);
      onProgress(done.length, plan.length, step);
    } catch (error) {
      return { ok: false, applied: done.length, total: plan.length, failed: { step, error } };
    }
  }
  return { ok: true, applied: done.length, total: plan.length, failed: null };
}

// ---- Clone a type ------------------------------------------------------------------------------------------------------------

export const slugify = (text) => String(text ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** A free id for a new type: the slug of the name, then -2, -3, … Always valid, whatever the name. */
export function freeTypeId(name, taken = []) {
  let base = slugify(name).slice(0, 36).replace(/-+$/g, "");
  if (!/^[a-z]/.test(base)) base = `type-${base}`.replace(/-+$/g, "");
  if (base.length < 2) base = base ? `type-${base}` : "type";
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const id = `${base.slice(0, 36 - String(n).length - 1).replace(/-+$/g, "")}-${n}`;
    if (!used.has(id)) return id;
  }
}

/** The copy of a type: same options, spec rules, department and categories, switched OFF until someone has looked at it. */
export function cloneType({ type, specRows = [], name, takenIds = [] }) {
  const title = String(name ?? "").trim();
  if (title.length < 2 || title.length > 60) return { ok: false, error: "Give the copy a name of 2 to 60 characters." };
  const id = freeTypeId(title, [...takenIds, type.id]);
  return {
    ok: true,
    id,
    input: { name: title, departmentId: type.departmentId ?? null, categoryIds: [...(type.categoryIds ?? [])], axes: clone(type.axes ?? []), active: false },
    specRows: clone(specRows)
  };
}

// ---- Words for what the database says --------------------------------------------------------------------------------------

export const KIT_ERRORS = {
  forbidden: "Your role cannot make this change.",
  invalid_type_id: "The type id is not valid.",
  invalid_type_name: "A type needs a name of up to 60 characters.",
  invalid_axes: "The options of the type are not valid.",
  invalid_department: "The department does not exist here.",
  invalid_categories: "A category the type lists does not exist here.",
  invalid_rows: "A spec row is not valid.",
  invalid_spec_rows: "A spec row is not valid.",
  type_not_found: "The type does not exist here yet.",
  invalid_chart: "The size chart is not valid.",
  invalid_name: "The size chart needs a name.",
  invalid_unit: "The size chart unit is not valid.",
  duplicate_chart: "A size chart with that name already exists.",
  invalid_type_ids: "A size chart points at a type that does not exist here.",
  invalid_kind: "A value has an unknown kind.",
  invalid_label: "A value has an empty or too long name.",
  invalid_hex: "A colour shade is not valid.",
  invalid_tags: "A value has too many or invalid tags."
};

/** Words for a failed step: what was being applied, and why it was refused. */
export const failureText = (failed) => `${failed.step.label}: ${KIT_ERRORS[failed.error?.code] ?? failed.error?.message ?? "refused"}.`;
