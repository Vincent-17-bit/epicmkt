import { cx } from "./cx.js";
import styles from "./Skeleton.module.css";

/**
 * A placeholder shown while data loads. It is hidden from assistive tech on purpose: put
 * aria-busy="true" on the region that is loading, and announce the result when it arrives.
 * variant: rect | text | circle     lines: for text, how many lines (the last one is shorter)
 */
export function Skeleton({ variant = "rect", width, height, lines = 1, className, style }) {
  if (variant === "text") {
    return (
      <span className={cx(styles.stack, className)} style={{ width, ...style }} aria-hidden="true">
        {Array.from({ length: Math.max(1, lines) }, (_, i) => (
          <span key={i} className={cx(styles.block, styles.text)} style={i === lines - 1 && lines > 1 ? { width: "60%" } : undefined} />
        ))}
      </span>
    );
  }
  const size = variant === "circle" ? { width: width ?? height ?? 40, height: height ?? width ?? 40 } : { width, height };
  return <span className={cx(styles.block, variant === "circle" && styles.circle, className)} style={{ ...size, ...style }} aria-hidden="true" />;
}
