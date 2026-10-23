import styles from "./BusinessPage.module.css";

export default function BusinessSection({ title, children, id, action }) {
  return (
    <section className={styles.section} aria-labelledby={id}>
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
