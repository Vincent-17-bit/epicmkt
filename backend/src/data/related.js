// Demo data for "Goes well with" (C19): a product type and department for each demo item, and the admin-managed relations
// (product_relations, migration 0109) between them. The live database stores both; the demo shops were written before product
// types existed, so a small name rule gives each item one. An item the rules do not know gets none and simply has no row.

const RULES = [
  [/\b(tecno|infinix|galaxy|iphone)\b/i, "phone", "phones"],
  [/phone case/i, "phone-case", "phones"],
  [/screen protector/i, "screen-protector", "phones"],
  [/earbuds/i, "earbuds", "phones"],
  [/charger|power bank/i, "charger", "cables-power"],
  [/\b(laptop|latitude|ideapad)\b(?!.*service)/i, "laptop", "computers"],
  [/monitor/i, "monitor", "computers"],
  [/keyboard/i, "keyboard-mouse", "computers"],
  [/router/i, "router", "computers"],
  [/microsd|flash disk/i, "memory-card", "computers"],
  [/printer/i, "printer", "printers-ink"],
  [/smart tv/i, "tv", "tv-audio"],
  [/\bdress(es)?\b/i, "dress", "clothing"],
  [/blouse|jeans|jacket/i, "clothing", "clothing"],
  [/shoes?\b|sandals?|sneakers?/i, "shoes", "shoes"],
  [/handbag/i, "handbag", "bags"],
  [/sufuria|frying pan|pressure cooker|gas cooker/i, "cookware", "kitchen"],
  [/kettle|blender/i, "small-appliance", "kitchen"],
  [/dinner set|cutlery|spoon set|knife set/i, "tableware", "kitchen"],
  [/bedsheet|curtains|towel set/i, "home-textiles", "home"]
];

/** { productTypeId, departmentId } for a demo item: its own fields when set, else the first name rule that matches. */
export function demoTypeOf(svc) {
  if (svc?.productTypeId || svc?.departmentId) return { productTypeId: svc.productTypeId ?? null, departmentId: svc.departmentId ?? null };
  const name = String(svc?.name ?? "");
  for (const [re, productTypeId, departmentId] of RULES) if (re.test(name)) return { productTypeId, departmentId };
  return { productTypeId: null, departmentId: null };
}

const rel = (fromKind, fromId, toKind, toId, weight) => ({ fromKind, fromId, toKind, toId, weight, active: true });

/** What an admin would set on the Relations page for these shops. */
export const demoRelations = [
  rel("type", "phone", "type", "phone-case", 10),
  rel("type", "phone", "type", "screen-protector", 9),
  rel("type", "phone", "type", "charger", 8),
  rel("type", "phone", "type", "earbuds", 7),
  rel("type", "phone", "type", "memory-card", 5),
  rel("type", "laptop", "type", "keyboard-mouse", 9),
  rel("type", "laptop", "type", "monitor", 8),
  rel("type", "laptop", "type", "router", 6),
  rel("type", "laptop", "type", "memory-card", 5),
  rel("type", "laptop", "type", "printer", 4),
  rel("type", "tv", "type", "router", 6),
  rel("type", "dress", "type", "handbag", 8),
  rel("type", "dress", "department", "shoes", 7),
  rel("type", "shoes", "type", "handbag", 6),
  rel("department", "clothing", "department", "shoes", 5),
  rel("department", "clothing", "department", "bags", 5),
  rel("type", "cookware", "type", "tableware", 7),
  rel("type", "cookware", "type", "small-appliance", 6),
  rel("type", "printer", "type", "laptop", 5)
];
