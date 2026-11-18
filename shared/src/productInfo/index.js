import { INFO_TEMPLATES } from "./templates.js";

export { INFO_TEMPLATES };

export const INFO_PREFIX = "Info: ";

export const infoTemplateById = (id) => INFO_TEMPLATES.find((t) => t.id === id) ?? null;
export const FAQ_GROUP = `${INFO_PREFIX}FAQ`;
export const FAQ_LIMITS = { rows: 15, question: 160, answer: 600 };
export const isFaqGroup = (group) => group === FAQ_GROUP;
export const BRAND_GROUP = `${INFO_PREFIX}Brand`;
export const BRAND_LIMITS = { rows: 6, heading: 80, text: 600 };
export const isBrandGroup = (group) => group === BRAND_GROUP;
export const BRAND_IMAGE_GROUP = `${INFO_PREFIX}Brand image`;
export const BRAND_PHOTO_MAX = 15;
export const isBrandImageGroup = (group) => group === BRAND_IMAGE_GROUP;
export const isTemplateGroup = (group) => isInfoGroup(group) && !isFaqGroup(group) && !isBrandGroup(group) && !isBrandImageGroup(group);
const imageKey = (heading) => String(heading ?? "").trim().slice(0, 40);

export const specLimitsFor = (group, base) =>
  isFaqGroup(group)
    ? { label: FAQ_LIMITS.question, value: FAQ_LIMITS.answer }
    : isBrandGroup(group)
      ? { label: BRAND_LIMITS.heading, value: BRAND_LIMITS.text }
      : { label: base.label, value: base.value };

export const buildBrandStory = (specs) => {
  const list = Array.isArray(specs) ? specs : [];
  const photos = new Map(list.filter((s) => isBrandImageGroup(s?.group)).map((s) => [imageKey(s.label), Number.parseInt(s.value, 10)]));
  return list
    .filter((s) => isBrandGroup(s?.group) && String(s.label ?? "").trim() && String(s.value ?? "").trim())
    .map((s) => {
      const photo = photos.get(imageKey(s.label));
      return { heading: String(s.label).trim(), text: String(s.value).trim(), photo: Number.isInteger(photo) && photo >= 1 && photo <= BRAND_PHOTO_MAX ? photo : null };
    });
};

export const brandRows = (specs) => {
  const list = Array.isArray(specs) ? specs : [];
  const photos = new Map(list.filter((s) => isBrandImageGroup(s?.group)).map((s) => [imageKey(s.label), String(s.value ?? "")]));
  return list.filter((s) => isBrandGroup(s?.group)).map((s) => ({ heading: s.label ?? "", text: s.value ?? "", photo: photos.get(imageKey(s.label)) ?? "" }));
};

export const brandSpecs = (rows) =>
  rows.flatMap((r) => {
    const base = { group: BRAND_GROUP, label: r.heading, value: r.text };
    const photo = Number.parseInt(r.photo, 10);
    return Number.isInteger(photo) && imageKey(r.heading) ? [base, { group: BRAND_IMAGE_GROUP, label: imageKey(r.heading), value: String(photo) }] : [base];
  });

export const buildFaqs = (specs) =>
  (Array.isArray(specs) ? specs : [])
    .filter((s) => isFaqGroup(s?.group) && String(s.label ?? "").trim() && String(s.value ?? "").trim())
    .map((s) => ({ question: String(s.label).trim(), answer: String(s.value).trim() }));

export const faqRows = (specs) => (Array.isArray(specs) ? specs.filter((s) => isFaqGroup(s?.group)).map((s) => ({ question: s.label ?? "", answer: s.value ?? "" })) : []);

export const infoGroupKey = (name) => `${INFO_PREFIX}${name}`;
export const isInfoGroup = (group) => typeof group === "string" && group.startsWith(INFO_PREFIX);
export const infoGroupName = (group) => (isInfoGroup(group) ? group.slice(INFO_PREFIX.length) : group);

export const infoTemplateOf = (specs) => {
  const rows = (Array.isArray(specs) ? specs : []).filter((s) => isTemplateGroup(s?.group));
  if (!rows.length) return null;
  const score = (t) => rows.filter((r) => t.groups.some((g) => infoGroupKey(g.name) === r.group && g.rows.some((x) => x.label === r.label))).length;
  const ranked = INFO_TEMPLATES.map((t) => [t, score(t)]).sort((a, b) => b[1] - a[1]);
  return ranked[0][1] > 0 ? ranked[0][0] : null;
};

export const plainSpecs = (specs) => (Array.isArray(specs) ? specs.filter((s) => !isInfoGroup(s?.group)) : []);

const filled = (v) => v !== undefined && v !== null && String(v).trim() !== "";

export function buildInfoGroups(specs) {
  const list = (Array.isArray(specs) ? specs : []).filter((s) => isTemplateGroup(s?.group) && filled(s.label) && filled(s.value));
  if (!list.length) return [];
  const template = infoTemplateOf(list);
  const order = template ? template.groups.map((g) => g.name) : [];
  const names = [...new Set(list.map((s) => infoGroupName(s.group)))];
  names.sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return names.map((name) => {
    const rowOrder = template?.groups.find((g) => g.name === name)?.rows.map((r) => r.label) ?? [];
    const rows = list
      .filter((s) => infoGroupName(s.group) === name)
      .map((s) => ({ label: s.label, value: String(s.value) }))
      .sort((a, b) => {
        const ia = rowOrder.indexOf(a.label);
        const ib = rowOrder.indexOf(b.label);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
    return { name, rows };
  });
}

const BOOL = { yes: "Yes", no: "No" };

export const infoValueText = (row, raw) => {
  if (!filled(raw)) return "";
  if (row.input === "number") return row.unit ? `${String(raw).trim()} ${row.unit}` : String(raw).trim();
  if (row.input === "boolean") return BOOL[String(raw).toLowerCase()] ?? String(raw);
  return String(raw).trim();
};

export const infoValueRaw = (row, stored) => {
  if (!filled(stored)) return "";
  const value = String(stored).trim();
  if (row.input === "number") return value.slice(0, row.unit && value.endsWith(row.unit) ? value.length - row.unit.length : value.length).trim();
  return value;
};

export const INFO_GROUP_LIMIT = 40;

const RULES = [
  { id: "speaker", name: /\b(speaker|soundbar|subwoofer|woofer|home theat)/i },
  { id: "phone", type: ["phone"], name: /\b(phone|iphone|smartphone|android|tecno|infinix|samsung galaxy|redmi)\b/i },
  { id: "water-point", type: ["drinking-water"], category: /water/i, name: /\b(refill|water)\b/i },
  { id: "custom-printing", type: ["printing"], category: /print/i, name: /\b(print|branding|embroider|banner)/i },
  { id: "bakery-item", type: ["bread"], category: /bakery|juice/i, name: /\b(cookie|cake|bread|mandazi|samosa|doughnut|pastry|bun)/i },
  { id: "packaged-goods", category: /supermarket|minimart|grocer|household|cosmetic|baby/i, name: /\b(powder|soap|detergent|omo|msafi|tissue|oil|flour|sugar)\b/i }
];

export function suggestInfoTemplate({ category = "", typeId = "", name = "" } = {}) {
  const hit =
    RULES.find((r) => r.name?.test(name)) ??
    RULES.find((r) => r.type?.includes(typeId)) ??
    RULES.find((r) => r.category?.test(category));
  return hit?.id ?? "general-product";
}
