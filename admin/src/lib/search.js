// Palette search model. The result shape mirrors public.admin_search(q, scopes, lim):
// { businesses: [], items: [], applications: [], payments: [], faqs: [] }, or {} for a term under 2 characters.

import { PEEK_PAGES } from "./peek.js";

export const MIN_CHARS = 2;
export const DEBOUNCE_MS = 200;

export const SCOPES = [
  { key: "all", label: "All" },
  { key: "businesses", label: "Businesses", type: "business", prefix: "b" },
  { key: "items", label: "Items", type: "item", prefix: "i" },
  { key: "applications", label: "Applications", type: "application", prefix: "a" },
  { key: "payments", label: "Payments", type: "payment", prefix: "p" },
  { key: "faqs", label: "FAQs", type: "faq", prefix: "f" },
];

const BY_PREFIX = Object.fromEntries(SCOPES.filter((s) => s.prefix).map((s) => [s.prefix, s.key]));

// "b: mara" -> { scope: "businesses", term: "mara", prefixed: true }. Without a prefix the chip scope applies.
export function parseQuery(raw, chip = "all") {
  const input = typeof raw === "string" ? raw : "";
  const m = /^\s*([a-zA-Z]):\s*([\s\S]*)$/.exec(input);
  const scope = m ? BY_PREFIX[m[1].toLowerCase()] : null;
  if (scope) return { scope, term: m[2].trim(), prefixed: true };
  return { scope: chip, term: input.trim(), prefixed: false };
}

const money = (n) => (n === null || n === undefined ? "" : `KES ${Number(n).toLocaleString("en-KE")}`);
const join = (...parts) => parts.filter((p) => p !== null && p !== undefined && p !== "").join(" · ");

const MAPPERS = {
  businesses: (r) => ({ type: "business", id: r.id, title: r.name, subtitle: join(r.seller_id, r.town, r.phone), badge: r.status, copy: r.seller_id ?? r.id, pageHref: PEEK_PAGES.business }),
  items: (r) => ({ type: "item", id: r.id, title: r.name, subtitle: join(r.business_name, money(r.price)), badge: r.hidden_by_admin ? "hidden" : r.availability, copy: r.id, pageHref: PEEK_PAGES.item }),
  applications: (r) => ({ type: "application", id: r.id, title: r.business_name, subtitle: join(r.reference_no, r.owner_full_name), badge: r.status, copy: r.reference_no ?? r.id, pageHref: PEEK_PAGES.application }),
  payments: (r) => ({ type: "payment", id: r.id, title: r.mpesa_code ?? r.receipt_no ?? r.id, subtitle: join(r.business_name, money(r.amount_kes)), badge: r.status, copy: r.mpesa_code ?? r.id, pageHref: PEEK_PAGES.payment }),
  faqs: (r) => ({ type: "faq", id: r.id, title: r.question, subtitle: r.business_name ?? "", badge: "", copy: r.id, pageHref: PEEK_PAGES.faq }),
};

const rowOf = (scopeKey, record) => {
  const base = MAPPERS[scopeKey](record);
  return { ...base, key: `${base.type}:${base.id}`, subtitle: base.subtitle ?? "", badge: base.badge ?? "" };
};

// Non-empty groups, in scope order. Each group: { key, label, rows }.
export function toGroups(result) {
  const groups = [];
  for (const scope of SCOPES) {
    if (scope.key === "all") continue;
    const records = Array.isArray(result?.[scope.key]) ? result[scope.key] : [];
    if (records.length) groups.push({ key: scope.key, label: scope.label, rows: records.map((r) => rowOf(scope.key, r)) });
  }
  return groups;
}

export const flattenGroups = (groups) => groups.flatMap((g) => g.rows);

export function isMac() {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "");
}
