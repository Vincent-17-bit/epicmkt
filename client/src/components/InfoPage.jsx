import Container from "./Container.jsx";
import PageBreadcrumbs from "./PageBreadcrumbs.jsx";
import styles from "./InfoPage.module.css";

export default function InfoPage({ title, intro, children }) {
  return (
    <Container className={styles.page}>
      <PageBreadcrumbs />
      <div className={styles.column}>
        <h1 className={styles.title}>{title}</h1>
        {intro && <p className={styles.intro}>{intro}</p>}
        <div className={styles.body}>{children}</div>
      </div>
    </Container>
  );
}
