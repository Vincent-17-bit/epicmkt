import { formatWhen, REASON_LABELS } from "@epicmkt/shared/hours";
import { StatusIcon } from "../../components/ui/index.js";
import ClosureActions from "./ClosureActions.jsx";
import styles from "./hours.module.css";

const TONE = { open: "tOpen", closing_soon: "tClosing", closed: "tClosed", closed_temporarily: "tClosed", opens_later: "tLater" };

export default function StatusCard({ status, now, ...handlers }) {
  const closedByOverride = status.override?.type === "close" && !status.isOpen;
  const openLate = status.override?.type === "open" && status.isOpen && status.source === "override";
  const until = status.override ? Date.parse(status.override.until) : null;

  return (
    <div className={styles.statusCard} data-state={status.state}>
      <div className={`${styles.statusHead} ${styles[TONE[status.state]]}`}>
        <StatusIcon name={status.state} size={28} />
        <span className={styles.statusLabel} data-testid="status-label">
          {status.label}
        </span>
      </div>
      <p className={styles.statusDetail} data-testid="status-detail">
        {status.detail}
      </p>
      {status.reason && closedByOverride && <p className={styles.statusMeta}>Reason: {REASON_LABELS[status.reason] ?? status.reason}</p>}
      {status.message && <p className={styles.statusMeta}>“{status.message}”</p>}
      {openLate && until != null && <p className={styles.statusMeta}>Open late until {formatWhen(until, now)}</p>}
      <ClosureActions status={status} now={now} {...handlers} />
    </div>
  );
}
