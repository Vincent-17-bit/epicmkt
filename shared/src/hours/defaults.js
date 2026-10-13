import { CLOSURE_REASONS, SCOPE_LABELS } from "./status.js";
import { cleanText } from "./message.js";

export const DEFAULT_PARTIAL_MESSAGE = "Delivery paused until {time}";
export const MAX_SECTIONS = 30;

export function resolveHoursDefaults(settings) {
  const d = settings?.hours_defaults && typeof settings.hours_defaults === "object" ? settings.hours_defaults : {};
  const seen = new Set();
  const reasons = (Array.isArray(d.closure_reasons) ? d.closure_reasons : []).filter((r) => CLOSURE_REASONS.includes(r) && !seen.has(r) && seen.add(r));
  const partial = cleanText(d.partial_message);
  const sections = [];
  for (const s of Array.isArray(settings?.sections) ? settings.sections : []) {
    const name = cleanText(typeof s === "string" ? s : s?.name).slice(0, 60);
    if (name && !sections.includes(name) && sections.length < MAX_SECTIONS) sections.push(name);
  }
  return {
    closureReasons: reasons.length ? reasons : [...CLOSURE_REASONS],
    defaultReason: reasons[0] ?? CLOSURE_REASONS[0],
    partialMessage: partial || DEFAULT_PARTIAL_MESSAGE,
    sections
  };
}

export function defaultPartialMessage(scope, section, template = DEFAULT_PARTIAL_MESSAGE) {
  if (scope === "delivery") return template;
  const name = scope === "section" ? cleanText(section) || "Section" : SCOPE_LABELS[scope] ?? "Service";
  return `${name} paused until {time}`;
}
