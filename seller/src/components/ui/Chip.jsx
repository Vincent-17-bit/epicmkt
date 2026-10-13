import styles from "./Chip.module.css";

export default function Chip({ selected = false, disabled = false, onClick, children, className = "", ...rest }) {
  return (
    <button type="button" className={`${styles.chip} ${selected ? styles.selected : ""} ${className}`} aria-pressed={selected} disabled={disabled} onClick={onClick} {...rest}>
      {children}
    </button>
  );
}
