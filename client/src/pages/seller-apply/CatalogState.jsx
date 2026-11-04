import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { Button, Skeleton } from "@epicmkt/ui";
import styles from "./steps.module.css";

export function CatalogLoading({ rows = 4 }) {
  return (
    <div className={styles.skeletons} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height="72px" radius="12px" />
      ))}
    </div>
  );
}

export function CatalogError({ onRetry }) {
  return (
    <div className={styles.errorCard} role="alert">
      <FontAwesomeIcon icon={faTriangleExclamation} />
      <div>
        <strong>We could not load this right now.</strong>
        <p>Check your connection and try again. We never show prices we cannot confirm.</p>
      </div>
      <Button variant="secondary" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
