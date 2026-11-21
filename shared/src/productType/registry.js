// What the catalogue says about a product type: its department and whether it is a good or a service. The data is generated from the seeds
// (registry.generated.js); a type the registry does not know (a custom or demo type, "other", none) says nothing, and callers keep today's
// behaviour for it.
import { TYPE_REGISTRY } from "./registry.generated.js";
import { hasNoTypeEvidence } from "./other.js";

const entry = (typeId) => (hasNoTypeEvidence(typeId) ? undefined : TYPE_REGISTRY[String(typeId).trim().toLowerCase()]);

export const departmentOfType = (typeId) => entry(typeId)?.[0] ?? null;
export const kindOfType = (typeId) => entry(typeId)?.[1] ?? null;
export const isKnownType = (typeId) => entry(typeId) !== undefined;

/**
 * Can two product types be "the same kind of thing"? False when the catalogue says they sit in different departments, or one is a good
 * and the other a service or package. True for the same type, and whenever either type is unknown or a department is not recorded.
 */
export function typesCompatible(a, b) {
  const x = entry(a);
  const y = entry(b);
  if (!x || !y) return true;
  if (String(a).trim().toLowerCase() === String(b).trim().toLowerCase()) return true;
  if (x[0] && y[0] && x[0] !== y[0]) return false;
  if ((x[1] === "good") !== (y[1] === "good")) return false;
  return true;
}
