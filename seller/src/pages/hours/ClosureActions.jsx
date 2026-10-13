import { formatWhen } from "@epicmkt/shared/hours";
import { Button } from "../../components/ui/index.js";
import styles from "./hours.module.css";

export default function ClosureActions({ status, now, onCloseTemp, onOpenLate, onReopen, onExtend, onEndOpenLate }) {
  const closedByOverride = status.override?.type === "close" && !status.isOpen;
  const openLate = status.override?.type === "open" && status.isOpen && status.source === "override";
  const until = status.override ? Date.parse(status.override.until) : null;

  if (closedByOverride) {
    return (
      <div className={styles.closureActions}>
        <p className={styles.statusYou}>You are closed until {formatWhen(until, now)}</p>
        {status.nextChangeMs != null && status.nextChangeMs > until + 60000 && <p className={styles.hint}>After that your usual hours apply: {status.detail.toLowerCase()}.</p>}
        <div className={styles.actionRow}>
          <Button variant="primary" onClick={onReopen}>
            Reopen now
          </Button>
          <Button onClick={onExtend}>Extend</Button>
        </div>
      </div>
    );
  }
  if (status.isOpen) {
    return (
      <div className={styles.closureActions}>
        <div className={styles.actionRow}>
          <Button variant="primary" onClick={onCloseTemp}>
            Close temporarily
          </Button>
          {openLate && <Button onClick={onEndOpenLate}>End open late</Button>}
        </div>
      </div>
    );
  }
  return (
    <div className={styles.closureActions}>
      <div className={styles.actionRow}>
        <Button variant="primary" onClick={onOpenLate}>
          Open late
        </Button>
      </div>
    </div>
  );
}
