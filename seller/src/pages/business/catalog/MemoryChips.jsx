import styles from "./AddItem.module.css";

const LABEL = { brand: "Brand", warranty: "Warranty", condition: "Condition" };

export default function MemoryChips({ chips, onPick }) {
  if (!chips.length) return null;
  return (
    <div className={styles.row} role="group" aria-label="Used last time">
      {chips.map((c) => (
        <button key={c.field} type="button" className={styles.chip} onClick={() => onPick(c.field, c.value)}>
          {LABEL[c.field]}: {c.value}
        </button>
      ))}
    </div>
  );
}
