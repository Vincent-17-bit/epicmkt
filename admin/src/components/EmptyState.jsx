import { createElement } from "react";
import { cx } from "./cx.js";
import styles from "./EmptyState.module.css";

// Small inline illustrations. They are decorative (aria-hidden) and use only token colours via CSS.
const ART = {
  inbox: (
    <>
      <ellipse className={styles.shadow} cx="60" cy="84" rx="34" ry="5" />
      <path className={styles.fill} d="M22 52 38 26h44l16 26v26a6 6 0 0 1-6 6H28a6 6 0 0 1-6-6z" />
      <path className={styles.line} d="M22 52 38 26h44l16 26v26a6 6 0 0 1-6 6H28a6 6 0 0 1-6-6zM22 52h24a4 4 0 0 1 4 4 10 10 0 0 0 20 0 4 4 0 0 1 4-4h24" />
      <path className={styles.accent} d="M60 14v8M46 18l4 6M74 18l-4 6" />
    </>
  ),
  search: (
    <>
      <ellipse className={styles.shadow} cx="60" cy="84" rx="34" ry="5" />
      <rect className={styles.fill} x="20" y="22" width="56" height="44" rx="6" />
      <path className={styles.line} d="M20 28a6 6 0 0 1 6-6h44a6 6 0 0 1 6 6v32a6 6 0 0 1-6 6H26a6 6 0 0 1-6-6zM32 36h32M32 46h20" />
      <circle className={styles.lens} cx="78" cy="58" r="14" />
      <path className={styles.accent} d="m88 68 12 12" />
    </>
  ),
  list: (
    <>
      <ellipse className={styles.shadow} cx="60" cy="86" rx="32" ry="5" />
      <path className={styles.fill} d="M34 12h52v68l-8-5-9 5-9-5-9 5-9-5-8 5z" />
      <path className={styles.line} d="M34 12h52v68l-8-5-9 5-9-5-9 5-9-5-8 5zM46 30h28M46 42h28M46 54h16" />
    </>
  ),
  error: (
    <>
      <ellipse className={styles.shadow} cx="60" cy="86" rx="32" ry="5" />
      <path className={styles.fill} d="M60 12 100 78H20z" />
      <path className={styles.line} d="M60 12 100 78H20zM60 38v20" />
      <circle className={styles.dot} cx="60" cy="68" r="3" />
    </>
  ),
  lock: (
    <>
      <ellipse className={styles.shadow} cx="60" cy="86" rx="30" ry="5" />
      <path className={styles.line} d="M44 42V32a16 16 0 0 1 32 0v10" />
      <rect className={styles.fill} x="34" y="42" width="52" height="38" rx="8" />
      <rect className={styles.line} x="34" y="42" width="52" height="38" rx="8" />
      <circle className={styles.dot} cx="60" cy="58" r="4" />
      <path className={styles.line} d="M60 62v8" />
    </>
  ),
};

export const EMPTY_ILLUSTRATIONS = Object.keys(ART);

/**
 * illustration: inbox | search | list | error | lock
 * Say what is missing and what to do about it; `action` is usually a Button.
 */
export function EmptyState({ illustration = "inbox", title, description, action, headingLevel = 3, className, ...rest }) {
  return (
    <div className={cx(styles.root, className)} {...rest}>
      <svg className={styles.art} viewBox="0 0 120 96" width="120" height="96" aria-hidden="true" focusable="false">
        {ART[illustration] ?? ART.inbox}
      </svg>
      {createElement(`h${headingLevel}`, { className: styles.title }, title)}
      {description ? <p className={styles.description}>{description}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
