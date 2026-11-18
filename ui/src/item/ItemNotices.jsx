import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleExclamation, faCircleInfo, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { cleanNotices } from "@epicmkt/shared";
import styles from "./ItemNotices.module.css";

const ICON = { info: faCircleInfo, caution: faTriangleExclamation, warning: faCircleExclamation };
const SPOKEN = { info: "Note", caution: "Check before buying", warning: "Warning" };

// Notes the seller wants every buyer to read (migration 0138), right under "About this item": product voltage, age limits, storage,
// installation. Each is a box with a coloured edge and an icon; the tone is also said in words for screen readers, never colour alone.
export default function ItemNotices({ notices }) {
  const list = cleanNotices(notices);
  if (!list.length) return null;
  return (
    <div className={styles.list} data-notices="">
      {list.map((n, i) => (
        <section key={`${i}-${n.title}`} className={styles.notice} data-tone={n.tone} aria-label={`${SPOKEN[n.tone]}: ${n.title || n.text}`}>
          <FontAwesomeIcon icon={ICON[n.tone]} className={styles.icon} aria-hidden="true" />
          <div className={styles.body}>
            {n.title && <h4 className={styles.title}>{n.title}</h4>}
            {n.text && <p className={styles.text}>{n.text}</p>}
          </div>
        </section>
      ))}
    </div>
  );
}
