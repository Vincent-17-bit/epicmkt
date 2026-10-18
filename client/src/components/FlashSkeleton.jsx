import Skeleton from "./Skeleton.jsx";
import styles from "./FlashSaleCard.module.css";

// Renders with the real card's classes and slot heights, so swapping in the
// loaded card causes no layout shift at any width.
export default function FlashSkeleton() {
  return (
    <div className={styles.card} data-card-skeleton="" data-skeleton="" aria-hidden="true">
      <span className={styles.media}>
        <Skeleton height="100%" radius="0" className={styles.fill} />
      </span>
      <span className={styles.fuse} style={{ height: 3 }} />
      <span className={styles.band}>
        <Skeleton width="45%" height="16px" radius="4px" />
        <Skeleton width="108px" height="34px" radius="6px" />
      </span>
      <span className={styles.body}>
        <span className={styles.name} style={{ display: "grid", alignContent: "start", gap: 4 }}>
          <Skeleton height="14px" radius="4px" />
          <Skeleton width="70%" height="14px" radius="4px" />
        </span>
        <span className={styles.headlineSlot} />
        <span className={styles.store}>
          <span className={styles.storeMain}>
            <Skeleton width="20px" height="20px" radius="50%" />
            <Skeleton width="55%" height="12px" radius="4px" />
          </span>
          <span className={styles.meta}>
            <Skeleton width="60px" height="12px" radius="4px" />
          </span>
        </span>
        <span className={styles.prices}>
          <Skeleton width="45%" height="20px" radius="4px" />
        </span>
        <span className={styles.tags} />
      </span>
      <span className={styles.cta} style={{ background: "none" }}>
        <Skeleton height="44px" radius="var(--radius-sm)" />
      </span>
    </div>
  );
}
