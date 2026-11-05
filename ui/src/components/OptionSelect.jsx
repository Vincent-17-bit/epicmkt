import { useId } from "react";
import styles from "./OptionSelect.module.css";

// A long list of choices (more than eight sizes, say) as a native dropdown: the phone's own picker, labelled, and keyboard and
// screen-reader friendly for free. Unavailable choices stay in the list, marked in words, because a dashed border cannot be drawn in one.
//   items   [{ id, label, unavailable, suffix }]; `suffix` is extra text after the label (a price, "Currently unavailable")
export default function OptionSelect({ label, value, items, onChange, id, className = "" }) {
  const auto = useId();
  const selectId = id ?? `opt-${auto}`;
  return (
    <div className={`${styles.wrap} ${className}`}>
      <label htmlFor={selectId} className={styles.label}>{label}</label>
      <select id={selectId} className={styles.select} value={value} onChange={(e) => onChange?.(e.target.value)}>
        {items.map((item) => (
          <option key={item.id} value={item.id} data-unavailable={item.unavailable ? "" : undefined}>
            {item.label}{item.suffix ? ` (${item.suffix})` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
