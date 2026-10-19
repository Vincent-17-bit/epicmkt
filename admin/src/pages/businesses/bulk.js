import {
  faBan,
  faCalendarPlus,
  faCircleCheck,
  faDownload,
  faEnvelope,
  faEyeSlash,
  faRotateLeft,
  faStar,
  faTriangleExclamation,
  faTag,
  faUserTie,
} from "@fortawesome/free-solid-svg-icons";

export const BULK = {
  suspend: { label: "Suspend", icon: faBan, dangerous: true, word: "SUSPEND", verb: () => "Suspended" },
  unsuspend: { label: "Unsuspend", icon: faCircleCheck, verb: () => "Unsuspended" },
  strike: { label: "Strike", icon: faTriangleExclamation, dangerous: true, word: "STRIKE", verb: () => "Gave a strike to" },
  unlist: { label: "Unlist", icon: faEyeSlash, dangerous: true, word: "UNLIST", verb: () => "Unlisted" },
  feature: { label: "Feature", icon: faStar, verb: (params) => (params.featured ? "Featured" : "Removed feature from") },
  extend: { label: "Extend days", icon: faCalendarPlus, dangerous: true, word: "EXTEND", verb: (params) => `Extended ${params.days}d for` },
  message: { label: "Message", icon: faEnvelope, verb: () => "Sent a message to" },
  tag: { label: "Tag", icon: faTag, verb: (params) => (params.mode === "remove" ? "Removed tag from" : "Tagged") },
  assign: { label: "Assign agent", icon: faUserTie, verb: (params) => (params.agent ? "Assigned agent to" : "Unassigned agent from") },
  export: { label: "Export CSV", confirm: "Export", icon: faDownload, verb: () => "Exported" },
  restore: { label: "Restore", icon: faRotateLeft, verb: () => "Restored" },
};

export const ACTIVE_ACTIONS = ["message", "suspend", "unsuspend", "strike", "unlist", "feature", "extend", "tag", "assign", "export"];
export const BIN_ACTIONS = ["restore", "export"];

export function summarize(action, params, result) {
  const noun = result.affected === 1 ? "business" : "businesses";
  const skipped = result.skipped ? `, ${result.skipped} skipped` : "";
  if (!result.affected) return `Nothing changed, ${result.skipped} skipped`;
  return `${BULK[action].verb(params)} ${result.affected} ${noun}${skipped}`;
}
