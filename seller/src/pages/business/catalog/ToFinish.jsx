import { Link } from "react-router-dom";
import styles from "./AddItem.module.css";

export default function ToFinish({ drafts, from = "" }) {
  if (!drafts.length) return null;
  return (
    <section className={styles.block} aria-labelledby="to-finish">
      <h2 id="to-finish" className={styles.heading}>{drafts.length === 1 ? "1 item to finish" : `${drafts.length} items to finish`}</h2>
      <ul className={styles.list}>
        {drafts.map((d) => (
          <li key={d.id} className={styles.entry}>
            <Link className={styles.entryLink} to={`/business/catalog/${d.id}/edit`} state={{ from }}>
              <span className={styles.entryName}>{d.name}</span>
              <span className={styles.entryNote}>Missing: {d.missing.join(", ")}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
