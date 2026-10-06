import { requiredSlots } from "../../shared/validators.js";

const BASE_WHY = {
  owner_id_front: "To confirm who owns the business.",
  owner_id_back: "The back of a National ID carries details we need to check.",
  sbp: "Shows the business is licensed by its county.",
  signboard: "Shows the business really operates at this location.",
  br_cert: "Confirms the business is registered.",
  kra_pin_cert: "Confirms the business tax PIN."
};

export function documentCards(cat, values) {
  if (!cat) return [];
  const passport = values.owner?.idType === "passport";
  const registered = values.business?.registered === true;
  const required = new Set(
    requiredSlots(cat, {
      ownerIdType: values.owner?.idType,
      registered,
      conditionalDocs: values.conditionalDocs ?? {}
    })
  );
  const card = (key, label, group, extra = {}) => ({
    key,
    label,
    group,
    why: BASE_WHY[key],
    state: "required",
    active: true,
    ...extra
  });
  const cards = [
    card("owner_id_front", passport ? "Passport photo page" : "National ID, front", "You"),
    ...(passport ? [] : [card("owner_id_back", "National ID, back", "You")]),
    card("sbp", "Single Business Permit", "Business"),
    card("signboard", "Signboard or shop-front photo", "Business"),
    ...(registered
      ? [
          card("br_cert", "Business registration certificate", "Business"),
          card("kra_pin_cert", "KRA PIN certificate", "Business")
        ]
      : [])
  ];
  for (const d of cat.extraDocs ?? []) {
    const key = `cat_${d.key}`;
    const on = d.rule === "conditional" ? !!values.conditionalDocs?.[d.key] : true;
    cards.push({
      key,
      label: d.label,
      group: cat.name,
      why: d.why,
      state: required.has(key) ? "required" : d.rule,
      active: on,
      conditionKey: d.rule === "conditional" ? d.key : undefined,
      condition: d.condition
    });
  }
  return cards;
}

export const missingSlots = (cards, files) =>
  cards.filter((c) => c.active && c.state === "required" && !files[c.key]?.file);
