import { Link } from "react-router-dom";
import styles from "./dashboard/dashboard.module.css";

export default function Placeholder({ title, text, back = true }) {
  return (
    <section className={styles.card}>
      <h1 className={styles.headline}>{title}</h1>
      <p className={styles.muted}>{text}</p>
      {back && <Link to="/" className={styles.linkBtn}>Back to Home</Link>}
    </section>
  );
}
