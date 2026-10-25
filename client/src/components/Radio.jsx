import styles from "./FilterPanel.module.css";

export default function Radio({ name, checked, onChange, children }) {
  return (
    <label className={styles.toggle}>
      <input type="radio" name={name} className={styles.native} checked={checked} onChange={onChange} />
      <span className={styles.round}>
        <span className={styles.dot} />
      </span>
      {children}
    </label>
  );
}
