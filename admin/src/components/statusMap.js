import {
  faBan,
  faCalendarXmark,
  faCheck,
  faCircleCheck,
  faCircleQuestion,
  faCircleXmark,
  faClock,
  faCloudArrowUp,
  faHourglassHalf,
  faMagnifyingGlass,
  faPaperPlane,
  faPause,
  faPenToSquare,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";

// Every status gets a tone, an icon and a label, so meaning never depends on colour alone.
// Keys are the raw database values (see resources.js).
export const STATUS_MAP = {
  // applications
  uploading: { tone: "neutral", icon: faCloudArrowUp, label: "Uploading" },
  submitted: { tone: "info", icon: faPaperPlane, label: "Submitted" },
  under_review: { tone: "info", icon: faMagnifyingGlass, label: "Under review" },
  changes_requested: { tone: "warning", icon: faPenToSquare, label: "Changes requested" },
  approved: { tone: "success", icon: faCheck, label: "Approved" },
  payment_confirming: { tone: "warning", icon: faHourglassHalf, label: "Payment confirming" },
  activated: { tone: "success", icon: faCircleCheck, label: "Activated" },
  rejected: { tone: "danger", icon: faCircleXmark, label: "Rejected" },
  // businesses
  pending: { tone: "warning", icon: faClock, label: "Pending" },
  live: { tone: "success", icon: faCircleCheck, label: "Live" },
  paused: { tone: "neutral", icon: faPause, label: "Paused" },
  suspended: { tone: "danger", icon: faBan, label: "Suspended" },
  expired: { tone: "danger", icon: faCalendarXmark, label: "Expired" },
  deleted: { tone: "neutral", icon: faTrash, label: "Deleted" },
  // payments and flags raised by the app
  confirmed: { tone: "success", icon: faCircleCheck, label: "Confirmed" },
  expiring: { tone: "warning", icon: faHourglassHalf, label: "Expiring soon" },
};

const sentence = (s) => {
  const text = String(s ?? "").replace(/[_-]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Unknown";
};

export function statusMeta(status) {
  const known = Object.prototype.hasOwnProperty.call(STATUS_MAP, status) ? STATUS_MAP[status] : null;
  return known ?? { tone: "neutral", icon: faCircleQuestion, label: sentence(status) };
}
