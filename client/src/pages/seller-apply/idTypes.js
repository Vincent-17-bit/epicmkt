import { faAddressCard, faFingerprint, faPassport } from "@fortawesome/free-solid-svg-icons";

// One place that knows how each kind of ID looks: how it is typed, labelled, validated and uploaded.
// The same rules are enforced again on the server (supabase/functions/_shared/validate.ts).
export const ID_TYPES = {
  national_id: {
    label: "National ID",
    blurb: "The ID card with a 7 or 8 digit number",
    icon: faAddressCard,
    numberLabel: "National ID number",
    placeholder: "For example 12345678",
    hint: "7 or 8 digits, printed on your ID",
    inputMode: "numeric",
    maxLength: 8,
    digitsOnly: true,
    hasBack: true,
    frontLabel: "National ID, front",
    backLabel: "National ID, back",
    why: "The back of a National ID carries details we need to check."
  },
  maisha_card: {
    label: "Maisha Card",
    blurb: "The new digital ID card (Maisha Namba)",
    icon: faFingerprint,
    numberLabel: "Maisha Namba (ID number)",
    placeholder: "For example 123456789",
    hint: "The Maisha Namba on your card, 9 digits. If you upgraded from the old ID, it is your old 7 or 8 digit number.",
    inputMode: "numeric",
    maxLength: 9,
    digitsOnly: true,
    hasBack: true,
    frontLabel: "Maisha Card, front",
    backLabel: "Maisha Card, back",
    why: "The back of the Maisha Card carries details we need to check."
  },
  passport: {
    label: "Passport",
    blurb: "For foreign nationals or citizens abroad",
    icon: faPassport,
    numberLabel: "Passport number",
    placeholder: "For example A1234567",
    hint: "6 to 9 letters or digits",
    inputMode: "text",
    maxLength: 9,
    digitsOnly: false,
    hasBack: false,
    frontLabel: "Passport photo page",
    backLabel: "",
    why: "To confirm who owns the business."
  }
};

export const ID_ORDER = ["national_id", "maisha_card", "passport"];

export const idTypeOf = (key) => ID_TYPES[key] ?? ID_TYPES.national_id;

/** Keep only what the chosen ID can hold, so a wrong key press never reaches the box. */
export function cleanIdNumber(key, raw) {
  const t = idTypeOf(key);
  const s = String(raw ?? "");
  return (t.digitsOnly ? s.replace(/\D/g, "") : s.replace(/[^A-Za-z0-9]/g, "").toUpperCase()).slice(0, t.maxLength);
}

const ID_RULES = {
  national_id: [/^\d{7,8}$/, "National ID must be 7 or 8 digits"],
  maisha_card: [/^\d{7,9}$/, "Maisha Card number must be 7 to 9 digits"],
  passport: [/^[A-Z0-9]{6,9}$/, "Passport number must be 6 to 9 letters or digits"]
};

/** The message for a wrong ID number, or "" when it is fine. Mirrors the server rule. */
export function idNumberError(key, raw) {
  const value = String(raw ?? "").replace(/\s/g, "").toUpperCase();
  if (!value) return "Enter your ID number";
  const [pattern, message] = ID_RULES[key] ?? ID_RULES.national_id;
  return pattern.test(value) ? "" : message;
}
