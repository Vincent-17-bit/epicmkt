import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faStar, faCircleCheck } from "@fortawesome/free-solid-svg-icons";
import styles from "./Badges.module.css";

export function FeaturedBadge() {
  return (
    <span className={styles.featured}>
      <FontAwesomeIcon icon={faStar} className={styles.star} />
      Featured
    </span>
  );
}

export function VerifiedBadge() {
  return (
    <span className={styles.verified}>
      <FontAwesomeIcon icon={faCircleCheck} />
      Verified
    </span>
  );
}
