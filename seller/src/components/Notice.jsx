import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faCircleExclamation, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import styles from "./notice.module.css";

const ICON = { error: faCircleExclamation, ok: faCircleCheck, info: faCircleInfo };

/**
 * A message in a box with an icon, for something the seller must notice: what went wrong and what to do about it, or that a change was saved.
 * tone "error" is announced at once (role alert); "ok" and "info" are announced politely (role status).
 */
export default function Notice({ tone = "info", children, className = "" }) {
  return (
    <div className={`${styles.noticeBox} ${className}`} data-tone={tone} role={tone === "error" ? "alert" : "status"}>
      <FontAwesomeIcon icon={ICON[tone] ?? faCircleInfo} className={styles.noticeIcon} aria-hidden="true" />
      <div className={styles.noticeBody}>{children}</div>
    </div>
  );
}
