import {
  faCircleCheck,
  faCircleXmark,
  faHourglassHalf,
  faMagnifyingGlass,
  faPaperPlane,
  faPenToSquare,
  faStore
} from "@fortawesome/free-solid-svg-icons";

export const STATUS_META = {
  submitted: { label: "Submitted", icon: faPaperPlane, text: "We received your application. We will review it and notify you by SMS." },
  under_review: { label: "Under review", icon: faMagnifyingGlass, text: "We are checking your application. It is locked while we review it, and we will notify you by SMS." },
  changes_requested: { label: "Changes requested", icon: faPenToSquare, text: "We need a few corrections before we can approve your application." },
  approved: { label: "Approved, awaiting payment", icon: faCircleCheck, text: "Your application is approved. Pay the monthly fee by M-Pesa to go live." },
  payment_confirming: { label: "Payment under confirmation", icon: faHourglassHalf, text: "We are confirming your M-Pesa payment. We will notify you by SMS." },
  activated: { label: "Active", icon: faStore, text: "Your login details have been sent to your phone by SMS or WhatsApp. You will change the password on first login." },
  rejected: { label: "Not approved", icon: faCircleXmark, text: "We could not approve this application." }
};

export const TIMELINE = [
  ["submitted", "Submitted"],
  ["under_review", "Under review"],
  ["changes_requested", "Changes requested"],
  ["approved", "Approved"],
  ["payment_confirming", "Payment"],
  ["activated", "Active"]
];

export function timelineSteps(app) {
  if (app.status === "rejected") return [["submitted", "Submitted"], ["rejected", "Not approved"]];
  const had = app.events?.some((e) => e.type === "changes_requested");
  return TIMELINE.filter(([key]) => key !== "changes_requested" || had || app.status === "changes_requested");
}

export const DOC_LABELS = {
  owner_id_front: "ID front or passport page",
  owner_id_back: "National ID, back",
  sbp: "Single Business Permit",
  signboard: "Signboard or shop-front photo",
  br_cert: "Business registration certificate",
  kra_pin_cert: "KRA PIN certificate"
};

export const ID_TYPE = { national_id: "National ID", passport: "Passport" };
export const REG_TYPE = { sole_proprietor: "Sole proprietor", partnership: "Partnership", limited_company: "Limited company" };

export function show(value) {
  if (value === undefined || value === null || value === "") return "Not given";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return `${value.from ?? ""} to ${value.to ?? ""}`;
  return String(value);
}

export const sizeText = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
