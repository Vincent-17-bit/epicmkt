import mark from "../assets/logo-mark.png";
import styles from "./Logo.module.css";

export function LogoMark({ size = 36 }) {
  return <img src={mark} width={size} height={size} alt="" aria-hidden="true" className={styles.mark} decoding="async" />;
}

export default function Logo({ tagline = "", size = 36, children }) {
  return (
    <span className={styles.logo}>
      <LogoMark size={size} />
      <span className={styles.text}>
        <span className={styles.word}>EpicMKT</span>
        {children}
        {tagline && <span className={styles.tagline}>{tagline}</span>}
      </span>
    </span>
  );
}
