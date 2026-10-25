import { businessDay } from "@epicmkt/shared";
import { normalizePhone } from "../../shared/validators.js";

/** While typing: let digits, plus, spaces and brackets through, nothing else. */
export const phoneMask = (raw) => String(raw ?? "").replace(/[^\d+\s()-]/g, "").slice(0, 20);

/** On leaving the box: a Kenyan number is shown as 0712 345 678. Anything else is left as typed. */
export function phoneDisplay(raw) {
  const v = String(raw ?? "").trim();
  const n = normalizePhone(v);
  if (n && n.startsWith("+254")) {
    const d = n.slice(4);
    return `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  }
  return v;
}

/** KRA PIN: letters and digits, capitals, 11 characters. */
export const pinMask = (raw) => String(raw ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 11);

/** Today as a calendar day in the business zone (Nairobi), "YYYY-MM-DD". */
export const todayISO = () => businessDay(new Date());
