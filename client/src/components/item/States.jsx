import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBoxOpen, faRotateRight, faStore } from "@fortawesome/free-solid-svg-icons";
import { Skeleton, Button } from "@epicmkt/ui";
import { t } from "../../i18n/index.js";
import styles from "../ItemDetail.module.css";

// What the body shows when there is no item to show: the request failed, the item is gone, or it is still loading.

export function LoadFailed({ ctx }) {
  return (
    <div className={styles.state} role="alert">
      <p>{t("item.loadFailed")}</p>
      <Button variant="secondary" icon={faRotateRight} onClick={ctx.onRetry}>
        {t("item.retry")}
      </Button>
    </div>
  );
}

export function Gone({ ctx }) {
  const { business, Heading, titleRef, onVisit, selective } = ctx;
  return (
    <>
      <div className={styles.state}>
        <FontAwesomeIcon icon={faBoxOpen} className={styles.goneIcon} aria-hidden="true" />
        <Heading id="item-title" ref={titleRef} tabIndex={-1} className={styles.title}>
          {t("item.gone")}
        </Heading>
        <p className={styles.description}>{t("item.goneHint")}</p>
        <Link to={`/b/${business.slug}`} className={`${styles.outline} ${styles.single}`} onClick={onVisit("gone")}>
          <FontAwesomeIcon icon={faStore} className={styles.icon} aria-hidden="true" />
          <span>{t("item.visitStore")}</span>
        </Link>
      </div>
      {selective}
    </>
  );
}

export function Loading({ ctx }) {
  return (
    <div aria-busy="true">
      <Skeleton height="auto" radius="0" className={styles.skeletonMedia} />
      <div className={styles.skeletonThumbs}>
        {[0, 1, 2].map((n) => (
          <Skeleton key={n} width="56px" height="56px" radius="var(--radius-sm)" />
        ))}
      </div>
      <div className={styles.info}>
        <Skeleton height="1.75rem" width="70%" />
        <Skeleton height="1.5rem" width="35%" />
        <Skeleton height="1rem" width="90%" />
        <Skeleton height="1rem" width="60%" />
      </div>
      <div className={styles.skeletonSpecs}>
        {[0, 1, 2].map((n) => (
          <Skeleton key={n} height="52px" radius="var(--radius-sm)" />
        ))}
      </div>
      {ctx.selective}
    </div>
  );
}
