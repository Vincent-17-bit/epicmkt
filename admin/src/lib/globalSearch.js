// Turns the raw jsonb from the admin_search() RPC into groups the header search can list, and says where each
// result should open. Pure functions, no browser or Supabase. The demo API returns the same raw shape.
//
// raw = { businesses: [...], items: [...], applications: [...], payments: [...], faqs: [...] }

export const MIN_QUERY = 2;

const kes = (value) => `KES ${Number(value ?? 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
const words = (text) => String(text ?? "").replace(/_/g, " ");
const join = (...parts) => parts.filter((part) => part !== null && part !== undefined && String(part).trim() !== "").join(" · ");
const toBusinesses = (name) => `/admin/businesses?q=${encodeURIComponent(name ?? "")}`;

const GROUPS = [
  {
    key: "applications",
    label: "Applications",
    map: (r) => ({ id: r.id, title: r.business_name, subtitle: join(r.reference_no, r.owner_full_name, words(r.status)), to: `/admin/applications/${r.id}` }),
  },
  {
    key: "businesses",
    label: "Businesses",
    map: (r) => ({ id: r.id, title: r.name, subtitle: join(r.seller_id, r.town, words(r.status)), to: toBusinesses(r.name) }),
  },
  {
    key: "payments",
    label: "Payments",
    map: (r) => ({ id: r.id, title: join(r.mpesa_code, kes(r.amount_kes)), subtitle: join(r.business_name, words(r.status)), to: `/admin/payments?q=${encodeURIComponent(r.mpesa_code ?? r.business_name ?? "")}` }),
  },
  {
    key: "items",
    label: "Items",
    map: (r) => ({ id: r.id, title: r.name, subtitle: join(r.business_name, r.price !== null && r.price !== undefined ? kes(r.price) : null), to: toBusinesses(r.business_name) }),
  },
  {
    key: "faqs",
    label: "FAQs",
    map: (r) => ({ id: r.id, title: r.question, subtitle: r.business_name, to: toBusinesses(r.business_name) }),
  },
];

// Groups with no results are left out. Every result carries the flat position the keyboard moves through.
export function toResultGroups(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  let position = 0;
  const out = [];
  for (const group of GROUPS) {
    const rows = Array.isArray(source[group.key]) ? source[group.key] : [];
    if (rows.length === 0) continue;
    out.push({
      key: group.key,
      label: group.label,
      items: rows.map((row) => ({ ...group.map(row), group: group.key, position: position++ })),
    });
  }
  return out;
}

export const flatResults = (groups) => groups.flatMap((group) => group.items);

// Stepping through the flat list with the arrow keys wraps around at both ends.
export function moveActive(current, count, step) {
  if (count <= 0) return -1;
  if (current < 0) return step > 0 ? 0 : count - 1;
  return (current + step + count) % count;
}

// Used by the Payments page to narrow its rows when it is opened from a search result.
export function matchesText(values, query) {
  const needle = String(query ?? "").trim().toLowerCase();
  if (!needle) return true;
  return values.some((value) => String(value ?? "").toLowerCase().includes(needle));
}
