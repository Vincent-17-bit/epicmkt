import { categoryById } from "../data/categories.js";
import { routes } from "../config/routes.js";

// The /contact?suggest= link. `suggest` is the business name; the rest are optional extras.
// Contact reads them back with readSuggestion, so the page that builds the link and the page that shows it cannot drift.

export const SUGGEST_MAX = 60;
const PHONE_MAX = 20;

const clean = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const cleanPhone = (value) => String(value ?? "").replace(/[^\d+\s-]/g, "").replace(/\s+/g, " ").trim().slice(0, PHONE_MAX);

/** The /contact URL for a suggestion. form: { name, category, town, phone }. Returns null when there is no name. */
export function suggestionPath({ name, category, town, phone }) {
  const params = new URLSearchParams();
  const business = clean(name, SUGGEST_MAX);
  if (!business) return null;
  params.set("suggest", business);
  if (categoryById[category]) params.set("category", category);
  if (clean(town, SUGGEST_MAX)) params.set("town", clean(town, SUGGEST_MAX));
  if (cleanPhone(phone)) params.set("phone", cleanPhone(phone));
  return `${routes.contact}?${params.toString()}`;
}

/** Reads a suggestion back from the URL: { name, note } or null. A bare ?suggest=Name gives the message it always did. */
export function readSuggestion(params) {
  const name = clean(params.get("suggest"), SUGGEST_MAX);
  if (!name) return null;
  const category = categoryById[params.get("category")]?.name;
  const town = clean(params.get("town"), SUGGEST_MAX);
  const phone = cleanPhone(params.get("phone"));
  const extras = [category && `Category: ${category}.`, town && `Town: ${town}.`, phone && `Phone or WhatsApp: ${phone}.`].filter(Boolean);
  return { name, note: [`Please add "${name}" to EpicMKT.`, ...extras].join(" ") };
}
