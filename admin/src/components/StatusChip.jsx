import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBan, faBell, faCircleCheck, faClock, faEyeSlash, faFlag, faPause, faTrash } from "@fortawesome/free-solid-svg-icons";

export const STATE_META = {
  live: { label: "Live", icon: faCircleCheck, tone: "live" },
  expiring: { label: "Expiring soon", icon: faBell, tone: "tint" },
  grace: { label: "In grace", icon: faClock, tone: "tint" },
  expired: { label: "Expired", icon: faBan, tone: "black" },
  suspended: { label: "Suspended", icon: faBan, tone: "black" },
  paused: { label: "Paused", icon: faPause, tone: "neutral" },
  unlisted: { label: "Unlisted", icon: faEyeSlash, tone: "neutral" },
  deleted: { label: "Deleted", icon: faTrash, tone: "neutral" },
};

export default function StatusChip({ state }) {
  const meta = STATE_META[state];
  return (
    <span className={`chip chip--${meta.tone}`}>
      <FontAwesomeIcon icon={meta.icon} />
      {meta.label}
    </span>
  );
}

export function FlagChip({ count }) {
  return (
    <span className="chip chip--danger">
      <FontAwesomeIcon icon={faFlag} />
      {count} {count === 1 ? "flag" : "flags"}
    </span>
  );
}
