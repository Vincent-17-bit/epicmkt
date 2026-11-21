import styles from "./TrendTabs.module.css";

const KINDS = { store: "Store", flash: "Flash sale", category: "Category", product: "Product" };

// "Popular this week" / "Rising now". With nothing rising there is nothing to switch to, so it is a plain caption.
export default function TrendTabs({ tab, onChange, hasRising }) {
  if (!hasRising) return <p className={styles.caption}>Popular this week</p>;
  return (
    <div className={styles.tabs} role="group" aria-label="Trending view">
      <button type="button" className={styles.tab} aria-pressed={tab === "popular"} onClick={() => onChange("popular")}>
        Popular this week
      </button>
      <button type="button" className={styles.tab} aria-pressed={tab === "rising"} onClick={() => onChange("rising")}>
        Rising now
      </button>
    </div>
  );
}

// What a trending word turned out to be. Unknown (the live fallback does not say) shows nothing.
export function TrendKind({ kind }) {
  return KINDS[kind] ? <span className={styles.kind} data-kind={kind}>{KINDS[kind]}</span> : null;
}

// A short line under the tabs ("Trending in Kisumu", or why the national list is shown).
export function TrendNote({ children }) {
  return <p className={styles.note}>{children}</p>;
}
