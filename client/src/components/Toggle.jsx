import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
import styles from "./FilterPanel.module.css";

export default function Toggle({ checked, onChange, children }) {
  return (
    <label className={styles.toggle}>
      <input type="checkbox" className={styles.native} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={styles.box}>
        <FontAwesomeIcon icon={faCheck} className={styles.tick} />
      </span>
      {children}
    </label>
  );
}
