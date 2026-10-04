import { discountBadge } from "../lib/flash.js";
import styles from "./Starburst.module.css";

export default function Starburst({ discount, className = "" }) {
  const badge = discountBadge(discount);
  return (
    <span className={`${styles.burst} ${styles[badge.kind]} ${className}`}>
      <span className={styles.text}>{badge.text}</span>
    </span>
  );
}
