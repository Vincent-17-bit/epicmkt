import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { cx } from "./cx.js";
import { statusMeta } from "./statusMap.js";
import styles from "./Chip.module.css";

/** tone: neutral | info | success | warning | danger. Pass `icon` for anything that carries meaning. */
export function Chip({ tone = "neutral", icon = null, className, children, ...rest }) {
  return (
    <span className={cx(styles.chip, styles[tone], className)} {...rest}>
      {icon ? <span className={styles.icon} aria-hidden="true">{icon}</span> : null}
      <span className={styles.label}>{children}</span>
    </span>
  );
}

/**
 * Shows a status as icon + label + tone. `status` is the raw database value ("under_review");
 * unknown values fall back to a neutral chip with a readable label. `label` overrides the text.
 */
export function StatusChip({ status, label, className, ...rest }) {
  const meta = statusMeta(status);
  return (
    <Chip tone={meta.tone} icon={<FontAwesomeIcon icon={meta.icon} fixedWidth />} className={className} data-status={status} {...rest}>
      {label ?? meta.label}
    </Chip>
  );
}
