import { Link } from "react-router-dom";
import styles from "./auth.module.css";

export default function AuthFrame({ title, intro, children, footer }) {
  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <Link to="/login" className={styles.brand} aria-label="EpicMKT Business">
          <span className={styles.mark} aria-hidden="true">E</span>
          <span>EpicMKT Business</span>
        </Link>
        <h1 className={styles.title}>{title}</h1>
        {intro && <p className={styles.intro}>{intro}</p>}
        {children}
        {footer && <div className={styles.footer}>{footer}</div>}
      </main>
    </div>
  );
}
