// Small display helpers shared by the detail tabs.
import { fmtDate, fmtDateTime, fmtKes } from "../../lib/peek.js";

export { fmtDate, fmtDateTime, fmtKes };

export const DAY_ORDER = [["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]];

export const dayHours = (slot) => (Array.isArray(slot) && slot.length === 2 ? `${slot[0]} to ${slot[1]}` : "Closed");

export const describeException = (e) =>
  e?.kind === "closed" ? "Closed all day" : `Special hours: ${(e?.intervals ?? []).map(([a, b]) => `${a} to ${b}`).join(", ") || "—"}`;

export const bytes = (n) => (Number.isFinite(n) ? (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`) : "—");

const SLOTS = { id_front: "ID (front)", id_back: "ID (back)", selfie: "Selfie with ID", business_permit: "Business permit", kra_pin: "KRA PIN certificate", premises: "Premises photo" };
export const slotLabel = (key) => SLOTS[key] ?? String(key ?? "").replace(/_/g, " ");

export const humanAction = (action) => String(action ?? "").replace(/^business\./, "").replace(/[._]/g, " ");
