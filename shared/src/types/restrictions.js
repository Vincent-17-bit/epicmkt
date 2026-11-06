// Selling restrictions for product types (A08). Pure functions, no I/O.
//
// A type is sellable by any shop unless it carries `restrictedTo[]`: a list of SHOP CATEGORY IDS (the ids in
// client/src/data/categories.js, which are `businesses.category_id` in the database). An empty or missing list means "anyone".
// The database enforces the same rule (shop_can_sell_type and a trigger on items, migration 0090); these helpers let the picker
// hide what a shop may not sell. Unknown shop categories fail closed: a restricted type is never offered to a shop whose
// category is missing or not listed.
//
// REGULATED_TYPES is the one place the policy is written in code; a DB test checks that the seeded product_types rows agree.
// TODO(contract:A06): when A06 owns the full product type list, this stays the list of regulated ids and nothing else.

export const REGULATED_TYPES = Object.freeze({
  "prescription-medicine": Object.freeze(["chemist"]),
  "vet-medicine": Object.freeze(["agrovet"]),
  "agrochemicals": Object.freeze(["agrovet"])
});

export const TYPE_ERRORS = Object.freeze({
  NOT_ALLOWED: "type_not_allowed",
  UNKNOWN_TYPE: "unknown_product_type",
  INVALID_TYPE: "invalid_product_type",
  TOO_MANY_REQUESTS: "too_many_type_requests",
  REQUEST_NOT_FOUND: "type_request_not_found",
  REQUEST_CLOSED: "type_request_closed"
});

// The categories a type is restricted to, from the type itself or, for a bare id, from REGULATED_TYPES. [] means anyone.
export function restrictedToOf(typeOrId) {
  if (typeOrId == null) return [];
  if (typeof typeOrId === "string") return [...(REGULATED_TYPES[typeOrId] ?? [])];
  return Array.isArray(typeOrId.restrictedTo) ? [...typeOrId.restrictedTo] : [];
}

export const isRestricted = (typeOrId) => restrictedToOf(typeOrId).length > 0;

// May a shop of this category sell this type? `null` (Other goods) is always allowed.
export function canSellType(typeOrId, categoryId) {
  const list = restrictedToOf(typeOrId);
  if (list.length === 0) return true;
  return typeof categoryId === "string" && list.includes(categoryId);
}

export const sellableTypesFor = (types, categoryId) => (Array.isArray(types) ? types : []).filter((t) => canSellType(t, categoryId));

// Request validation shared by the form and the database (seller_request_type): same limits, same trimming.
export const TYPE_REQUEST_LIMITS = Object.freeze({ nameMin: 2, nameMax: 80, noteMax: 500, pendingMax: 20 });

export function cleanTypeRequest(name, note) {
  const n = String(name ?? "").replace(/\s+/g, " ").trim();
  const t = String(note ?? "").trim();
  if (n.length < TYPE_REQUEST_LIMITS.nameMin || n.length > TYPE_REQUEST_LIMITS.nameMax) return { ok: false, error: "invalid_name" };
  if (t.length > TYPE_REQUEST_LIMITS.noteMax) return { ok: false, error: "invalid_note" };
  return { ok: true, value: { name: n, note: t || null } };
}
