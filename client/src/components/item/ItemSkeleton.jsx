import Container from "../Container.jsx";
import Skeleton from "../Skeleton.jsx";
import styles from "./item.module.css";

export default function ItemSkeleton() {
  return (
    <div className={styles.page} aria-busy="true">
      <Container className={styles.crumbRow}>
        <Skeleton width="min(22rem, 70%)" height="1rem" />
      </Container>
      <Container className={styles.main}>
        <div className={`${styles.card} ${styles.buy}`}>
          <div className={styles.media}>
            <div className={styles.skeletonStage}>
              <Skeleton width="100%" height="100%" radius="var(--radius-card)" />
            </div>
          </div>
          <div className={styles.info}>
            <Skeleton height="1.75rem" width="85%" />
            <Skeleton height="1rem" width="55%" />
            <Skeleton height="2.25rem" width="40%" />
            <Skeleton height="1rem" width="30%" />
            <Skeleton height="44px" radius="var(--radius-pill)" />
          </div>
        </div>
        <div className={styles.card}>
          <Skeleton height="1.25rem" width="30%" />
          <Skeleton height="4rem" />
        </div>
      </Container>
    </div>
  );
}
