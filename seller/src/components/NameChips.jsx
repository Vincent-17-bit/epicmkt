import { useId } from "react";
import { nameChips } from "../lib/nameParse.js";
import styles from "./addHelpers.module.css";

/** "We found" chips read from the name. Nothing is saved until the seller taps one. `has(row)` says if a row is already answered. */
export default function NameChips({ name, rows, has, onAccept }) {
  const id = useId();
  const chips = nameChips(name, rows, has);
  if (chips.length === 0) return null;
  return (
    <div className={styles.chips} role="group" aria-labelledby={id}>
      <span id={id} className={styles.label}>We found in the name:</span>
      {chips.map((c) => (
        <button key={c.row.key} type="button" className={styles.chip} onClick={() => onAccept(c.row, c.value)} aria-label={`Use ${c.value} for ${c.row.label}`}>
          {c.value} <span aria-hidden="true">→ {c.row.label}</span>
        </button>
      ))}
    </div>
  );
}
