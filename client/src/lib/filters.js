import { describeFilter, formatKes } from "@epicmkt/shared";

export const SORT_OPTIONS = [
  { value: "relevance", label: "Recommended" },
  { value: "distance", label: "Nearest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "newest", label: "Newest" }
];

export const RADII = [1, 2, 5, 10, 25, 50];

export const STATUS_OPTIONS = [
  { value: "", label: "Any time" },
  { value: "open", label: "Open now" },
  { value: "closed", label: "Closed now" }
];

const statusParam = (status) => (status === "open" ? "1" : status === "closed" ? "0" : "");
const statusFromParam = (value) => (value === "1" ? "open" : value === "0" ? "closed" : "");

export const TOGGLES = [
  { key: "open24", group: "hours", param: "h24", api: "open24", label: "Open 24 hours" },
  { key: "openLate", group: "hours", param: "late", api: "openLate", label: "Open late (past 9 PM)" },
  { key: "openSunday", group: "hours", param: "sun", api: "openSunday", label: "Open on Sundays" },
  { key: "flash", group: "deals", param: "flash", api: "flashSale", label: "Flash sale live" },
  { key: "offers", group: "deals", param: "offers", api: "hasOffers", label: "Has offers" },
  { key: "verified", group: "business", param: "verified", api: "verifiedOnly", label: "Verified only" },
  { key: "featured", group: "business", param: "featured", api: "featuredOnly", label: "Featured only" },
  { key: "whatsapp", group: "business", param: "wa", api: "hasWhatsapp", label: "On WhatsApp" },
  { key: "isNew", group: "business", param: "new", api: "newlyListed", label: "New this month" }
];

const ATTR_PREFIX = "f.";

export function readFilters(params) {
  const attrs = {};
  for (const [key, value] of params) {
    if (key.startsWith(ATTR_PREFIX) && value) attrs[key.slice(ATTR_PREFIX.length)] = value;
  }
  const sort = params.get("sort");
  return {
    sort: SORT_OPTIONS.some((o) => o.value === sort) ? sort : "relevance",
    status: statusFromParam(params.get("open")),
    ...Object.fromEntries(TOGGLES.map((t) => [t.key, params.get(t.param) === "1"])),
    radius: RADII.includes(Number(params.get("radius"))) ? Number(params.get("radius")) : 0,
    minPrice: params.get("pmin") ?? "",
    maxPrice: params.get("pmax") ?? "",
    town: params.get("town") ?? "",
    attrs
  };
}

const setOrDelete = (next, key, value) => (value ? next.set(key, String(value)) : next.delete(key));

export function applyFilters(params, patch) {
  const next = new URLSearchParams(params);
  if ("sort" in patch) setOrDelete(next, "sort", patch.sort === "relevance" ? "" : patch.sort);
  if ("status" in patch) setOrDelete(next, "open", statusParam(patch.status));
  for (const t of TOGGLES) if (t.key in patch) setOrDelete(next, t.param, patch[t.key] ? "1" : "");
  if ("radius" in patch) setOrDelete(next, "radius", patch.radius || "");
  if ("minPrice" in patch) setOrDelete(next, "pmin", patch.minPrice);
  if ("maxPrice" in patch) setOrDelete(next, "pmax", patch.maxPrice);
  if ("town" in patch) setOrDelete(next, "town", patch.town);
  if (patch.attrs) {
    for (const [key, value] of Object.entries(patch.attrs)) setOrDelete(next, `${ATTR_PREFIX}${key}`, value);
  }
  return next;
}

export function clearFilters(params) {
  const next = new URLSearchParams();
  const q = params.get("q");
  if (q) next.set("q", q);
  const sort = params.get("sort");
  if (sort) next.set("sort", sort);
  return next;
}

export function toApiFilters(filters, coords, seed) {
  const attrs = {};
  for (const [key, value] of Object.entries(filters.attrs)) attrs[key] = value;
  return {
    sort: filters.sort,
    openNow: filters.status === "open",
    closedNow: filters.status === "closed",
    ...Object.fromEntries(TOGGLES.map((t) => [t.api, filters[t.key]])),
    radiusKm: filters.radius || null,
    minPrice: filters.minPrice === "" ? null : Number(filters.minPrice),
    maxPrice: filters.maxPrice === "" ? null : Number(filters.maxPrice),
    town: filters.town || null,
    attrs,
    seed,
    ...(coords ?? {})
  };
}

export function buildChips(filters, facets) {
  const chips = [];
  const status = STATUS_OPTIONS.find((o) => o.value && o.value === filters.status);
  if (status) chips.push({ id: "status", label: status.label, patch: { status: "" } });
  for (const t of TOGGLES) if (filters[t.key]) chips.push({ id: t.param, label: t.label, patch: { [t.key]: false } });
  if (filters.radius) chips.push({ id: "radius", label: `Within ${filters.radius} km`, patch: { radius: 0 } });
  if (filters.minPrice !== "" || filters.maxPrice !== "") {
    const label =
      filters.minPrice !== "" && filters.maxPrice !== ""
        ? `${formatKes(filters.minPrice)} – ${formatKes(filters.maxPrice)}`
        : filters.minPrice !== ""
          ? `From ${formatKes(filters.minPrice)}`
          : `Up to ${formatKes(filters.maxPrice)}`;
    chips.push({ id: "price", label, patch: { minPrice: "", maxPrice: "" } });
  }
  if (filters.town) {
    const name = facets?.towns?.find((t) => t.slug === filters.town)?.name ?? filters.town;
    chips.push({ id: "town", label: name, patch: { town: "" } });
  }
  for (const field of facets?.fields ?? []) {
    const value = filters.attrs[field.key];
    if (!value) continue;
    chips.push({ id: `f.${field.key}`, label: describeFilter(field, value), patch: { attrs: { [field.key]: "" } } });
  }
  return chips;
}
