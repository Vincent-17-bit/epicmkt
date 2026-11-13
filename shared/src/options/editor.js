// The seller's Options editor, as pure functions (no React, no network). B07 (Prompts 3.2 and 3.3).
//
// The form holds ONE shape, and the combination rows are the single source of truth:
//   options = {
//     axes:   [{ key, label, display, dependsOn?, values: [{ id, label, color? }] }],
//     rows:   [{ choice, price, salePrice, stock, sold, specs, id?, sku?, status?, mediaIds? }],   // one per generated combination
//     defaultKey: "colour=black|storage=64-gb" | null,
//   }
// Numbers are typed text while editing ("24,000"). A row with `sold: false` is a combination the seller does not sell: it is kept in
// the form (so its typed price comes back if they change their mind) and left out of the save, where an absent combination means
// "not sold". A DEPENDENT axis (Style -> Capacity) stores nothing extra: its per-parent value lists are the `sold` flags of the rows.

import { OPTION_LIMITS, VARIANT_STATUSES, comboKey, optionSlug, validateOptions } from "../seller/options.js";
import { generateCombinations } from "./combinations.js";

const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const clean = (v) => String(v ?? "").replace(/,/g, "").trim();
export const isMoney = (v) => MONEY.test(clean(v));

export const DISPLAYS = [
  { key: "swatch", label: "Colour swatches" },
  { key: "image-card", label: "Photo cards" },
  { key: "button", label: "Buttons" },
  { key: "text-card", label: "Text cards" },
  { key: "dropdown", label: "Dropdown list" },
];

// Used only when the product type brings no axes of its own. TODO(contract:A06) read `type.axes` once seller_product_types returns them.
export const AXIS_PRESETS = [
  { label: "Colour", display: "swatch" },
  { label: "Size", display: "button" },
  { label: "Storage", display: "button" },
  { label: "Style", display: "button" },
  { label: "Volume", display: "button" },
  { label: "Weight", display: "button" },
  { label: "Pack size", display: "button" },
  { label: "Flavour", display: "button" },
  { label: "Length", display: "button" },
  { label: "Material", display: "text-card" },
];

// Whether an axis's `scale` and each value's `stored` are sent to the database (migration 0100_option_scales_sizes.sql stores them).
// While false the scale stays form-only, as before. Switch it off in one place if the migration has not been applied yet.
export const OPTION_SCALES_STORED = true;

/** true when a save payload carries any scale data. */
export const hasOptionScales = (payload) => Boolean(payload?.axes?.some((a) => a.scale || a.values?.some((v) => v.stored)));
/** The same payload without any scale data: what an older database (no migration 0100 yet) accepts. */
export const stripOptionScales = (payload) => (!payload ? payload : { ...payload, axes: payload.axes.map(({ scale: _s, ...a }) => ({ ...a, values: a.values.map(({ stored: _v, ...v }) => v) })) });

// A limit the shop's plan lowers (never raises). `plan` is { axes?, values?, variants? }; anything missing keeps the hard limit.
export const effectiveLimits = (plan = {}) => {
  const pick = (hard, v) => (Number.isInteger(v) && v > 0 && v < hard ? v : hard);
  return { axes: pick(OPTION_LIMITS.axes, plan?.axes), values: pick(OPTION_LIMITS.values, plan?.values), variants: pick(OPTION_LIMITS.variants, plan?.variants) };
};
const isPlanCap = (limits, kind) => limits[kind] < OPTION_LIMITS[kind];

let ridSeq = 0;
// A form-only id so a card keeps its place (and the cursor in its name field) while its key follows the typed name. Never sent.
const newRid = () => `a${Date.now().toString(36)}${(ridSeq += 1)}`;

export const emptyOptionsForm = () => ({ axes: [], rows: [], defaultKey: null });

const newRow = (choice) => ({ choice, price: "", salePrice: "", stock: "", sold: true, specs: [] });
export const rowKeyOf = (options, choice) => comboKey(options.axes, choice);
const rowFor = (options, key) => options.rows.find((r) => rowKeyOf(options, r.choice) === key);
// The rows that are a full combination of the current axes. (While an axis has no values the old rows wait, unused.)
export const liveRows = (options) => options.rows.filter((r) => rowKeyOf(options, r.choice) !== null);

// ---- rows follow the axes ----

// Rebuild the rows for the current axes. A combination that existed keeps everything the seller typed. A new combination inherits
// from the old row it grew out of (add a Colour to a priced item and the new rows start with that price); otherwise it starts empty.
export const reconcileRows = (options) => {
  const axes = options.axes;
  // An axis with no values has no combinations yet. Keep the rows as they are (they come back, with their prices, as soon as the
  // first value is added) instead of throwing the seller's work away.
  if (axes.some((a) => a.values.length === 0)) return options;
  const combos = axes.length ? generateCombinations(axes, OPTION_LIMITS.variants + 1) : [];
  const axisKeys = new Set(axes.map((a) => a.key));
  const rows = combos.map((choice) => {
    const shared = (r) => Object.keys(r.choice).filter((k) => axisKeys.has(k));
    const matches = options.rows.filter((r) => { const ks = shared(r); return ks.length > 0 && ks.every((k) => r.choice[k] === choice[k]); });
    const exact = matches.find((r) => Object.keys(r.choice).length === axes.length && axes.every((a) => r.choice[a.key] === choice[a.key]));
    const from = exact ?? matches.find((r) => r.sold) ?? matches[0];
    if (!from) return newRow(choice);
    return exact ? { ...from, choice } : { ...from, choice, id: undefined, sku: undefined, mediaIds: undefined, sold: from.sold };
  });
  const key = options.defaultKey;
  const defaultKey = key && rows.some((r) => r.sold && comboKey(axes, r.choice) === key) ? key : null;
  return { ...options, rows, defaultKey };
};

export const comboCount = (axes) => axes.reduce((n, a) => n * Math.max(a.values.length, 0), axes.length ? 1 : 0);

// ---- axes ----

export const canAddAxis = (options, limits = effectiveLimits()) => options.axes.length < limits.axes;

export const addAxis = (options, { label = "", display = "button", scale = null } = {}, limits = effectiveLimits()) => {
  if (!canAddAxis(options, limits)) return options;
  const key = optionSlug(label || "option", options.axes.map((a) => a.key), OPTION_LIMITS.axisKey);
  return reconcileRows({ ...options, axes: [...options.axes, { key, label, display, ...(scale && { scale }), auto: true, rid: newRid(), values: [] }] });
};

// A product type's usual options (its `axes`: { key, label, display, scale? }) in one step, skipping any the item already has and
// stopping at the limit. Returns the new options and how many were added.
export const addTypeAxes = (options, defs, limits = effectiveLimits()) => {
  let next = options;
  let added = 0;
  for (const d of Array.isArray(defs) ? defs : []) {
    if (next.axes.some((a) => a.label.trim().toLowerCase() === String(d.label ?? "").trim().toLowerCase())) continue;
    if (!canAddAxis(next, limits)) break;
    next = addAxis(next, { label: d.label, display: d.display, scale: d.scale }, limits);
    added += 1;
  }
  return { options: next, added };
};

const mapAxis = (options, axisKey, fn) => ({ ...options, axes: options.axes.map((a) => (a.key === axisKey ? fn(a) : a)) });

// Renaming changes the label only, except for an axis made in this session (`auto`, never saved): its key follows the name while the
// seller types, and the rows and any dependsOn that point at it follow. A saved axis keeps its key for good.
export const renameAxis = (options, axisKey, label) => {
  const renamed = mapAxis(options, axisKey, (a) => ({ ...a, label }));
  const slug = optionSlug(label, options.axes.filter((a) => a.key !== axisKey).map((a) => a.key), OPTION_LIMITS.axisKey);
  if (!options.axes.find((a) => a.key === axisKey)?.auto || !String(label).trim() || slug === axisKey) return renamed;
  const swap = (choice) => Object.fromEntries(Object.entries(choice).map(([k, v]) => [k === axisKey ? slug : k, v]));
  return {
    ...renamed,
    axes: renamed.axes.map((a) => ({ ...a, ...(a.key === axisKey && { key: slug }), ...(a.dependsOn === axisKey && { dependsOn: slug }) })),
    rows: renamed.rows.map((r) => ({ ...r, choice: swap(r.choice) })),
    defaultKey: options.defaultKey ? options.defaultKey.split("|").map((p) => (p.startsWith(`${axisKey}=`) ? `${slug}=${p.slice(axisKey.length + 1)}` : p)).join("|") : null,
  };
};
export const setDisplay = (options, axisKey, display) => mapAxis(options, axisKey, (a) => ({ ...a, display }));

export const removeAxis = (options, axisKey) => {
  const axes = options.axes.filter((a) => a.key !== axisKey).map((a) => {
    if (a.dependsOn !== axisKey) return a;
    const { dependsOn, ...rest } = a;    
    return rest;
  });
  return reconcileRows({ ...options, axes });
};

// ---- values ----

export const canAddValue = (options, axisKey, limits = effectiveLimits()) => {
  const axis = options.axes.find((a) => a.key === axisKey);
  if (!axis) return { ok: false, reason: "none" };
  if (axis.values.length >= limits.values) return { ok: false, reason: "values", plan: isPlanCap(limits, "values") };
  const next = options.axes.map((a) => (a.key === axisKey ? a.values.length + 1 : a.values.length)).reduce((n, c) => n * c, 1);
  if (next > limits.variants) return { ok: false, reason: "variants", plan: isPlanCap(limits, "variants") };
  return { ok: true };
};

// Adds a value from typed text. A duplicate label (ignoring case and spacing) is refused, never added twice.
export const addValue = (options, axisKey, label, extras = {}, limits = effectiveLimits()) => {
  const text = String(label ?? "").trim();
  const axis = options.axes.find((a) => a.key === axisKey);
  if (!axis || !text) return { options, error: "empty" };
  if (text.length > OPTION_LIMITS.valueLabel) return { options, error: "long" };
  const same = (a, b) => a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");
  const dupe = axis.values.find((v) => same(v.label, text));
  if (dupe) return { options, error: "duplicate", existing: dupe };
  const can = canAddValue(options, axisKey, limits);
  if (!can.ok) return { options, error: can.reason, plan: can.plan };
  const id = optionSlug(text, axis.values.map((v) => v.id), OPTION_LIMITS.valueId);
  const next = mapAxis(options, axisKey, (a) => ({ ...a, values: [...a.values, { id, label: text, ...extras }] }));
  return { options: reconcileRows(next), id };
};

export const removeValue = (options, axisKey, valueId) => reconcileRows(mapAxis(options, axisKey, (a) => ({ ...a, values: a.values.filter((v) => v.id !== valueId) })));

export const moveValue = (options, axisKey, valueId, delta) => mapAxis(options, axisKey, (a) => {
  const from = a.values.findIndex((v) => v.id === valueId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= a.values.length) return a;
  const values = a.values.slice();
  [values[from], values[to]] = [values[to], values[from]];
  return { ...a, values };
});

export const setValueColor = (options, axisKey, valueId, color) => mapAxis(options, axisKey, (a) => ({
  ...a, values: a.values.map((v) => {
    if (v.id !== valueId) return v;
    const { color: _old, ...rest } = v;    
    return /^#[0-9a-fA-F]{6}$/.test(color ?? "") ? { ...rest, color: color.toLowerCase() } : rest;
  }),
}));

// ---- rows ----

export const setRow = (options, key, patch) => ({ ...options, rows: options.rows.map((r) => (rowKeyOf(options, r.choice) === key ? { ...r, ...patch } : r)) });

export const setSold = (options, key, sold) => {
  const next = setRow(options, key, { sold });
  return !sold && next.defaultKey === key ? { ...next, defaultKey: null } : next;
};

export const setDefault = (options, key) => (key === null || rowFor(options, key)?.sold ? { ...options, defaultKey: key } : options);

// ---- dependent options (the SanDisk pattern) ----

// The earlier axes an axis may depend on.
export const dependencyChoices = (options, axisKey) => {
  const at = options.axes.findIndex((a) => a.key === axisKey);
  return at <= 0 ? [] : options.axes.slice(0, at);
};

// Turning it on keeps every combination as it is; the seller then trims each parent's list. Turning it off only drops the link:
// the combinations (and which of them are not sold) stay exactly as they were.
export const setDependsOn = (options, axisKey, parentKey) => {
  if (parentKey && !dependencyChoices(options, axisKey).some((a) => a.key === parentKey)) return options;
  return mapAxis(options, axisKey, (a) => {
    const { dependsOn, ...rest } = a;    
    return parentKey ? { ...rest, dependsOn: parentKey } : rest;
  });
};

const under = (options, axis, parentValueId) => options.rows.filter((r) => r.choice[axis.dependsOn] === parentValueId);

// One entry per parent value: which of the axis's values that parent sells.
export const dependentSets = (options, axisKey) => {
  const axis = options.axes.find((a) => a.key === axisKey);
  const parent = axis && options.axes.find((a) => a.key === axis.dependsOn);
  if (!axis || !parent) return [];
  return parent.values.map((pv) => {
    const rows = under(options, axis, pv.id);
    return {
      parentValue: pv,
      values: axis.values.map((v) => ({ value: v, sold: rows.some((r) => r.sold && r.choice[axis.key] === v.id) })),
    };
  });
};

const setSoldWhere = (options, axis, parentValueId, valueId, sold) => {
  const rows = options.rows.map((r) => (r.choice[axis.dependsOn] === parentValueId && r.choice[axis.key] === valueId ? { ...r, sold } : r));
  const next = { ...options, rows };
  return next.defaultKey && !rows.some((r) => r.sold && rowKeyOf(next, r.choice) === next.defaultKey) ? { ...next, defaultKey: null } : next;
};

export const toggleDependentValue = (options, axisKey, parentValueId, valueId) => {
  const axis = options.axes.find((a) => a.key === axisKey);
  if (!axis?.dependsOn) return options;
  const sold = options.rows.some((r) => r.sold && r.choice[axis.dependsOn] === parentValueId && r.choice[axisKey] === valueId);
  return setSoldWhere(options, axis, parentValueId, valueId, !sold);
};

// Copy which values one parent sells onto another, in one step. Typed prices on rows that stay are kept.
export const copyDependentValues = (options, axisKey, fromParentId, toParentId) => {
  const axis = options.axes.find((a) => a.key === axisKey);
  if (!axis?.dependsOn || fromParentId === toParentId) return options;
  const from = new Set(under(options, axis, fromParentId).filter((r) => r.sold).map((r) => r.choice[axisKey]));
  return axis.values.reduce((acc, v) => setSoldWhere(acc, axis, toParentId, v.id, from.has(v.id)), options);
};

// A value added while editing one parent's list is sold under that parent only; the other parents do not get it until ticked.
export const addDependentValue = (options, axisKey, parentValueId, label, limits = effectiveLimits()) => {
  const axis = options.axes.find((a) => a.key === axisKey);
  if (!axis?.dependsOn) return { options, error: "none" };
  const r = addValue(options, axisKey, label, {}, limits);
  if (r.error) return r;
  const parent = options.axes.find((a) => a.key === axis.dependsOn);
  const out = parent.values.reduce((acc, pv) => (pv.id === parentValueId ? acc : setSoldWhere(acc, axis, pv.id, r.id, false)), r.options);
  return { options: out, id: r.id };
};

// Spec rows that differ by parent value (Compatible devices): stored on that parent's combinations, nowhere else.
export const dependentSpecs = (options, axisKey, parentValueId) => {
  const axis = options.axes.find((a) => a.key === axisKey);
  if (!axis?.dependsOn) return [];
  const row = under(options, axis, parentValueId).find((r) => r.sold && r.specs?.length);
  return row?.specs ?? [];
};

export const setDependentSpecs = (options, axisKey, parentValueId, specs) => {
  const axis = options.axes.find((a) => a.key === axisKey);
  if (!axis?.dependsOn) return options;
  return { ...options, rows: options.rows.map((r) => (r.choice[axis.dependsOn] === parentValueId ? { ...r, specs } : r)) };
};

// ---- summary ----

const inStock = (r) => r.sold && r.status !== "out_of_stock" && r.status !== "unavailable" && clean(r.stock) !== "0";

// { combos, notSold, inStock, from } where `from` is the lowest price the buyer can really pay (sale price when there is one),
// falling back to the item's own price for a row with none of its own. null when nothing has a price.
export const summarize = (options, itemPrice = null) => {
  const sold = liveRows(options).filter((r) => r.sold);
  const prices = sold.map((r) => {
    const own = isMoney(r.price) ? Number(clean(r.price)) : isMoney(itemPrice) ? Number(clean(itemPrice)) : null;
    const sale = isMoney(r.salePrice) ? Number(clean(r.salePrice)) : null;
    return own !== null && sale !== null && sale < own ? sale : own;
  }).filter((n) => n !== null);
  return { combos: sold.length, notSold: liveRows(options).length - sold.length, inStock: sold.filter(inStock).length, from: prices.length ? Math.min(...prices) : null };
};

export const summaryText = (s, fmt = (n) => `KES ${n.toLocaleString("en-KE")}`) => {
  if (s.combos === 0) return "No combinations are on sale yet.";
  const parts = [`${s.combos} ${s.combos === 1 ? "combination" : "combinations"}`, `${s.inStock} in stock`];
  if (s.from !== null) parts.push(`from ${fmt(s.from)}`);
  return parts.join(", ");
};

// ---- load and save ----

// What seller_item_options returns -> the form shape. Prices and stock become typed text.
export const optionsFromServer = (data) => {
  const axes = (data?.axes ?? []).map((a) => ({ key: a.key, label: a.label, display: a.display, ...(a.dependsOn && { dependsOn: a.dependsOn }), ...(a.scale && { scale: a.scale }), values: a.values.map((v) => ({ id: v.id, label: v.label, ...(v.color && { color: v.color }), ...(v.mediaId && { mediaId: v.mediaId }), ...(v.stored && { stored: v.stored }) })) }));
  const text = (n) => (n === null || n === undefined ? "" : String(n));
  const sold = (data?.variants ?? []).map((v) => ({ choice: v.choice, price: text(v.price), salePrice: text(v.salePrice), stock: text(v.stock), sold: true, specs: v.specs ?? [], id: v.id, sku: v.sku ?? undefined, status: v.status, mediaIds: v.mediaIds ?? [] }));
  const base = reconcileRows({ axes, rows: sold, defaultKey: null });
  // reconcileRows keeps exact matches; combinations the seller never sold come back as new rows, switched to not sold.
  const have = new Set(sold.map((r) => comboKey(axes, r.choice)));
  const rows = base.rows.map((r) => (have.has(comboKey(axes, r.choice)) ? r : { ...newRow(r.choice), sold: false }));
  const def = (data?.variants ?? []).find((v) => v.id && v.id === data?.defaultVariantId);
  return { axes, rows, defaultKey: def ? comboKey(axes, def.choice) : null };
};

// Form -> `options` for seller_save_item. Returns undefined for an item that never had options (nothing to send), so legacy items
// save exactly as before. `hadOptions` makes removing every axis send an explicit clear.
export const optionsPayload = (options, hadOptions = false) => {
  if (!options || (options.axes.length === 0 && !hadOptions)) return undefined;
  return buildPayload(options).payload;
};

const buildPayload = (options) => {
  const stored = (a) => OPTION_SCALES_STORED && Boolean(a.scale);
  const axes = options.axes.map((a) => ({ key: a.key, label: String(a.label ?? "").trim(), display: a.display, ...(a.dependsOn && { dependsOn: a.dependsOn }), ...(stored(a) && { scale: a.scale }), values: a.values.map((v) => ({ id: v.id, label: String(v.label ?? "").trim(), ...(v.color && { color: v.color }), ...(v.mediaId && { mediaId: v.mediaId }), ...(stored(a) && v.stored && v.stored.scale === a.scale && { stored: v.stored }) })) }));
  const sold = liveRows(options).filter((r) => r.sold);
  const variants = sold.map((r) => {
    const out = { choice: r.choice };
    if (clean(r.price) !== "") out.price = isMoney(r.price) ? Number(clean(r.price)) : clean(r.price);
    if (clean(r.salePrice) !== "") out.salePrice = isMoney(r.salePrice) ? Number(clean(r.salePrice)) : clean(r.salePrice);
    if (clean(r.stock) !== "") out.stock = clean(r.stock);
    if (VARIANT_STATUSES.includes(r.status) && clean(r.stock) === "") out.status = r.status;
    if (r.sku) out.sku = r.sku;
    if (r.mediaIds?.length) out.mediaIds = r.mediaIds;
    if (r.specs?.length) out.specs = r.specs;
    return out;
  });
  const defaultRow = options.defaultKey ? sold.find((r) => comboKey(options.axes, r.choice) === options.defaultKey) : null;
  return { payload: { axes, variants, defaultChoice: defaultRow ? defaultRow.choice : null }, sold };
};

// Every problem a save would hit, keyed so each control can show its own message: "axes.0.label", "axes.1.values", "row:<comboKey>:price".
// The sentence of every problem is the same one the database raises (shared/src/seller/options.js).
export const checkOptions = (options) => {
  const errors = {};
  if (!options) return { ok: true, errors };
  options.axes.forEach((a, i) => {
    if (!String(a.label ?? "").trim()) errors[`axes.${i}.label`] = "Name this option, for example Colour or Size.";
    if (a.values.length === 0) errors[`axes.${i}.values`] = `Add at least one ${String(a.label || "value").toLowerCase()}.`;
  });
  if (Object.keys(errors).length) return { ok: false, errors };
  if (options.axes.length > 0 && liveRows(options).every((r) => !r.sold)) errors.rows = "Sell at least one combination, or remove the options.";
  const { payload, sold } = buildPayload(options);
  const res = validateOptions(payload);
  for (const [path, message] of Object.entries(res.errors)) {
    const m = /^variants\.(\d+)\.(\w+)$/.exec(path);
    if (m && sold[Number(m[1])]) errors[`row:${comboKey(options.axes, sold[Number(m[1])].choice)}:${m[2]}`] = message;
    else errors[path] = message;
  }
  return { ok: Object.keys(errors).length === 0, errors };
};

// The sentence for a limit the seller ran into. `plan` true means the shop's plan lowered it.
export const limitMessage = (reason, limits = effectiveLimits(), plan = false) => {
  const cap = (n, what) => (plan ? `Your plan allows up to ${n} ${what}. Upgrade to add more.` : `You can add up to ${n} ${what}.`);
  if (reason === "axes") return cap(limits.axes, "option types");
  if (reason === "values") return cap(limits.values, "values for one option");
  if (reason === "variants") return cap(limits.variants, "combinations");
  return "";
};

// ---- quick ways to fill prices (Prompt 4.6) ----
// Prices are always stored per combination (one absolute price each). These only fill the list faster; a "difference" is stored as the
// price it adds up to. A value left blank, or a result that is not a sensible price, leaves that row exactly as it was.

const amount = (v) => (isMoney(v) ? Number(clean(v)) : null);
const priceText = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const mapSold = (options, fn) => ({ ...options, rows: options.rows.map((r) => (rowKeyOf(options, r.choice) !== null && r.sold ? fn(r) : r)) });

export const setSamePrice = (options, price) => (amount(price) === null ? options : mapSold(options, (r) => ({ ...r, price: priceText(amount(price)) })));

// "Price by Colour": { black: "25000", grey: "24000" } sets the price of every combination with that colour.
export const setPricesByAxis = (options, axisKey, prices = {}) => mapSold(options, (r) => {
  const n = amount(prices[r.choice[axisKey]]);
  return n === null ? r : { ...r, price: priceText(n) };
});

// Storage sets the base, colour adds or removes money: price = base[storage] + diff[colour]. A diff may be negative ("-1000").
export const setBasePlusDifference = (options, { baseAxis, diffAxis, base = {}, diff = {} }) => mapSold(options, (r) => {
  const b = amount(base[r.choice[baseAxis]]);
  if (b === null) return r;
  const raw = clean(diff[r.choice[diffAxis]]);
  const d = raw === "" ? 0 : /^-?\d{1,10}(\.\d{1,2})?$/.test(raw) ? Number(raw) : null;
  if (d === null || b + d <= 0) return r;
  return { ...r, price: priceText(b + d) };
});

// A plain warning (never a block) for a price far from the rest: 2,400 typed instead of 24,000. Keyed by combination.
export const priceWarnings = (options) => {
  const rows = liveRows(options).filter((r) => r.sold && amount(r.price) !== null && amount(r.price) > 0);
  if (rows.length < 3) return {};
  const sorted = rows.map((r) => amount(r.price)).sort((a, b) => a - b);
  const mid = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const out = {};
  for (const r of rows) {
    const n = amount(r.price);
    const key = rowKeyOf(options, r.choice);
    if (n * 5 <= mid) out[key] = `This is far below the others (around ${Math.round(mid).toLocaleString("en-KE")}). Check the number.`;
    else if (n >= mid * 5) out[key] = `This is far above the others (around ${Math.round(mid).toLocaleString("en-KE")}). Check the number.`;
  }
  return out;
};
