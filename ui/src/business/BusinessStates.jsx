import { faRotateRight } from "@fortawesome/free-solid-svg-icons";
import Button from "../components/Button.jsx";
import Container from "../components/Container.jsx";
import Skeleton from "../components/Skeleton.jsx";
import styles from "./BusinessPage.module.css";

export function BusinessPageError({ onRetry }) {
  return (
    <Container className={styles.state} role="alert">
      <p>We could not load this business.</p>
      <Button icon={faRotateRight} onClick={onRetry}>
        Try again
      </Button>
    </Container>
  );
}

export function BusinessPageSkeleton({ breadcrumbs }) {
  return (
    <div aria-busy="true">
      <Container className={styles.crumbRow}>{breadcrumbs}</Container>
      <Skeleton height="clamp(10rem, 32vw, 18rem)" radius="0" />
      <Container className={styles.page}>
        <Skeleton height="1.5rem" width="60%" />
        <Skeleton height="1rem" width="80%" />
        <Skeleton height="44px" radius="var(--radius-pill)" />
      </Container>
    </div>
  );
}
