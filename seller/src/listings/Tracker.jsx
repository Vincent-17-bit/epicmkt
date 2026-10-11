import { TRACKER, statsToTracker, trackerKeyOf, trackerView } from "@epicmkt/shared";
import styles from "./listings.module.css";

export default function Tracker({ stats, view, onPick }) {
  const counts = statsToTracker(stats);
  const active = trackerKeyOf(view);
  return (
    <ul className={styles.tracker} aria-label="Catalog counts">
      {TRACKER.map((tile) => (
        <li key={tile.key}>
          <button type="button" className={styles.tile} aria-pressed={active === tile.key} onClick={() => onPick({ ...trackerView(tile.key), sort: view.sort })} data-attention={["hidden_by_admin", "reported", "flagged"].includes(tile.key) && counts[tile.key] > 0 ? "true" : undefined}>
            <strong>{counts[tile.key]}</strong>
            <span>{tile.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
