import { useState } from "react";
import styles from "./ViewAsFrame.module.css";

export default function ViewAsFrame({ device = "mobile", notice = "Preview only", children }) {
  const [screen, setScreen] = useState(null);

  return (
    <section className={`${styles.frame} ${styles[device]}`} data-device={device} aria-label="Customer view">
      {notice && (
        <p className={styles.notice} role="note">
          {notice}
        </p>
      )}
      <div ref={setScreen} className={styles.screen}>
        {typeof children === "function" ? children(screen) : children}
      </div>
    </section>
  );
}
