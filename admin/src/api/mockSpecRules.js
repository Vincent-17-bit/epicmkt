import { MAX_REQUIRED_ROWS, PRODUCT_TYPES, checkSpecRows } from "@epicmkt/shared";
import { ApiError } from "./errors.js";

const latency = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));

let types = [];

export function resetMockSpecRules() {
  types = PRODUCT_TYPES.filter((t) => t.specRows).map((t) => ({ id: t.id, name: t.name, specRows: structuredClone(t.specRows) }));
}
resetMockSpecRules();

export async function listSpecTypes() {
  await latency();
  return structuredClone(types).sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveSpecRows(id, rows) {
  await latency();
  const type = types.find((t) => t.id === id);
  if (!type) throw new ApiError("type_not_found");
  const problems = checkSpecRows(rows);
  if (problems.some((p) => p.includes("at most"))) throw new ApiError("too_many_required");
  if (problems.length) throw new ApiError("invalid_spec_rows");
  if (rows.filter((r) => r.level === "required" || r.requiredIf !== undefined).length > MAX_REQUIRED_ROWS) throw new ApiError("too_many_required");
  type.specRows = structuredClone(rows);
  return structuredClone(rows);
}
