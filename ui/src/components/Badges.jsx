import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faStore } from "@fortawesome/free-solid-svg-icons";
import styles from "./Badges.module.css";

export function FeaturedBadge() {
  return (
    <span className={styles.featured}>
      <span className={styles.chip} aria-hidden="true">
        <FontAwesomeIcon icon={faStore} />
      </span>
      Featured
    </span>
  );
}

export function VerifiedBadge() {
  return (
    <span className={styles.verified}>
      <FontAwesomeIcon icon={faCircleCheck} className={styles.tick} />
      Verified
    </span>
  );
}
