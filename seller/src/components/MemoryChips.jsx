import { useId } from "react";
import { recall } from "../lib/shopMemory.js";
import styles from "./addHelpers.module.css";

/** One-tap chips of what this shop used last for a type: brand, warranty or condition. */
export default function MemoryChips({ typeId, field, label, current, onPick }) {
  const id = useId();
  const values = recall(typeId, field).filter((v) => v.toLowerCase() !== String(current ?? "").trim().toLowerCase());
  if (values.length === 0) return null;
  return (
    <div className={styles.chips} role="group" aria-labelledby={id}>
      <span id={id} className={styles.label}>Last {label}:</span>
      {values.map((v) => <button key={v} type="button" className={styles.chip} onClick={() => onPick(v)}>{v}</button>)}
    </div>
  );
}
