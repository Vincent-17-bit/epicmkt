import { Link } from "react-router-dom";
import { toFinishList } from "./toFinish.js";
import styles from "./AddItem.module.css";

/** "3 items to finish": every draft with what it is missing, each a link into the editor. */
export default function ToFinish({ items, types, from = "" }) {
  const list = toFinishList(items, types);
  if (list.length === 0) return null;
  return (
    <section className={styles.finish} aria-labelledby="to-finish-title" id="to-finish">
      <h2 id="to-finish-title" className={styles.h2}>{list.length === 1 ? "1 item to finish" : `${list.length} items to finish`}</h2>
      <ul className={styles.finishList}>
        {list.map(({ item, missing }) => (
          <li key={item.id}>
            <Link to={`/business/catalog/${item.id}/edit`} state={{ from, step: missing.some((m) => m === "A photo") ? "media" : "basics" }} className={styles.finishLink}>
              <span className={styles.finishName}>{item.name}</span>
              <span className={missing.length ? styles.missing : styles.ready}>{missing.length ? `Needs: ${missing.join(", ")}` : "Ready to publish"}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
