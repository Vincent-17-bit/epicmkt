import { ApiError } from "./errors.js";

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
export const MAX_QUERY_LENGTH = 80;
export const MAX_FILTER_VALUES = 20;
export const MIN_SEARCH_LENGTH = 2;

// Search text goes into a PostgREST `or=(...)` filter. Commas, parentheses, quotes, backslashes and
// the LIKE wildcards would change the meaning of that filter, so they are removed.
export function cleanTerm(value) {
  return String(value ?? "")
    .replace(/[,()"\\%*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

export function buildSearchFilter(fields, term) {
  const t = cleanTerm(term);
  if (!t) return "";
  return fields.map((f) => `${f}.ilike.*${t}*`).join(",");
}

const isPrimitive = (v) => ["string", "number", "boolean"].includes(typeof v);

// Validates list parameters against a resource definition and fills in defaults. Throws
// ApiError("invalid_request") for anything unknown so typos fail loudly instead of being ignored.
export function normalizeListParams(def, params = {}) {
  const page = Math.max(1, Math.floor(Number(params.page) || 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(params.pageSize) || DEFAULT_PAGE_SIZE)));
  const query = cleanTerm(params.query);

  const filters = {};
  for (const [key, raw] of Object.entries(params.filters ?? {})) {
    if (raw === undefined || raw === null || raw === "" || (Array.isArray(raw) && raw.length === 0)) continue;
    if (!Object.prototype.hasOwnProperty.call(def.filters, key)) {
      throw new ApiError("invalid_request", `Cannot filter ${def.name} by "${key}".`);
    }
    const values = Array.isArray(raw) ? raw : [raw];
    if (values.length > MAX_FILTER_VALUES || !values.every(isPrimitive)) {
      throw new ApiError("invalid_request", `Filter "${key}" has an invalid value.`);
    }
    const allowed = def.filters[key];
    if (Array.isArray(allowed) && !values.every((v) => allowed.includes(v))) {
      throw new ApiError("invalid_request", `Filter "${key}" has an unknown value.`);
    }
    if (allowed === "boolean" && !values.every((v) => typeof v === "boolean")) {
      throw new ApiError("invalid_request", `Filter "${key}" must be true or false.`);
    }
    filters[key] = Array.isArray(raw) ? values : values[0];
  }

  const column = params.sort?.column ?? def.defaultSort.column;
  const direction = params.sort?.direction ?? def.defaultSort.direction;
  if (!def.sortable.includes(column) || !["asc", "desc"].includes(direction)) {
    throw new ApiError("invalid_request", `Cannot sort ${def.name} by "${column}".`);
  }

  return { page, pageSize, query, filters, sort: { column, direction } };
}

export const pick = (row, columns) => {
  if (!columns) return { ...row };
  const out = {};
  for (const c of columns) if (c in row) out[c] = row[c];
  return out;
};
