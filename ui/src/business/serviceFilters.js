const AVAILABILITY_LABELS = {
  available: "Available",
  limited: "Limited",
  limited_stock: "Limited",
  by_appointment: "By appointment",
  unavailable: "Unavailable",
  out_of_stock: "Unavailable"
};

export const SORTS = [
  { value: "default", label: "Featured order" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "name", label: "Name: A to Z" }
];

export const EMPTY_FILTERS = { section: "", availability: "", min: "", max: "", sort: "default" };

export const availabilityLabel = (svc) => AVAILABILITY_LABELS[svc.availability ?? "available"] ?? "Available";

export function buildFacets(services) {
  const sections = [];
  const availability = [];
  const prices = [];
  for (const svc of services) {
    if (svc.section && !sections.includes(svc.section)) sections.push(svc.section);
    const label = availabilityLabel(svc);
    if (!availability.includes(label)) availability.push(label);
    if (Number.isFinite(svc.priceKes)) prices.push(svc.priceKes);
  }
  return {
    sections,
    availability: availability.length > 1 ? availability : [],
    price: prices.length > 1 && Math.min(...prices) !== Math.max(...prices) ? { min: Math.min(...prices), max: Math.max(...prices) } : null
  };
}

export const countActive = (f) =>
  [f.section, f.availability, f.min !== "", f.max !== "", f.sort !== "default"].filter(Boolean).length;

export function applyServiceFilters(services, f) {
  const min = f.min === "" ? null : Number(f.min);
  const max = f.max === "" ? null : Number(f.max);
  const lo = min != null && max != null ? Math.min(min, max) : min;
  const hi = min != null && max != null ? Math.max(min, max) : max;
  const out = services.filter((svc) => {
    if (f.section && svc.section !== f.section) return false;
    if (f.availability && availabilityLabel(svc) !== f.availability) return false;
    if (lo != null || hi != null) {
      if (!Number.isFinite(svc.priceKes)) return false;
      if (lo != null && svc.priceKes < lo) return false;
      if (hi != null && svc.priceKes > hi) return false;
    }
    return true;
  });
  if (f.sort === "price_asc" || f.sort === "price_desc") {
    const dir = f.sort === "price_asc" ? 1 : -1;
    const priced = (s) => Number.isFinite(s.priceKes);
    return [...out].sort((a, b) => {
      if (priced(a) !== priced(b)) return priced(a) ? -1 : 1;
      return priced(a) ? (a.priceKes - b.priceKes) * dir : 0;
    });
  }
  if (f.sort === "name") return [...out].sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
