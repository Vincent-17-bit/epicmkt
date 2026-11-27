import { formatInternational } from "@epicmkt/shared/phone";

export const FIELD_LABEL = { phone: "Phone", whatsapp: "WhatsApp", login_email: "Sign-in email" };

const show = (field, value) => (value == null || value === "" ? "removed" : field === "login_email" ? value : formatInternational(value));

/** One row of the history, as plain words: { label, from, to, who }. */
export function describeEntry(entry) {
  return {
    label: FIELD_LABEL[entry.field] ?? entry.field,
    from: show(entry.field, entry.old),
    to: show(entry.field, entry.new),
    who: entry.byAdmin ? `by ${entry.by || "an admin"}` : "by the seller",
  };
}
