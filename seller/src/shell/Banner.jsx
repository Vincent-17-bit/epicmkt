import { Link } from "react-router-dom";
import styles from "./shell.module.css";

export default function Banner({ banner, onResume, busy }) {
  if (!banner) return null;
  const { action } = banner;
  return (
    <div className={`${styles.banner} ${banner.tone === "urgent" ? styles.bannerUrgent : styles.bannerNotice}`} role={banner.tone === "urgent" ? "alert" : "status"} data-kind={banner.kind}>
      <div className={styles.bannerText}>
        <strong>{banner.title}</strong>
        <span>{banner.text}</span>
      </div>
      {action.resume ? (
        <button type="button" className={styles.bannerBtn} onClick={onResume} disabled={busy}>
          {action.label}
        </button>
      ) : (
        <Link to={action.to} className={styles.bannerBtn}>
          {action.label}
        </Link>
      )}
    </div>
  );
}
