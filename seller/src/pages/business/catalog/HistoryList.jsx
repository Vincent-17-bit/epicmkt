import { formatDateTime } from "@epicmkt/shared";
import { WHO, groupHistory } from "./historyView.js";
import styles from "../performance.module.css";

function Change({ c }) {
  return (
    <li className={styles.change}>
      <div className={styles.changeHead}>
        <strong>{c.label}</strong>
        <span className={`${styles.verb} ${styles[`verb${c.verb}`]}`}>{c.verb}</span>
      </div>
      {c.kind === "list" ? (
        <ul className={styles.lines}>
          {c.removed.map((l) => <li key={`r${l}`} className={styles.lineOut}><span className={styles.sr}>Removed: </span>{l}</li>)}
          {c.added.map((l) => <li key={`a${l}`} className={styles.lineIn}><span className={styles.sr}>Added: </span>{l}</li>)}
        </ul>
      ) : (
        <p className={`${styles.diff} ${Math.max(c.before?.length ?? 0, c.after?.length ?? 0) > 40 ? styles.diffLong : ""}`}>
          {c.before !== null && <span className={styles.was}><span className={styles.sr}>Was: </span>{c.before}</span>}
          {c.before !== null && c.after !== null && <span className={styles.arrow} aria-hidden="true">{Math.max(c.before.length, c.after.length) > 40 ? "↓" : "→"}</span>}
          {c.after !== null ? <span className={styles.now}><span className={styles.sr}>Now: </span>{c.after}</span> : <span className={styles.none}>Cleared</span>}
        </p>
      )}
    </li>
  );
}

export default function HistoryList({ entries }) {
  return (
    <div className={styles.groups}>
      {groupHistory(entries).map((g) => (
        <section key={g.key} className={styles.group} aria-label={`${g.changes.length} ${g.changes.length === 1 ? "change" : "changes"} by ${WHO[g.actor] ?? g.actor}`}>
          <header className={styles.groupHead}>
            <strong>{WHO[g.actor] ?? g.actor}</strong>
            <time dateTime={g.at}>{formatDateTime(g.at)}</time>
          </header>
          <ul className={styles.changes}>{g.changes.map((c) => <Change key={c.id} c={c} />)}</ul>
        </section>
      ))}
    </div>
  );
}
