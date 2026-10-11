import { Link } from "react-router-dom";
import styles from "./listings.module.css";

export function NoItems({ onImport, importLocked }) {
  return (
    <section className={styles.empty} aria-labelledby="empty-title">
      <h2 id="empty-title">Add your first item</h2>
      <p>Customers find you through your items. Three quick steps get you started.</p>
      <ol className={styles.steps}>
        <li>Add an item with a name and price.</li>
        <li>Add a clear photo so it stands out.</li>
        <li>Check that it shows to customers.</li>
      </ol>
      <div className={styles.emptyActions}>
        <Link to="/catalog/items/new" className={styles.primaryBtn}>Add your first item</Link>
        <button type="button" className={styles.secondaryBtn} onClick={onImport}>{importLocked ? "Import from a sheet (Premium)" : "Import from a sheet"}</button>
      </div>
    </section>
  );
}

export function NoResults({ onClear }) {
  return (
    <section className={styles.empty} aria-labelledby="none-title">
      <h2 id="none-title">No items match</h2>
      <p>Nothing fits these filters. Clear them to see all your items again.</p>
      <button type="button" className={styles.primaryBtn} onClick={onClear}>Clear all filters</button>
    </section>
  );
}
