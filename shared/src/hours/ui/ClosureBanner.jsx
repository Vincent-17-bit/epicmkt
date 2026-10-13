import StatusIcon from "./StatusIcon.jsx";
import styles from "./hoursUi.module.css";

const REASON_PHRASE = {
  lunch: "On a lunch break",
  restock: "Restocking",
  power: "Power outage",
  emergency: "Closed due to an emergency",
  other: ""
};

export default function ClosureBanner({ status, className = "" }) {
  const override = status?.override;
  if (!override) return null;
  const closed = override.type === "close" && !status.isOpen;
  const openLate = override.type === "open" && status.isOpen && status.source === "override";
  if (!closed && !openLate) return null;
  const phrase = closed ? REASON_PHRASE[override.reason] ?? "" : "";
  return (
    <section className={`${styles.banner} ${closed ? styles.bannerClosed : styles.bannerOpen} ${className}`} role="status" data-testid="closure-banner">
      <StatusIcon name={closed ? "closed_temporarily" : "open"} size={24} className={styles.bannerIcon} />
      <div className={styles.bannerBody}>
        <p className={styles.bannerTitle}>{closed ? "Temporarily closed" : "Open late today"}</p>
        <p className={styles.bannerLine}>{status.detail}</p>
        {phrase && <p className={styles.bannerReason}>{phrase}</p>}
        {override.message && <p className={styles.bannerMessage}>{override.message}</p>}
      </div>
    </section>
  );
}
