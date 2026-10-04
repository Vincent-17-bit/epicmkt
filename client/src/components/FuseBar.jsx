import { memo } from "react";
import { useServerNow } from "../hooks/useCountdown.js";
import { fuseShare, urgencyOf } from "../lib/flash.js";
import styles from "./FuseBar.module.css";

function FuseBar({ startsAt, endsAt, animate = false, className = "" }) {
  const now = useServerNow();
  const share = fuseShare(startsAt, endsAt, now);
  const urgency = urgencyOf(Date.parse(endsAt) - now);

  return (
    <div
      className={`${styles.track} ${className}`}
      style={{ "--share": share }}
      data-urgency={urgency}
      data-animate={animate ? "true" : "false"}
      aria-hidden="true"
    >
      <div className={styles.clip}>
        <div className={styles.bar} />
      </div>
      <div className={styles.rail}>
        <span className={styles.spark} />
      </div>
    </div>
  );
}

export default memo(FuseBar);
