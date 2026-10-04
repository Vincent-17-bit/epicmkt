import Skeleton from "./Skeleton.jsx";
import styles from "./FlashSkeleton.module.css";

export default function FlashSkeleton() {
  return (
    <div className={styles.frame} aria-hidden="true">
      <Skeleton height="9.5rem" radius="12px 12px 0 0" />
      <div className={styles.band}>
        <Skeleton height="2.5rem" radius="8px" />
      </div>
      <div className={styles.body}>
        <Skeleton height="1rem" radius="6px" />
        <Skeleton height="0.75rem" width="70%" radius="6px" />
        <Skeleton height="1.5rem" width="45%" radius="6px" />
        <Skeleton height="3rem" radius="var(--radius-sm)" />
      </div>
    </div>
  );
}
