import { formatKes } from "./utils.js";

export const FIELD_TYPES = ["text", "longtext", "number", "price", "boolean", "select", "multiselect", "timerange", "url", "image", "itemlist"];

export const FILTER_TYPES = ["boolean", "select", "multiselect", "number", "price"];

const RANGE_TYPES = ["number", "price"];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const LINK = /^https?:\/\//;
const IMAGE = /^(https?:\/\/|\/|data:image\/)/;

const isBlank = (value) =>
  value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);

const optionLabel = (field, value) => field.options?.find((o) => o.value === value)?.label ?? String(value);

export const clock12 = (time) => {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

export function isFieldVisible(field, attributes = {}) {
  const rule = field.showIf;
  if (!rule) return true;
  const value = attributes[rule.key];
  if ("equals" in rule) return value === rule.equals;
  if ("in" in rule) return rule.in.includes(value);
  if ("includes" in rule) return Array.isArray(value) && value.includes(rule.includes);
  return Boolean(value);
}

export const visibleFields = (fields = [], attributes = {}) => fields.filter((f) => isFieldVisible(f, attributes));

export const filterableFields = (fields = []) => fields.filter((f) => f.filterable && FILTER_TYPES.includes(f.type));

export function parseRange(raw) {
  const match = /^(\d*\.?\d*)-(\d*\.?\d*)$/.exec(String(raw ?? ""));
  if (!match) return { min: null, max: null };
  return { min: match[1] === "" ? null : Number(match[1]), max: match[2] === "" ? null : Number(match[2]) };
}

export const buildRange = (min, max) => (min === "" && max === "" ? "" : `${min}-${max}`);

export function matchesFilter(field, stored, raw) {
  if (isBlank(raw)) return true;
  if (field.type === "boolean") return stored === (raw === "true");
  if (field.type === "select") return stored === raw;
  if (field.type === "multiselect") {
    const wanted = String(raw).split(",").filter(Boolean);
    return Array.isArray(stored) && wanted.some((w) => stored.includes(w));
  }
  if (RANGE_TYPES.includes(field.type)) {
    if (typeof stored !== "number") return false;
    const { min, max } = parseRange(raw);
    return (min == null || stored >= min) && (max == null || stored <= max);
  }
  return false;
}

export function formatValue(field, value) {
  if (isBlank(value)) return "";
  switch (field.type) {
    case "boolean":
      return value ? "Yes" : "No";
    case "select":
      return optionLabel(field, value);
    case "multiselect":
      return value.map((v) => optionLabel(field, v)).join(", ");
    case "number":
      return `${value.toLocaleString("en-KE")}${field.unit ? ` ${field.unit}` : ""}`;
    case "price":
      return `${formatKes(value)}${field.unit ? ` ${field.unit}` : ""}`;
    case "timerange":
      return `${clock12(value[0])} to ${clock12(value[1])}`;
    case "itemlist":
      return `${value.length} ${value.length === 1 ? "item" : "items"}`;
    default:
      return String(value);
  }
}

export function describeFilter(field, raw) {
  if (field.type === "boolean") return field.label;
  if (RANGE_TYPES.includes(field.type)) {
    const { min, max } = parseRange(raw);
    const show = (n) => formatValue(field, n);
    const text = min != null && max != null ? `${show(min)} – ${show(max)}` : min != null ? `From ${show(min)}` : `Up to ${show(max)}`;
    return `${field.label}: ${text}`;
  }
  if (field.type === "multiselect") return `${field.label}: ${formatValue(field, String(raw).split(",").filter(Boolean))}`;
  return `${field.label}: ${formatValue(field, raw)}`;
}

export function cardFacts(fields = [], attributes = {}, limit = 3) {
  const facts = [];
  for (const field of visibleFields(fields, attributes)) {
    if (!field.showOnCard) continue;
    const value = attributes[field.key];
    if (isBlank(value) || value === false) continue;
    if (field.type === "boolean") facts.push(field.label);
    else if (field.type === "multiselect") {
      const labels = value.map((v) => optionLabel(field, v));
      facts.push(labels.length > 2 ? `${labels.slice(0, 2).join(", ")} +${labels.length - 2}` : labels.join(", "));
    } else if (field.type === "select") facts.push(optionLabel(field, value));
    else if (field.type === "text") facts.push(String(value));
    else if (["number", "price", "timerange"].includes(field.type)) facts.push(`${field.label}: ${formatValue(field, value)}`);
    if (facts.length >= limit) break;
  }
  return facts;
}

export function searchableText(fields = [], attributes = {}) {
  const parts = [];
  for (const field of fields) {
    if (!field.searchable) continue;
    const value = attributes[field.key];
    if (isBlank(value)) continue;
    if (field.type === "select") parts.push(optionLabel(field, value));
    else if (field.type === "multiselect") parts.push(value.map((v) => optionLabel(field, v)).join(" "));
    else if (field.type === "itemlist") parts.push(value.map((item) => item.name).join(" "));
    else if (["text", "longtext"].includes(field.type)) parts.push(String(value));
  }
  return parts.join(" ");
}

function checkValue(field, value) {
  switch (field.type) {
    case "text":
      return typeof value === "string" && value.length <= 200 ? null : "Use up to 200 characters";
    case "longtext":
      return typeof value === "string" && value.length <= 1000 ? null : "Use up to 1000 characters";
    case "number":
    case "price":
      return typeof value === "number" && Number.isFinite(value) && value >= 0 ? null : "Enter a valid number";
    case "boolean":
      return typeof value === "boolean" ? null : "Choose yes or no";
    case "select":
      return field.options.some((o) => o.value === value) ? null : "Choose one of the options";
    case "multiselect":
      return Array.isArray(value) && value.every((v) => field.options.some((o) => o.value === v)) ? null : "Choose from the options";
    case "timerange":
      return Array.isArray(value) && value.length === 2 && value.every((t) => TIME.test(t)) && value[0] !== value[1] ? null : "Enter a start and end time";
    case "url":
      return typeof value === "string" && LINK.test(value) ? null : "Enter a link starting with http";
    case "image":
      return typeof value === "string" && IMAGE.test(value) ? null : "Enter a valid image link";
    case "itemlist":
      return Array.isArray(value) &&
        value.every((i) => i && typeof i.name === "string" && i.name.trim() && (i.price == null || (Number.isFinite(i.price) && i.price >= 0)))
        ? null
        : "Each item needs a name and an optional price";
    default:
      return "Unsupported field";
  }
}

export function validateAttributes(fields = [], attributes = {}) {
  const errors = {};
  const known = new Set(fields.map((f) => f.key));
  for (const key of Object.keys(attributes)) if (!known.has(key)) errors[key] = "Not part of this category";
  for (const field of visibleFields(fields, attributes)) {
    const value = attributes[field.key];
    if (isBlank(value)) {
      if (field.required) errors[field.key] = "This is required";
      continue;
    }
    const problem = checkValue(field, value);
    if (problem) errors[field.key] = problem;
  }
  return errors;
}

// Business templates must have at least one field. Item templates may be empty (allowEmpty), because many
// categories have nothing that describes a single product or service beyond the built-in item fields.
export function validateTemplate(fields, { allowEmpty = false } = {}) {
  const problems = [];
  if (!Array.isArray(fields)) return ["Template must be a list of fields"];
  if (!fields.length) return allowEmpty ? [] : ["Template needs at least one field"];
  const keys = new Set();
  for (const field of fields) {
    const where = field.key ?? "(no key)";
    if (!field.key || keys.has(field.key)) problems.push(`${where}: key missing or duplicated`);
    keys.add(field.key);
    if (!field.label) problems.push(`${where}: label missing`);
    if (!FIELD_TYPES.includes(field.type)) problems.push(`${where}: unknown type ${field.type}`);
    if (["select", "multiselect"].includes(field.type) && !field.options?.length) problems.push(`${where}: options missing`);
    if (field.filterable && !FILTER_TYPES.includes(field.type)) problems.push(`${where}: type ${field.type} cannot be filterable`);
  }
  for (const field of fields) {
    if (field.showIf && !keys.has(field.showIf.key)) problems.push(`${field.key}: showIf refers to unknown field`);
  }
  return problems;
}
