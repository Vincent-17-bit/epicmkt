import styles from "./ViewAsFrame.module.css";

export default function ViewAsFrame({ device = "mobile", notice = "Preview only", children }) {
  return (
    <section className={`${styles.frame} ${styles[device]}`} data-device={device} aria-label="Customer view">
      {notice && (
        <p className={styles.notice} role="note">
          {notice}
        </p>
      )}
      <div className={styles.screen}>{children}</div>
    </section>
  );
}
