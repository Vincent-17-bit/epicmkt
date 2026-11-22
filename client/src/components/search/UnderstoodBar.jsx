import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWandMagicSparkles, faXmark } from "@fortawesome/free-solid-svg-icons";
import styles from "./UnderstoodBar.module.css";

// What the search read out of the words typed ("under 20k" became a price limit, "in Kisumu" a place), shown as chips the shopper can
// remove with one tap, plus the honest notes: a spelling that was fixed, a part of the request that had to be loosened to find anything.
// `onQuery` receives the query as it reads without that piece.
export default function UnderstoodBar({ understood, onQuery }) {
  if (!understood) return null;
  const { chips = [], relaxed = [], partial = false } = understood;
  if (!chips.length && !relaxed.length && !partial) return null;
  const missing = relaxed.filter((r) => r.id === "missing-place");
  const dropped = relaxed.filter((r) => r.id !== "missing-place");
  return (
    <section className={styles.bar} aria-label="How we read your search">
      {chips.length > 0 && (
        <div className={styles.row}>
          <span className={styles.lead}>
            <FontAwesomeIcon icon={faWandMagicSparkles} aria-hidden="true" /> We read
          </span>
          <ul className={styles.chips}>
            {chips.map((c) => (
              <li key={`${c.id}-${c.label}`}>
                <button type="button" className={styles.chip} data-applied={c.applied === false ? "no" : undefined} onClick={() => onQuery(c.without)} aria-label={`Remove “${c.label}” from the search${c.applied === false ? " (not applied)" : ""}`}>
                  {c.label} <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {missing.length > 0 && (
        <p className={styles.note} role="status">
          We have {missing.map((r) => r.label).join(" or ")}, so this shows every area.
        </p>
      )}
      {dropped.length > 0 && (
        <p className={styles.note} role="status">
          Nothing matched all of that, so we left out {dropped.map((r) => r.label).join(" and ")}.
        </p>
      )}
      {partial && (
        <p className={styles.note} role="status">
          Nothing had every word, so these match most of them.
        </p>
      )}
    </section>
  );
}
