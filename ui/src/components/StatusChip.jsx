import styles from "./StatusChip.module.css";

export default function StatusChip({ open, className = "", children }) {
  return <span className={`${open ? styles.open : styles.closed} ${className}`}>{children}</span>;
}
