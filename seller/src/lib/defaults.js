import { DEFAULT_CLOSURE_REASONS, DEFAULT_SETTINGS, clone, greetingFor, resolveSettings } from "@epicmkt/shared";

export const GENERIC_UNITS = ["each", "kg", "litre", "hour", "session", "pack"];
export const suggestedUnits = () => [...GENERIC_UNITS];

export const categoryKey = (business) => {
  const raw = business?.category_id ?? business?.category_name ?? "general";
  return String(raw).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "general";
};

export const unitsFor = (settings, business) => {
  const list = resolveSettings(settings).catalog.default_units[categoryKey(business)];
  return list && list.length ? list : suggestedUnits();
};

// What a brand-new item starts with. Read by the item forms, duplicate and import.
export function newItemDefaults(settings, business) {
  const c = resolveSettings(settings).catalog;
  const units = unitsFor(settings, business);
  return {
    availability: c.default_availability,
    visible: c.start_visible,
    low_stock_threshold: c.low_stock_threshold,
    show_stock_count: c.show_only_n_left,
    unit: units[0] ?? null,
    units
  };
}

export const staleDays = (settings) => resolveSettings(settings).catalog.price_reminder_days;
export const closureReasons = (settings) => resolveSettings(settings).messaging.closure_reasons;
export const partialClosureMessage = (settings) => resolveSettings(settings).business.partial_closure_message;
export const showClosesChip = (settings) => resolveSettings(settings).business.show_closes_chip;
export const whatsappGreeting = (settings, vars) => greetingFor(settings, vars);
export const defaultClosureReasons = () => clone(DEFAULT_CLOSURE_REASONS);
export const defaultSettings = () => clone(DEFAULT_SETTINGS);
