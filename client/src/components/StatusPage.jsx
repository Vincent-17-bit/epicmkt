import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Container } from "@epicmkt/ui";
import PageBreadcrumbs from "./PageBreadcrumbs.jsx";
import styles from "./StatusPage.module.css";

export default function StatusPage({ icon, title, message, breadcrumbs = false, children }) {
  return (
    <Container className={styles.page}>
      {breadcrumbs && <PageBreadcrumbs />}
      <span className={styles.badge}>
        <FontAwesomeIcon icon={icon} />
      </span>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.message}>{message}</p>
      <div className={styles.actions}>{children}</div>
    </Container>
  );
}
