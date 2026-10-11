import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { activeChips, removeChip } from "@epicmkt/shared";
import styles from "./listings.module.css";

export default function Chips({ view, count, total, onChange, onClear }) {
  const chips = activeChips(view);
  if (chips.length === 0) return null;
  return (
    <div className={styles.chips}>
      <ul className={styles.chipList} aria-label="Active filters">
        {chips.map((chip) => (
          <li key={`${chip.key}:${chip.value ?? ""}`}>
            <button type="button" className={styles.chip} onClick={() => onChange(removeChip(view, chip))} aria-label={`Remove filter ${chip.label}`}>
              {chip.label}
              <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <p className={styles.count} role="status" data-testid="result-count">
        {count} of {total} {total === 1 ? "item" : "items"}
      </p>
      <button type="button" className={styles.linkBtn} onClick={onClear}>Clear all</button>
    </div>
  );
}
