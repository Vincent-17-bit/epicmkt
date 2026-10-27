import styles from "./BusinessPage.module.css";

export default function BusinessSection({ title, children, id, action, wide = false }) {
  return (
    <section className={wide ? `${styles.section} ${styles.wide}` : styles.section} aria-labelledby={id}>
      {action ? (
        <div className={styles.sectionHead}>
          <h2 id={id} className={styles.h2}>
            {title}
          </h2>
          {action}
        </div>
      ) : (
        <h2 id={id} className={styles.h2}>
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
