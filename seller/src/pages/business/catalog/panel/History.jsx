import { History as ItemHistory } from "../ItemInsights.jsx";
import styles from "./panel.module.css";

export default function History({ item }) {
  return (
    <section className={styles.stack} aria-labelledby="panel-history">
      <h3 id="panel-history" className={styles.h3}>What changed</h3>
      <ItemHistory itemId={item.id} />
    </section>
  );
}
