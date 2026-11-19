import { FEATURE_SWITCHES, PLAN_LIMIT_RULES, checkPlanLimits, formatKes, planLimitValues, planSwitches } from "@epicmkt/shared";
// Pure helpers for Plans, Categories and the template builder. They mirror the database's rules (migrations
// 0026 and 0027) so the screen can say what is wrong before saving; the database still has the last word.

export const MAX_FIELDS = 40;
export const MAX_DOCS = 10;
export const FIELD_TYPES = [
  ["text", "Short text"], ["number", "Number"], ["price", "Price (KES)"], ["boolean", "Yes / no"],
  ["select", "Choose one"], ["multiselect", "Choose several"], ["itemlist", "List of items"],
];
export const BADGES = ["", "Popular", "Best value"];
const hasOptions = (type) => type === "select" || type === "multiselect";

/** "Walk-ins welcome" -> "walkInsWelcome", made unique among `taken`. Always matches the database key rule. */
export function keyFromLabel(label, taken = []) {
  const words = String(label ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  let key = words.map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1))).join("");
  if (!key || !/^[a-z]/.test(key)) key = `field${key ? key[0].toUpperCase() + key.slice(1) : ""}`;
  key = key.slice(0, 36);
  let out = key;
  for (let n = 2; taken.includes(out); n += 1) out = `${key}${n}`;
  return out;
}

export const docKeyFromLabel = (label, taken = []) => {
  let base = String(label ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 36);
  if (base.length < 2) base = "document";
  let out = base;
  for (let n = 2; taken.includes(out); n += 1) out = `${base}_${n}`;
  return out;
};

/** Turns the options textarea (one per line) into a clean list. */
export const parseOptions = (text) => [...new Set(String(text ?? "").split("\n").map((l) => l.trim()).filter(Boolean))];

/** Removes empty and irrelevant properties so what is saved is exactly what the application form understands. */
export function cleanField(f) {
  const out = { key: f.key, label: String(f.label ?? "").trim(), type: f.type };
  if (hasOptions(f.type)) out.options = (f.options ?? []).map((o) => String(o).trim()).filter(Boolean);
  if (f.required) out.required = true;
  if (f.filterable) out.filterable = true;
  if (f.showOnCard) out.showOnCard = true;
  if (f.showIf?.field) out.showIf = { field: f.showIf.field, equals: f.showIf.equals ?? true };
  return out;
}

/** Problems with a template, keyed by field index, in plain words. {} means it can be saved. */
export function templateProblems(fields = []) {
  const problems = {};
  const add = (i, text) => { (problems[i] ??= []).push(text); };
  if (fields.length > MAX_FIELDS) add(0, `A category can have at most ${MAX_FIELDS} questions.`);
  const keys = fields.map((f) => f.key);
  fields.forEach((f, i) => {
    if (!String(f.label ?? "").trim()) add(i, "Give the question a label.");
    else if (f.label.trim().length > 80) add(i, "Keep the label to 80 characters.");
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(f.key ?? "")) add(i, "The key is not valid.");
    else if (keys.indexOf(f.key) !== i) add(i, "Another question already uses this key.");
    if (hasOptions(f.type)) {
      const opts = (f.options ?? []).map((o) => String(o).trim()).filter(Boolean);
      if (opts.length < 2) add(i, "Add at least two choices.");
      else if (opts.length > 30) add(i, "Use at most 30 choices.");
      else if (opts.some((o) => o.length > 60)) add(i, "Keep each choice to 60 characters.");
    }
    if (f.showIf?.field) {
      if (f.showIf.field === f.key) add(i, "A question cannot depend on itself.");
      else if (!keys.includes(f.showIf.field)) add(i, "It depends on a question that does not exist.");
    }
  });
  return problems;
}

export function docProblems(docs = []) {
  const problems = {};
  const add = (i, text) => { (problems[i] ??= []).push(text); };
  if (docs.length > MAX_DOCS) add(0, `At most ${MAX_DOCS} extra documents.`);
  docs.forEach((d, i) => {
    if (!String(d.label ?? "").trim()) add(i, "Name the document.");
    if (!String(d.why ?? "").trim()) add(i, "Say why it is needed. Applicants see this.");
    else if (d.why.trim().length > 200) add(i, "Keep the reason to 200 characters.");
    if (d.rule === "conditional" && !String(d.condition ?? "").trim()) add(i, "Say when it is needed, for example \"I carry a KEBS mark\".");
    if (docs.findIndex((x) => x.key === d.key) !== i) add(i, "Another document uses this key.");
  });
  return problems;
}

/** Moves item `from` to `to`, returning a new array (out-of-range moves return the list unchanged). */
export function move(list, from, to) {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Removing a question: also drops conditions that depended on it, so the template stays valid. */
export function removeField(fields, index) {
  const gone = fields[index]?.key;
  return fields.filter((_, i) => i !== index).map((f) => (f.showIf?.field === gone ? (({ showIf, ...rest }) => rest)(f) : f));
}

// ---- Plans -------------------------------------------------------------------------------------------------------


/** What a plan edit will mean, in words, for the confirmation step. */
export function planImpact(row, newPrice) {
  const lines = [];
  const live = Number(row.live_businesses) || 0;
  if (newPrice !== row.price_kes) {
    const diff = newPrice - row.price_kes;
    lines.push(`New and unpaid applications will owe ${formatKes(newPrice)} a month instead of ${formatKes(row.price_kes)} (${diff > 0 ? "+" : "-"}${formatKes(Math.abs(diff))}), straight away on the seller and application pages.`);
    lines.push(live === 0
      ? "No live businesses are on this plan."
      : `${live} live ${live === 1 ? "business pays" : "businesses pay"} the new price from ${live === 1 ? "its" : "their"} next payment (${formatKes(row.live_monthly_kes)} a month in total today). Time already paid for does not change, and each seller gets a message.`);
  }
  return lines;
}

export const planProblems = ({ price, benefits, badge }) => {
  const p = [];
  if (!Number.isInteger(price) || price < 0 || price > 100000) p.push("Enter a whole price between 0 and 100,000.");
  if ((benefits ?? []).length !== 3 || benefits.some((b) => String(b).trim().length < 2 || String(b).trim().length > 80)) p.push("Write exactly three benefits, 2 to 80 characters each.");
  if (badge && !BADGES.includes(badge)) p.push("Choose a badge from the list.");
  return p;
};

/** Plans grouped by category, standard first, for the table. */
export function groupPlans(rows = []) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.category_id)) map.set(r.category_id, { category_id: r.category_id, category_name: r.category_name, grp: r.grp, active: r.category_active, plans: {} });
    map.get(r.category_id).plans[r.plan_key] = r;
  }
  return [...map.values()];
}

export const CATEGORY_ERRORS = {
  plans_not_priced: "Set a price on both plans (Plans page) before switching this category on.",
  invalid_id: "The id uses lower-case letters, numbers and dashes (2 to 50 characters).",
  invalid_icon: "The icon name uses lower-case letters, numbers and dashes.",
  invalid_tier: "Choose a tier from A to D.",
  invalid_template: "The questions are not in a valid format.",
  too_many_fields: "A category can have at most 40 questions.",
  invalid_field_key: "A question has an invalid key.",
  duplicate_field_key: "Two questions share a key.",
  invalid_field_label: "Every question needs a label of up to 80 characters.",
  invalid_field_type: "A question has an unknown type.",
  options_required: "Choice questions need between 2 and 30 choices.",
  invalid_option: "A choice is empty or longer than 60 characters.",
  invalid_condition: "A question depends on a question that does not exist.",
  invalid_docs: "The documents are not in a valid format.",
  too_many_docs: "At most 10 extra documents.",
  invalid_doc_key: "A document has an invalid key.",
  duplicate_doc_key: "Two documents share a key.",
  invalid_doc_label: "Every document needs a name.",
  invalid_doc_rule: "A document must be required or conditional.",
  condition_required: "A conditional document needs a condition.",
  invalid_doc_why: "Every document needs a short reason (up to 200 characters).",
  plan_not_found: "That plan no longer exists.",
  invalid_price: "Enter a whole price between 0 and 100,000.",
  invalid_badge: "Choose a badge from the list.",
  three_benefits_required: "Write exactly three benefits.",
  invalid_benefit: "Each benefit must be 2 to 80 characters.",
  invalid_limits: "A limit is outside what the plan allows, or a switch is not on or off.",
  invalid_plan: "Choose Standard or Premium.",
  limits_not_found: "The plan limits are not set up yet.",
};

// ---- Plan limits and feature switches (Prompt 11.5) --------------------------------------------------------------------------

export const PLAN_NAMES = { standard: "Standard", premium: "Premium" };
export const LIMIT_GROUPS = [
  { key: "options", title: "Options and combinations", fields: Object.entries(PLAN_LIMIT_RULES.options).map(([key, r]) => ({ key, ...r })) },
  { key: "threeD", title: "3D and 360 views", fields: Object.entries(PLAN_LIMIT_RULES.threeD).map(([key, r]) => ({ key, ...r })) },
];
export const SWITCHES = FEATURE_SWITCHES;

/** The editing form for one plan: every limit as the number the plan has now (the hard limit when it lowers nothing), every switch as on or off. */
export function limitsForm(globalLimits, plan) {
  const v = planLimitValues(plan, globalLimits);
  const f = planSwitches(plan, globalLimits);
  return {
    options: Object.fromEntries(Object.entries(v.options).map(([k, n]) => [k, String(n)])),
    threeD: Object.fromEntries(Object.entries(v.threeD).map(([k, n]) => [k, String(n)])),
    features: { ...f },
  };
}

const whole = (t) => (/^\d+$/.test(String(t ?? "").trim()) ? Number(t) : NaN);

/** What the form sends. A blank limit means "no lower than the hard limit". */
export function limitsPayload(form) {
  const group = (g) => Object.fromEntries(Object.entries(form?.[g] ?? {}).filter(([, t]) => String(t ?? "").trim() !== "").map(([k, t]) => [k, whole(t)]));
  return { options: group("options"), threeD: group("threeD"), features: { ...(form?.features ?? {}) } };
}

/** Problems with the form, keyed like the shared rules ("options.axes"), in plain words. */
export const limitsProblems = (form) => checkPlanLimits(limitsPayload(form)).errors;

/** Live shops and plan versions on each plan, summed over every category. Plan limits are not versioned, so saving them never changes these. */
export function planTotals(rows = []) {
  const out = { standard: { live: 0, versions: 0, categories: 0 }, premium: { live: 0, versions: 0, categories: 0 } };
  for (const r of rows) {
    const t = out[r.plan_key];
    if (!t) continue;
    t.live += Number(r.live_businesses) || 0;
    t.versions += Number(r.versions) || 0;
    if (Number(r.live_businesses) > 0) t.categories += 1;
  }
  return out;
}

const shops = (n) => `${n} live ${n === 1 ? "shop" : "shops"}`;

/**
 * What a limits change will mean, in words, for the confirmation step.
 * @param {string} plan  "standard" | "premium"
 * @param {object} globalLimits  the stored limits for both plans, as admin_plan_limits returns them
 * @param {object} form  the editing form
 * @param {object[]} rows  the plan rows from listPlans, for the live counts
 */
export function limitsImpact(plan, globalLimits, form, rows = []) {
  const live = planTotals(rows)[plan]?.live ?? 0;
  const cats = planTotals(rows)[plan]?.categories ?? 0;
  const was = planLimitValues(plan, globalLimits);
  const wasOn = planSwitches(plan, globalLimits);
  const next = checkPlanLimits(limitsPayload(form));
  if (!next.ok) return [];
  const now = planLimitValues(plan, { [plan]: next.value });
  const nowOn = planSwitches(plan, { [plan]: next.value });
  const lines = [];
  for (const g of LIMIT_GROUPS) {
    for (const f of g.fields) {
      const a = was[g.key][f.key];
      const b = now[g.key][f.key];
      if (a === b) continue;
      lines.push(b < a
        ? `${f.label}: ${a} becomes ${b}. ${live === 0 ? "No live shops are on this plan." : `${shops(live)} in ${cats} ${cats === 1 ? "category" : "categories"} will be held to ${b} the next time they edit an item. Items already saved are not changed.`}`
        : `${f.label}: ${a} becomes ${b}. ${live === 0 ? "No live shops are on this plan." : `${shops(live)} can use the higher limit straight away.`}`);
    }
  }
  for (const sw of SWITCHES) {
    if (wasOn[sw.key] === nowOn[sw.key]) continue;
    lines.push(nowOn[sw.key]
      ? `${sw.label} is switched on for ${PLAN_NAMES[plan]}. ${live === 0 ? "No live shops are on this plan." : `${shops(live)} get it straight away.`}`
      : `${sw.label} is switched off for ${PLAN_NAMES[plan]}. ${live === 0 ? "No live shops are on this plan." : `${shops(live)} in ${cats} ${cats === 1 ? "category" : "categories"} lose it. Buyers stop seeing it.`}`);
  }
  return lines;
}

export const limitsChanged = (plan, globalLimits, form) => {
  const next = checkPlanLimits(limitsPayload(form));
  if (!next.ok) return false;
  return JSON.stringify(planLimitValues(plan, { [plan]: next.value })) !== JSON.stringify(planLimitValues(plan, globalLimits))
    || JSON.stringify(planSwitches(plan, { [plan]: next.value })) !== JSON.stringify(planSwitches(plan, globalLimits));
};
