// Product options, variants, availability matrix and size charts: the ONE place their rules live in JavaScript.
//
// Mirrors migrations 0086 and 0088 (the SQL validators and seller_save_item / public_item_options). Same limits, same error names, so the
// seller editor can catch a problem before the database does, the mock API behaves like the real one, and the db tests can compare
// both. Style follows itemForm.js: plain functions, no classes, errors as readable strings.
//
//   storedOptions(f)          what seller_save_item keeps for a save's `options`, or { ok: false, error } (the RPC's error name).
//   validateOptions(options)  the same checks for a form: { ok, errors, value }, errors keyed by row so the UI can show them.
//   buildAvailability(...)    the availability matrix the public read returns.
//   publicOptions(...)        the public payload { options, optionVariants, optionAvailability, sizeChart }.
//                             (The option* names, not availability / variants: the item already has an `availability` status string
//                             and a legacy `variants` list that pages and pricing read. The new keys sit beside them.)
//   legacyVariantsToOptions   the old items.variants [{id,label,price}] as one "option" axis (migration 0086, section 3).
//   cleanSizeChart / sizeChartFor   the admin library row and what an item shows (chart rows or the seller's override).

import { SPEC_GROUPS, SPEC_LIMITS } from "./itemForm.js";
import { generateCombinations } from "../options/combinations.js";

export const OPTION_DISPLAY_TYPES = ["swatch", "image-card", "button", "dropdown", "text-card"];
export const VARIANT_STATUSES = ["available", "limited_stock", "out_of_stock", "unavailable"];

export const OPTION_LIMITS = {
  axes: 3,
  values: 40,
  variants: 200,
  axisKey: 30,
  axisLabel: 30,
  valueId: 40,
  valueLabel: 40,
  sku: 40,
  mediaPerVariant: 10,
  stock: 999999,
  specs: SPEC_LIMITS.rows,
};

export const SIZE_CHART_UNITS = ["cm", "in", "mm", "kg", "lb", "none"];
export const SIZE_CHART_LIMITS = { name: 80, columns: 12, column: 30, rows: 60, cell: 20 };

const SLUG = /^[a-z0-9][a-z0-9_-]*$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONEY = /^\d{1,10}(\.\d{1,2})?$/;

const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v, max) => typeof v === "string" && v.trim() !== "" && v.trim().length <= max;
const slugOk = (v, max) => typeof v === "string" && v.length <= max && SLUG.test(v);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const present = (o, k) => has(o, k) && o[k] !== null && o[k] !== undefined;

// A readable id from a label ("Dark Blue" -> "dark-blue"), unique among `taken`. Used by the editor when a seller adds a value.
export const optionSlug = (label, taken = [], max = OPTION_LIMITS.valueId) => {
  let base = String(label ?? "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^[^a-z0-9]+/, "").replace(/-+$/, "").slice(0, max);
  if (!base) base = "option";
  let slug = base;
  for (let n = 2; taken.includes(slug); n += 1) {
    const suffix = `-${n}`;
    slug = base.slice(0, max - suffix.length) + suffix;
  }
  return slug;
};

// "color=red|size=m" in axis order, or null when the choice is not exactly one valid value for every axis.
export const comboKey = (axes, choice) => {
  if (!Array.isArray(axes) || axes.length === 0 || !isRecord(choice) || Object.keys(choice).length !== axes.length) return null;
  const parts = [];
  for (const axis of axes) {
    const value = choice[axis.key];
    if (typeof value !== "string" || !axis.values.some((v) => v.id === value)) return null;
    parts.push(`${axis.key}=${value}`);
  }
  return parts.join("|");
};

// Spec override rows for one variant: [{ group, label, value }], trimmed, or null when any row is not valid. Same rules as items.specs.
export const cleanSpecOverrides = (rows) => {
  if (!Array.isArray(rows) || rows.length > OPTION_LIMITS.specs) return null;
  const out = [];
  for (const r of rows) {
    if (!isRecord(r) || Object.keys(r).some((k) => !["group", "label", "value"].includes(k))) return null;
    if (!SPEC_GROUPS.includes(r.group) || !text(r.label, SPEC_LIMITS.label) || !text(r.value, SPEC_LIMITS.value)) return null;
    out.push({ group: r.group, label: r.label.trim(), value: r.value.trim() });
  }
  return out;
};

// Every check, as a list of { code, path, message }. `code` is the error name the RPC raises, `path` points at the row.
function check(options, { mediaIds } = {}) {
  const issues = [];
  const add = (code, path, message) => issues.push({ code, path, message });
  const mediaKnown = (id) => !(mediaIds instanceof Set) || mediaIds.has(String(id).toLowerCase());
  let axes = [];
  let variants = [];

  if (options === null || options === undefined) return { issues, axes, variants };
  if (!isRecord(options) || Object.keys(options).some((k) => k !== "axes" && k !== "variants" && k !== "defaultChoice")) {
    add("invalid_options", "options", "Options must have axes and variants.");
    return { issues, axes, variants };
  }
  const rawAxes = options.axes ?? [];
  const rawVariants = options.variants ?? [];
  if (!Array.isArray(rawAxes) || !Array.isArray(rawVariants)) {
    add("invalid_options", "options", "Options must have axes and variants.");
    return { issues, axes, variants };
  }

  if (rawAxes.length > OPTION_LIMITS.axes) add("invalid_options", "axes", `Use ${OPTION_LIMITS.axes} option types or fewer.`);
  const keys = new Set();
  const earlier = new Set();
  rawAxes.forEach((axis, a) => {
    const at = `axes.${a}`;
    if (!isRecord(axis) || Object.keys(axis).some((k) => !["key", "label", "display", "values", "dependsOn"].includes(k))) {
      add("invalid_options", at, "This option type is not valid.");
      return;
    }
    if (!slugOk(axis.key, OPTION_LIMITS.axisKey)) add("invalid_options", `${at}.key`, "Use lowercase letters, digits, dashes or underscores.");
    else if (keys.has(axis.key)) add("invalid_options", `${at}.key`, "Each option type needs its own key.");
    else keys.add(axis.key);
    if (present(axis, "dependsOn") && !(slugOk(axis.dependsOn, OPTION_LIMITS.axisKey) && earlier.has(axis.dependsOn))) {
      add("invalid_options", `${at}.dependsOn`, "Depend on an option type listed before this one.");
    }
    if (slugOk(axis.key, OPTION_LIMITS.axisKey)) earlier.add(axis.key);
    if (!text(axis.label, OPTION_LIMITS.axisLabel)) add("invalid_options", `${at}.label`, `Name the option type in ${OPTION_LIMITS.axisLabel} characters or fewer.`);
    if (!OPTION_DISPLAY_TYPES.includes(axis.display)) add("invalid_options", `${at}.display`, "Choose how the buyer picks it.");
    const values = axis.values;
    if (!Array.isArray(values) || values.length < 1 || values.length > OPTION_LIMITS.values) {
      add("invalid_options", `${at}.values`, `Add 1 to ${OPTION_LIMITS.values} values.`);
      return;
    }
    const ids = new Set();
    values.forEach((value, v) => {
      const vat = `${at}.values.${v}`;
      if (!isRecord(value) || Object.keys(value).some((k) => !["id", "label", "color", "mediaId"].includes(k))) {
        add("invalid_options", vat, "This value is not valid.");
        return;
      }
      if (!slugOk(value.id, OPTION_LIMITS.valueId)) add("invalid_options", `${vat}.id`, "Use lowercase letters, digits, dashes or underscores.");
      else if (ids.has(value.id)) add("invalid_options", `${vat}.id`, "Each value needs its own id.");
      else ids.add(value.id);
      if (!text(value.label, OPTION_LIMITS.valueLabel)) add("invalid_options", `${vat}.label`, `Name the value in ${OPTION_LIMITS.valueLabel} characters or fewer.`);
      if (present(value, "color") && !(typeof value.color === "string" && HEX.test(value.color))) add("invalid_options", `${vat}.color`, "Use a colour such as #1a2b3c.");
      if (present(value, "mediaId")) {
        if (typeof value.mediaId !== "string" || !UUID.test(value.mediaId) || !mediaKnown(value.mediaId)) add("invalid_options", `${vat}.mediaId`, "Pick one of this item's photos.");
      }
    });
  });
  if (issues.length) return { issues, axes, variants };

  // Same cleaning the database does: trimmed labels, lower-case colours and media ids, null/blank optional keys left out.
  axes = rawAxes.map((axis) => ({
    key: axis.key,
    label: axis.label.trim(),
    display: axis.display,
    ...(present(axis, "dependsOn") && { dependsOn: axis.dependsOn }),
    values: axis.values.map((v) => ({
      id: v.id,
      label: v.label.trim(),
      ...(present(v, "color") && { color: v.color.toLowerCase() }),
      ...(present(v, "mediaId") && { mediaId: v.mediaId.toLowerCase() }),
    })),
  }));

  if (rawVariants.length > OPTION_LIMITS.variants) {
    add("too_many_variants", "variants", `Use ${OPTION_LIMITS.variants} variants or fewer.`);
    return { issues, axes, variants };
  }
  if (axes.length === 0 && rawVariants.length > 0) {
    add("invalid_options", "variants", "Add an option type before adding variants.");
    return { issues, axes, variants };
  }

  const seenKeys = new Set();
  const seenSkus = new Set();
  rawVariants.forEach((row, i) => {
    const at = `variants.${i}`;
    const bad = (path, message) => add("invalid_variant", `${at}.${path}`, message);
    if (!isRecord(row) || Object.keys(row).some((k) => !["id", "choice", "price", "salePrice", "stock", "status", "sku", "mediaIds", "specs"].includes(k))) {
      add("invalid_variant", at, "This variant is not valid.");
      return;
    }
    const key = comboKey(axes, row.choice);
    if (key === null) {
      bad("choice", "Pick exactly one value for each option type.");
      return;
    }
    if (seenKeys.has(key)) {
      add("duplicate_variant", `${at}.choice`, "This combination is already listed.");
      return;
    }
    seenKeys.add(key);

    // No comma stripping: this mirrors the RPC, which refuses "1,200". The editor sends clean numbers (itemForm.js strips commas for typing).
    const money = (v) => ((typeof v === "number" || typeof v === "string") && MONEY.test(String(v)) ? Number(v) : NaN);
    let price = null;
    let salePrice = null;
    let stock = null;
    let status = "available";
    let sku = null;
    const media = [];
    let specs;
    if (present(row, "price")) {
      price = money(row.price);
      if (Number.isNaN(price)) { bad("price", "Enter a number such as 1500."); price = null; }
    }
    if (present(row, "salePrice")) {
      salePrice = money(row.salePrice);
      if (Number.isNaN(salePrice) || price === null) { bad("salePrice", "Add the regular price first, then a sale price such as 1200."); salePrice = null; }
      else if (salePrice >= price) { bad("salePrice", "The sale price must be below the regular price."); salePrice = null; }
    }
    if (present(row, "stock")) {
      const n = typeof row.stock === "number" ? String(row.stock) : row.stock;
      if (typeof n !== "string" || !/^\d{1,6}$/.test(n)) bad("stock", "Enter a whole number, such as 12. Use 0 if none.");
      else stock = Number(n);
    }
    if (present(row, "status")) {
      if (!VARIANT_STATUSES.includes(row.status)) bad("status", "Choose a status.");
      else status = row.status;
    }
    if (stock === 0) status = "out_of_stock";
    if (present(row, "sku")) {
      if (typeof row.sku !== "string") bad("sku", "Use text for the SKU.");
      else {
        const s = row.sku.trim();
        if (s.length > OPTION_LIMITS.sku) bad("sku", `Use ${OPTION_LIMITS.sku} characters or fewer.`);
        else if (s) {
          if (seenSkus.has(s.toLowerCase())) add("duplicate_sku", `${at}.sku`, "Another variant already uses this SKU.");
          else { seenSkus.add(s.toLowerCase()); sku = s; }
        }
      }
    }
    if (present(row, "mediaIds")) {
      if (!Array.isArray(row.mediaIds) || row.mediaIds.length > OPTION_LIMITS.mediaPerVariant) bad("mediaIds", `Use ${OPTION_LIMITS.mediaPerVariant} photos or fewer.`);
      else {
        for (const id of row.mediaIds) {
          const lower = typeof id === "string" ? id.toLowerCase() : "";
          if (!UUID.test(lower) || media.includes(lower) || !mediaKnown(lower)) { bad("mediaIds", "Pick this item's own photos, each once."); break; }
          media.push(lower);
        }
      }
    }
    if (present(row, "specs")) {
      const cleaned = cleanSpecOverrides(row.specs);
      if (cleaned === null) bad("specs", `Use up to ${OPTION_LIMITS.specs} rows, each with a group from the list, a label and a value.`);
      else specs = cleaned;
    }
    variants.push({ choice: Object.fromEntries(axes.map((a) => [a.key, row.choice[a.key]])), key, price, salePrice, stock, status, sku, mediaIds: media, ...(specs !== undefined && { specs }) });
  });
  // The seller's default: a choice that matches one of the variants being saved. Absent keeps the stored default; null clears it.
  let defaultChoice;
  if (has(options, "defaultChoice")) {
    if (options.defaultChoice === null) defaultChoice = null;
    else {
      const key = comboKey(axes, options.defaultChoice);
      const hit = key === null ? undefined : variants.find((v) => v.key === key);
      if (!hit) add("invalid_default", "defaultChoice", "Pick one of the combinations you sell as the default.");
      else defaultChoice = hit.choice;
    }
  }
  return { issues, axes, variants, defaultChoice };
}

// What seller_save_item keeps for a save's `options`, or { ok: false, error } with the RPC's error name. `options` of null clears.
// Pass `mediaIds` (the item's own media ids) to check picture references; leave it out to skip that check.
export const storedOptions = (options, opts = {}) => {
  const { issues, axes, variants, defaultChoice } = check(options, opts);
  if (issues.length) return { ok: false, error: issues[0].code };
  return { ok: true, value: { axes, variants, ...(defaultChoice !== undefined && { defaultChoice }) } };
};

// The same checks for a form. `errors` is keyed by path ("variants.2.price") so each row can show its own message.
export const validateOptions = (options, opts = {}) => {
  const { issues, axes, variants, defaultChoice } = check(options, opts);
  const errors = {};
  for (const issue of issues) if (!(issue.path in errors)) errors[issue.path] = issue.message;
  return { ok: issues.length === 0, errors, code: issues[0]?.code ?? null, value: issues.length ? null : { axes, variants, ...(defaultChoice !== undefined && { defaultChoice }) } };
};

// Editor helper: drop blank rows and build values from labels, so a half-typed axis does not block saving other things.
export const cleanOptionAxes = (raw) => {
  const axes = [];
  (Array.isArray(raw) ? raw : []).forEach((axis) => {
    const label = String(axis?.label ?? "").trim();
    const labels = (Array.isArray(axis?.values) ? axis.values : []).filter((v) => String(v?.label ?? "").trim() !== "");
    if (!label && labels.length === 0) return;
    const taken = [];
    const values = labels.map((v) => {
      const id = slugOk(v.id, OPTION_LIMITS.valueId) && !taken.includes(v.id) ? v.id : optionSlug(v.label, taken);
      taken.push(id);
      return { id, label: String(v.label).trim(), ...(present(v, "color") && { color: v.color }), ...(present(v, "mediaId") && { mediaId: v.mediaId }) };
    });
    axes.push({ key: slugOk(axis.key, OPTION_LIMITS.axisKey) ? axis.key : optionSlug(label, axes.map((a) => a.key), OPTION_LIMITS.axisKey), label, display: axis.display, values });
  });
  return axes;
};

// All combinations of the axes (for an editor "generate variants" button). Lives in ../options/combinations.js.
export const allCombinations = generateCombinations;

// "Red / S": the chosen values' labels in axis order (the old {id, label, price} entries had a label; so does every variant now).
export const variantLabel = (axes, choice) =>
  (axes ?? []).map((a) => a.values.find((v) => v.id === choice?.[a.key])?.label).filter(Boolean).join(" / ");

const RANK = { available: 4, limited_stock: 3, out_of_stock: 2, unavailable: 1 };

// The availability matrix, exactly as public_item_options returns it. A combination with no cell is unavailable: `missing` says so.
// `variants` are rows with { id?, choice, status } (stored or public shape).
export const buildAvailability = (axes, variants) => {
  const list = Array.isArray(axes) ? axes : [];
  const rows = Array.isArray(variants) ? variants : [];
  const values = {};
  for (const axis of list) {
    values[axis.key] = {};
    for (const v of axis.values) {
      let best = null;
      for (const row of rows) if (row.choice?.[axis.key] === v.id && (best === null || RANK[row.status] > RANK[best])) best = row.status;
      values[axis.key][v.id] = best ?? "unavailable";
    }
  }
  return {
    axes: list.map((a) => a.key),
    missing: "unavailable",
    cells: rows.map((row) => ({ key: row.key ?? comboKey(list, row.choice), choice: row.choice, status: row.status, variantId: row.id ?? null })),
    values,
  };
};

// A variant a buyer can pick: sold-out and unavailable combinations are not offered (they stay in the matrix, where a picker greys
// them out). Pages that list variants to choose from, and the default selection, must only see these.
export const isPurchasable = (variant) => variant?.status === "available" || variant?.status === "limited_stock";

// What a picker needs from the matrix, so a client never scans cells or guesses.
// statusForChoice: the status of one FULL choice ({ color: "red", size: "m" }). A combination with no cell is `missing`
// ("unavailable"). null while the choice is still incomplete or names an unknown value.
export const statusForChoice = (availability, choice) => {
  const axes = availability?.axes ?? [];
  if (axes.length === 0 || !choice) return null;
  if (axes.some((k) => typeof choice[k] !== "string" || !(choice[k] in (availability.values?.[k] ?? {})))) return null;
  const key = axes.map((k) => `${k}=${choice[k]}`).join("|");
  return availability.cells.find((c) => c.key === key)?.status ?? availability.missing;
};

// selectableValues: with some axes already chosen (`partial`), the best status each value of EVERY axis could still lead to.
// Choosing Red greys out the sizes that exist only in Blue. An axis's own choice is ignored for its own values, so the buyer
// can always switch it. Values with no matching cell are `missing` ("unavailable").
export const selectableValues = (availability, partial = {}) => {
  const axes = availability?.axes ?? [];
  const out = {};
  for (const k of axes) {
    out[k] = {};
    for (const id of Object.keys(availability.values?.[k] ?? {})) {
      let best = null;
      for (const cell of availability.cells) {
        if (cell.choice[k] !== id) continue;
        if (axes.some((other) => other !== k && typeof partial?.[other] === "string" && cell.choice[other] !== partial[other])) continue;
        if (best === null || RANK[cell.status] > RANK[best]) best = cell.status;
      }
      out[k][id] = best ?? availability.missing;
    }
  }
  return out;
};

export const emptyOptions = () => ({ options: [], optionVariants: [], optionAvailability: buildAvailability([], []), defaultVariantId: null, sizeChart: null });

// The size chart a buyer sees: the chart's rows, or the seller's override when it still fits the chart's columns.
export const sizeChartFor = (chart, override) => {
  if (!chart || chart.active === false) return null;
  const fits = isRecord(override) && Array.isArray(override.rows) && validRows(override.rows, chart.columns.length);
  return { id: chart.id, name: chart.name, category: chart.category ?? null, unit: chart.unit, columns: chart.columns, rows: fits ? override.rows : chart.rows, overridden: Boolean(fits) };
};

// The seller's own size guide ({ unit?, columns, rows }, migration 0103) as the buyer gets it, or null when it does not meet the database rules.
// Mirrors item_size_chart_payload: it takes the place of any admin chart.
export const ownSizeChart = (guide) => {
  const text = (v, max) => typeof v === "string" && v.trim() !== "" && v.length <= max;
  if (!isRecord(guide) || Object.keys(guide).some((k) => !["unit", "columns", "rows"].includes(k))) return null;
  if (!Array.isArray(guide.columns) || guide.columns.length < 1 || guide.columns.length > 12 || !guide.columns.every((c) => text(c, 30))) return null;
  if (new Set(guide.columns.map((c) => c.trim().toLowerCase())).size !== guide.columns.length) return null;
  if (guide.unit != null && guide.unit !== "cm" && guide.unit !== "in") return null;
  if (!Array.isArray(guide.rows) || guide.rows.length < 1 || guide.rows.length > 60 || !guide.rows.every((r) => Array.isArray(r) && r.length === guide.columns.length && r.every((c) => text(c, 20)))) return null;
  return { id: null, name: "Size guide", category: null, unit: guide.unit ?? "cm", columns: guide.columns, rows: guide.rows, overridden: false, own: true };
};

// The public payload from stored rows. `item` supplies the inherited price and the stock-count switch.
export const publicOptions = ({ axes = [], variants = [], item = {}, chart = null, override = null, guide = null, defaultVariantId = null }) => {
  const shown = variants.map((v) => ({
    id: v.id ?? null,
    label: variantLabel(axes, v.choice),
    choice: v.choice,
    price: v.price ?? item.price ?? null,
    salePrice: v.price === null || v.price === undefined ? (item.salePrice ?? null) : (v.salePrice ?? null),
    status: v.status,
    sku: v.sku ?? null,
    mediaIds: v.mediaIds ?? [],
    specs: v.specs ?? [],
    stockLeft: item.showStockCount && v.status === "limited_stock" && Number.isInteger(v.stock) && v.stock > 0 ? v.stock : null,
  }));
  const options = axes.map((a) => ({ key: a.key, label: a.label, display: a.display, ...(a.dependsOn && { dependsOn: a.dependsOn }), values: a.values.map((v) => ({ id: v.id, label: v.label, ...(v.color && { color: v.color }), ...(v.mediaId && { mediaId: v.mediaId }) })) }));
  return { options, optionVariants: shown, optionAvailability: buildAvailability(axes, variants), defaultVariantId: defaultVariantId ?? null, sizeChart: ownSizeChart(guide) ?? sizeChartFor(chart, override) };
};

// The old items.variants shape [{ id, label, price, stock? }] as { axes, variants }: one axis "option", one variant per usable entry
// (a stock of 0 is out_of_stock). Same rules as item_options_from_legacy in migration 0086 (entries without a label are skipped, ids become unique slugs).
export const legacyVariantsToOptions = (legacy) => {
  if (!Array.isArray(legacy) || legacy.length === 0) return { axes: [], variants: [] };
  const used = [];
  const values = [];
  const variants = [];
  legacy.forEach((entry, index) => {
    if (values.length >= OPTION_LIMITS.values || !isRecord(entry)) return;
    const label = String(entry.label ?? "").trim();
    if (!label || label.length > OPTION_LIMITS.valueLabel) return;
    const source = String(entry.id ?? "").trim() || label;
    let slug = source.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^[^a-z0-9]+/, "").slice(0, OPTION_LIMITS.valueId);
    if (!slug) slug = `option-${index + 1}`;
    if (used.includes(slug)) slug = `${slug.slice(0, 36)}-${index + 1}`;
    if (used.includes(slug)) return;
    used.push(slug);
    const price = MONEY.test(String(entry.price ?? "")) ? Number(entry.price) : null;
    const stock = /^\d{1,6}$/.test(String(entry.stock ?? "")) ? Number(entry.stock) : null;
    values.push({ id: slug, label });
    variants.push({ choice: { option: slug }, key: `option=${slug}`, price, salePrice: null, stock, status: stock === 0 ? "out_of_stock" : "available", sku: null, mediaIds: [] });
  });
  if (values.length === 0) return { axes: [], variants: [] };
  return { axes: [{ key: "option", label: "Option", display: "button", values }], variants };
};

// ---- size chart library (admin) ----

const validRows = (rows, width) =>
  Array.isArray(rows) && rows.length >= 1 && rows.length <= SIZE_CHART_LIMITS.rows &&
  rows.every((r) => Array.isArray(r) && r.length >= 1 && r.length <= SIZE_CHART_LIMITS.columns && (width == null || r.length === width) && r.every((c) => text(c, SIZE_CHART_LIMITS.cell)));

// Validates an admin chart. Same rules as the size_charts constraints. Returns { ok, errors, value }.
export const cleanSizeChart = (raw) => {
  const errors = {};
  const name = String(raw?.name ?? "").trim();
  if (name.length < 2 || name.length > SIZE_CHART_LIMITS.name) errors.name = `Use 2 to ${SIZE_CHART_LIMITS.name} characters.`;
  const unit = raw?.unit ?? "cm";
  if (!SIZE_CHART_UNITS.includes(unit)) errors.unit = "Choose a unit.";
  const category = String(raw?.category ?? "").trim() || null;
  const columns = Array.isArray(raw?.columns) ? raw.columns.map((c) => String(c ?? "").trim()) : [];
  const seen = new Set();
  if (columns.length < 1 || columns.length > SIZE_CHART_LIMITS.columns || columns.some((c) => !c || c.length > SIZE_CHART_LIMITS.column) || columns.some((c) => (seen.has(c.toLowerCase()) ? true : (seen.add(c.toLowerCase()), false)))) {
    errors.columns = `Use 1 to ${SIZE_CHART_LIMITS.columns} different column names of ${SIZE_CHART_LIMITS.column} characters or fewer.`;
  }
  const rows = Array.isArray(raw?.rows) ? raw.rows.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "").trim()) : r)) : [];
  if (!errors.columns && !validRows(rows, columns.length)) errors.rows = `Add 1 to ${SIZE_CHART_LIMITS.rows} rows, each with a value for every column (${SIZE_CHART_LIMITS.cell} characters or fewer).`;
  const ok = Object.keys(errors).length === 0;
  return { ok, errors, value: ok ? { name, category, unit, columns, rows, active: raw?.active !== false } : null };
};

// A seller's override: rows only, same width as the chart. Returns { ok, rows }.
export const cleanSizeChartOverride = (chart, rows) => {
  const cleaned = Array.isArray(rows) ? rows.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "").trim()) : r)) : null;
  return cleaned && chart && validRows(cleaned, chart.columns.length) ? { ok: true, rows: cleaned } : { ok: false, rows: null };
};
