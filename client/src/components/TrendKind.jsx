import styles from "./TrendKind.module.css";

const KINDS = { store: "Store", flash: "Flash sale", category: "Category", product: "Product" };

// What a trending word turned out to be. Unknown (the live fallback does not say) shows nothing.
export function TrendKind({ kind }) {
  return KINDS[kind] ? <span className={styles.kind} data-kind={kind}>{KINDS[kind]}</span> : null;
}
