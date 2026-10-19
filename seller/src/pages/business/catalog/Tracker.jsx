import { TRACKER } from "@epicmkt/shared";
import styles from "./catalog.module.css";

export default function Tracker({ stats, activeKey, onPick }) {
  return (
    <ul className={styles.tracker} aria-label="Item counts">
      {TRACKER.map((t) => (
        <li key={t.key}>
          <button type="button" className={styles.tile} aria-pressed={activeKey === t.key} onClick={() => onPick(t.key)} data-testid={`tile-${t.key}`}>
            <span className={styles.tileCount}>{stats[t.key] ?? 0}</span>
            <span className={styles.tileLabel}>{t.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
