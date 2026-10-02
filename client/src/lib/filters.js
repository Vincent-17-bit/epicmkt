import { describeFilter, formatKes } from "@epicmkt/shared";

export const SORT_OPTIONS = [
  { value: "relevance", label: "Recommended" },
  { value: "distance", label: "Nearest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "newest", label: "Newest" }
];

export const RADII = [1, 2, 5, 10, 25, 50];

const ATTR_PREFIX = "f.";

export function readFilters(params) {
  const attrs = {};
  for (const [key, value] of params) {
    if (key.startsWith(ATTR_PREFIX) && value) attrs[key.slice(ATTR_PREFIX.length)] = value;
  }
  const sort = params.get("sort");
  return {
    sort: SORT_OPTIONS.some((o) => o.value === sort) ? sort : "relevance",
    openNow: params.get("open") === "1",
    verified: params.get("verified") === "1",
    featured: params.get("featured") === "1",
    radius: RADII.includes(Number(params.get("radius"))) ? Number(params.get("radius")) : 0,
    minPrice: params.get("pmin") ?? "",
    maxPrice: params.get("pmax") ?? "",
    area: params.get("area") ?? "",
    attrs
  };
}

const setOrDelete = (next, key, value) => (value ? next.set(key, String(value)) : next.delete(key));

export function applyFilters(params, patch) {
  const next = new URLSearchParams(params);
  if ("sort" in patch) setOrDelete(next, "sort", patch.sort === "relevance" ? "" : patch.sort);
  if ("openNow" in patch) setOrDelete(next, "open", patch.openNow ? "1" : "");
  if ("verified" in patch) setOrDelete(next, "verified", patch.verified ? "1" : "");
  if ("featured" in patch) setOrDelete(next, "featured", patch.featured ? "1" : "");
  if ("radius" in patch) setOrDelete(next, "radius", patch.radius || "");
  if ("minPrice" in patch) setOrDelete(next, "pmin", patch.minPrice);
  if ("maxPrice" in patch) setOrDelete(next, "pmax", patch.maxPrice);
  if ("area" in patch) setOrDelete(next, "area", patch.area);
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
    openNow: filters.openNow,
    verifiedOnly: filters.verified,
    featuredOnly: filters.featured,
    radiusKm: filters.radius || null,
    minPrice: filters.minPrice === "" ? null : Number(filters.minPrice),
    maxPrice: filters.maxPrice === "" ? null : Number(filters.maxPrice),
    area: filters.area || null,
    attrs,
    seed,
    ...(coords ?? {})
  };
}

export function buildChips(filters, facets) {
  const chips = [];
  if (filters.openNow) chips.push({ id: "open", label: "Open now", patch: { openNow: false } });
  if (filters.verified) chips.push({ id: "verified", label: "Verified only", patch: { verified: false } });
  if (filters.featured) chips.push({ id: "featured", label: "Featured only", patch: { featured: false } });
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
  if (filters.area) chips.push({ id: "area", label: filters.area, patch: { area: "" } });
  for (const field of facets?.fields ?? []) {
    const value = filters.attrs[field.key];
    if (!value) continue;
    chips.push({ id: `f.${field.key}`, label: describeFilter(field, value), patch: { attrs: { [field.key]: "" } } });
  }
  return chips;
}
